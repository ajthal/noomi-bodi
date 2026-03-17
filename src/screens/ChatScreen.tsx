import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  Text,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ChatInputBox, { type PendingImage } from '../components/ChatInputBox';
import ThemedMarkdown from '../components/ThemedMarkdown';
import { styles } from './ChatScreen.styles';
import EditMealModal from '../components/EditMealModal';
import {
  sendMessageToClaude,
  buildChatSystemPrompt,
  parseMealData,
  stripMealMarkers,
  parsePlanText,
  stripPlanMarkers,
  parseSaveMealSuggestion,
  stripSaveMealMarkers,
} from '../services/claude';
import {
  saveMessages,
  loadMessages,
  Message,
  MealData,
  getApiKey,
  loadUserProfile,
  saveUserProfile,
  UserProfile,
} from '../services/storage';
import { logMeal, getDailyTotals, getTodaysMeals } from '../services/mealLog';
import { saveMeal } from '../services/savedMeals';
import { syncWidgetData } from '../services/widgetDataSync';
import { supabase } from '../services/supabase';
import { useDayChange } from '../hooks/useDayChange';
import { useTheme } from '../contexts/ThemeContext';
import { SkeletonText, SkeletonRow } from '../components/SkeletonLoader';
import { getUserFriendlyError } from '../utils/errorMessages';

// In-memory cache: imageUri → base64. Lives for the session so we can
// attach the base64 data to meal entries when the user taps "Log Meal".
const imageBase64Cache = new Map<string, string>();

const noomiAvatar = require('../assets/noomi.png');

function TypingIndicator({ color }: { color: string }) {
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      ),
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [dots]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
            opacity: dot,
          }}
        />
      ))}
    </View>
  );
}

// ── Shared constants ──────────────────────────────────────────────────

const DEFAULT_IMAGE_PROMPT =
  'What is this meal? Please estimate its nutritional content (calories, protein, carbs, fat).';

const QUICK_ACTIONS = [
  {
    id: 'meal-plan',
    label: 'Create meal plan',
    icon: 'calendar-outline' as const,
    color: '#7C3AED',
    prompt: 'Create a 7-day meal plan that hits my macro and calorie goals. Consider my saved meals and preferences.',
  },
  {
    id: 'weekly-review',
    label: 'Weekly review',
    icon: 'trending-up-outline' as const,
    color: '#FF9800',
    prompt: 'Give me a detailed review of my week: how many days I hit my goals, my best and worst days, and specific tips to improve next week.',
  },
  {
    id: 'what-to-eat',
    label: 'What should I eat?',
    icon: 'bulb-outline' as const,
    color: '#2196F3',
    prompt: 'Based on what I\'ve eaten today and my remaining macros, what are 3 good options for my next meal?',
  },
  {
    id: 'my-data',
    label: 'Analyze my data',
    icon: 'analytics-outline' as const,
    color: '#9C27B0',
    prompt: 'Give me a summary of my eating patterns this week. What did I do well and where can I improve?',
  },
];

// ── Custom hook: load initial chat state once on mount ─────────────────

function useChatState() {
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMessages(), getApiKey(), loadUserProfile()]).then(
      ([savedMessages, storedKey, storedProfile]) => {
        if (cancelled) return;
        setMessages(savedMessages);
        setApiKey(storedKey);
        setProfile(storedProfile);
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, messages, setMessages, apiKey, setApiKey, profile, setProfile };
}

// ── Props ─────────────────────────────────────────────────────────────

interface ChatScreenProps {
  refreshTrigger?: number;
  onMealLogged?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────

export default function ChatScreen({
  refreshTrigger,
  onMealLogged,
}: ChatScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const routeName = useRoute().name;



  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingMeal, setEditingMeal] = useState<{
    index: number;
    data: MealData;
  } | null>(null);
  const { ready, messages, setMessages, apiKey, setApiKey, profile, setProfile } =
    useChatState();
  const scrollViewRef = useRef<ScrollView>(null);

  const isFocused = useIsFocused();

  const refreshTotals = useCallback(async () => {
    await getDailyTotals();
  }, []);

  // Re-fetch profile/key when the tab becomes visible.
  useEffect(() => {
    if (!isFocused) return;
    Promise.all([getApiKey(), loadUserProfile()]).then(([key, p]) => {
      setApiKey(key);
      setProfile(p);
    });
    (async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) syncWidgetData(userId);
    })();
  }, [isFocused]);

  // Sync on external refresh trigger (e.g. meal logged on QuickLogPage).
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refreshTotals();
    }
  }, [refreshTrigger, refreshTotals]);

  // Re-fetch context when the day rolls over at midnight or on app resume.
  useDayChange(useCallback(() => {
    Promise.all([getApiKey(), loadUserProfile()]).then(([key, p]) => {
      setApiKey(key);
      setProfile(p);
    });
  }, [setApiKey, setProfile]));

  // Persist messages on every change.
  useEffect(() => {
    if (messages.length > 0) saveMessages(messages);
  }, [messages]);

  // Auto-scroll to newest message.
  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, isLoading]);

  // ── Response processing ────────────────────────────────────────────

  const processResponse = useCallback(
    async (rawResponse: string, currentMessages: Message[]): Promise<Message[]> => {
      let displayText = rawResponse;
      let currentProfile = profile;

      const planText = parsePlanText(rawResponse);
      if (planText && currentProfile) {
        displayText = stripPlanMarkers(displayText);
        const updatedProfile: UserProfile = { ...currentProfile, plan: planText };
        await saveUserProfile(updatedProfile);
        setProfile(updatedProfile);
        currentProfile = updatedProfile;
      }

      const mealData = parseMealData(displayText);
      displayText = stripMealMarkers(displayText);

      const saveSuggestion = parseSaveMealSuggestion(displayText);
      displayText = stripSaveMealMarkers(displayText);

      const assistantMsg: Message = {
        text: displayText,
        role: 'assistant',
        timestamp: Date.now(),
        ...(mealData ? { mealData, mealLogged: false } : {}),
        ...(saveSuggestion ? { saveMealSuggestion: saveSuggestion, mealSaved: false } : {}),
      };

      return [...currentMessages, assistantMsg];
    },
    [profile],
  );

  // ── Unified send (text and/or image) ──────────────────────────────

  const handleSend = async (image: PendingImage | null): Promise<void> => {
    const promptText = input.trim() || (image ? DEFAULT_IMAGE_PROMPT : '');
    if (!promptText && !image) return;

    if (image) imageBase64Cache.set(image.uri, image.base64);

    const userMessage: Message = {
      text: promptText,
      role: 'user',
      timestamp: Date.now(),
      ...(image ? { imageUri: image.uri } : {}),
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const [todayMeals, todayTotals] = await Promise.all([
        getTodaysMeals(),
        getDailyTotals(),
      ]);

      const apiMessages = newMessages.map((msg, i) => {
        if (i === newMessages.length - 1 && image) {
          return {
            role: msg.role,
            content: msg.text,
            imageBase64: image.base64,
            imageMimeType: image.mimeType,
          };
        }
        return { role: msg.role, content: msg.text };
      });

      const rawResponse = await sendMessageToClaude(
        apiMessages,
        apiKey,
        buildChatSystemPrompt(profile, { meals: todayMeals, totals: todayTotals }),
      );
      setMessages(await processResponse(rawResponse, newMessages));
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages([
        ...newMessages,
        { text: getUserFriendlyError(error), role: 'assistant', timestamp: Date.now() },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Meal logging ───────────────────────────────────────────────────

  const findPrecedingImageMessage = (assistantIndex: number): Message | undefined => {
    for (let i = assistantIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].imageUri) return messages[i];
      if (messages[i].role === 'assistant') break;
    }
    return undefined;
  };

  const handleLogMeal = async (msgIndex: number, editedData?: MealData) => {
    const msg = messages[msgIndex];
    const mealData = editedData || msg.mealData;
    if (!mealData) return;

    const imageMsg = findPrecedingImageMessage(msgIndex);
    const imgUri = imageMsg?.imageUri;
    const imgBase64 = imgUri ? imageBase64Cache.get(imgUri) : undefined;
    await logMeal(mealData, imgUri, imgBase64);

    const updated = [...messages];
    updated[msgIndex] = { ...msg, mealData, mealLogged: true };
    setMessages(updated);
    setEditingMeal(null);
    await refreshTotals();
    onMealLogged?.();

    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) await syncWidgetData(userId);

    Alert.alert('Meal Logged', `${mealData.name} (${mealData.calories} cal) has been added to today's log.`);
  };

  // ── Save to meal library ───────────────────────────────────────────

  const handleSaveMeal = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    const data = msg.saveMealSuggestion;
    if (!data) return;

    try {
      await saveMeal({
        name: data.name,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
      });
      const updated = [...messages];
      updated[msgIndex] = { ...msg, mealSaved: true };
      setMessages(updated);
      Alert.alert('Saved', `"${data.name}" has been added to your meal library.`);
    } catch (e) {
      console.error('Failed to save meal to library:', e);
      Alert.alert('Error', getUserFriendlyError(e));
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────

  const renderMealActions = (msg: Message, index: number) => {
    if (msg.role !== 'assistant') return null;

    const hasMealData = !!msg.mealData;
    const hasSaveSuggestion = !!msg.saveMealSuggestion;
    if (!hasMealData && !hasSaveSuggestion) return null;

    return (
      <View style={styles.mealActions}>
        {hasMealData && (
          <>
            <Text style={[styles.mealSummary, { color: colors.textSecondary }]}>
              {msg.mealData!.calories} cal · {msg.mealData!.protein}g P · {msg.mealData!.carbs}g C · {msg.mealData!.fat}g F
            </Text>
            {msg.mealLogged ? (
              <View style={styles.mealLoggedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                <Text style={styles.mealLoggedText}>Logged</Text>
              </View>
            ) : (
              <View style={styles.mealActionButtons}>
                <TouchableOpacity style={styles.logMealButton} onPress={() => handleLogMeal(index)}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.logMealButtonText}>Log Meal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editMealButton}
                  onPress={() => setEditingMeal({ index, data: msg.mealData! })}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.accent} />
                  <Text style={styles.editMealButtonText}>Edit & Log</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
        {hasSaveSuggestion && (
          <View style={styles.saveMealRow}>
            {msg.mealSaved ? (
              <View style={styles.mealLoggedBadge}>
                <Ionicons name="bookmark" size={14} color="#FF9800" />
                <Text style={[styles.mealLoggedText, { color: '#FF9800' }]}>Saved to library</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.saveMealButton} onPress={() => handleSaveMeal(index)}>
                <Ionicons name="bookmark-outline" size={16} color="#FF9800" />
                <Text style={styles.saveMealButtonText}>Save to Meals</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // ── JSX ────────────────────────────────────────────────────────────

  const isStandaloneScreen = routeName === 'ChatScreen';

  const screenHeader = isStandaloneScreen ? (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Chat</Text>
        <View style={{ width: 26 }} />
      </View>
    </SafeAreaView>
  ) : (
    <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.borderLight }]}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Chat</Text>
    </View>
  );

  if (!ready) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        {screenHeader}
        <View style={{ padding: 20 }}>
          <SkeletonText lines={2} style={{ marginBottom: 24 }} />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {screenHeader}

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Image source={noomiAvatar} style={{ width: 80, height: 80, borderRadius: 40 }} />
              <Text style={[styles.emptyTitle, { color: colors.textTertiary }]}>Chat with Noomi</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                Have a detailed conversation about your meals, nutrition goals, or snap a photo for analysis.
              </Text>
            </View>
          )}
          {messages.map((msg, index) => (
            <View
              key={index}
              style={[
                styles.messageContainer,
                msg.role === 'user'
                  ? [styles.userMessage, { backgroundColor: colors.userBubble }]
                  : [styles.assistantMessage, { backgroundColor: colors.assistantBubble }],
              ]}
            >
              {msg.role === 'assistant' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Image source={noomiAvatar} style={{ width: 22, height: 22, borderRadius: 11 }} />
                  <Text style={[styles.role, { color: colors.textSecondary, marginBottom: 0 }]}>Noomi</Text>
                </View>
              ) : (
                <Text style={[styles.role, { color: colors.textSecondary }]}>You</Text>
              )}
              {msg.imageUri && (
                <Image source={{ uri: msg.imageUri }} style={styles.messageImage} resizeMode="cover" />
              )}
              {msg.role === 'assistant' ? (
                <ThemedMarkdown>{msg.text}</ThemedMarkdown>
              ) : (
                <Text style={[styles.message, { color: colors.text }]}>{msg.text}</Text>
              )}
              {renderMealActions(msg, index)}
            </View>
          ))}
          {isLoading && (
            <View style={[styles.messageContainer, styles.assistantMessage, { backgroundColor: colors.assistantBubble }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Image source={noomiAvatar} style={{ width: 22, height: 22, borderRadius: 11 }} />
                <Text style={[styles.role, { color: colors.textSecondary, marginBottom: 0 }]}>Noomi</Text>
              </View>
              <TypingIndicator color={colors.accent} />
            </View>
          )}
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={[styles.inputSafeArea, { backgroundColor: colors.background }]}>
          {!apiKey && (
            <View style={styles.apiKeyHint}>
              <Text style={[styles.apiKeyHintText, { color: colors.error }]}>
                Please add your Claude API key in Profile to start chatting.
              </Text>
            </View>
          )}
          {apiKey && !isLoading && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickActionsRow}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.id}
                  style={[styles.quickActionChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => { setInput(action.prompt); }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={action.icon} size={14} color={action.color} />
                  <Text style={[styles.quickActionText, { color: colors.text }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <ChatInputBox
            value={input}
            onChangeText={setInput}
            onSend={handleSend}
            disabled={isLoading || !apiKey}
            placeholder="Type a message..."
          />
        </SafeAreaView>
      </KeyboardAvoidingView>

      {editingMeal && (
        <EditMealModal
          visible={!!editingMeal}
          initialData={editingMeal.data}
          onSave={(edited) => handleLogMeal(editingMeal.index, edited)}
          onCancel={() => setEditingMeal(null)}
        />
      )}
    </View>
  );
}
