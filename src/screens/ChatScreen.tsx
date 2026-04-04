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
  AppState,
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
  parseAllMealData,
  stripMealMarkers,
  parsePlanText,
  stripPlanMarkers,
  parseSaveMealSuggestion,
  parseAllSaveMealSuggestions,
  stripSaveMealMarkers,
  windowMessages,
  summarizeDroppedMessages,
  type ChatMessage,
} from '../services/claude';
import {
  saveMessages,
  loadMessages,
  Message,
  MealData,
  getApiKey,
  loadUserProfile,
  saveUserPlan,
  estimateDailyGoals,
  parseMacrosFromPlanText,
  UserProfile,
  saveConversationSummary,
  loadConversationSummary,
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

// ── Chat image with fallback for stale URIs ──────────────────────────

function ChatImage({ uri }: { uri: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[styles.messageImage, { backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="image-outline" size={32} color={colors.textTertiary} />
        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>Photo unavailable</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.messageImage}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// ── Shared constants ──────────────────────────────────────────────────

const DEFAULT_IMAGE_PROMPT =
  'Objectively identify this food and estimate its nutritional content (calories, protein, carbs, fat). Do NOT assume it matches any previously logged meals — analyze what you actually see in the image.';

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
  const [conversationSummary, setConversationSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMessages(), getApiKey(), loadUserProfile(), loadConversationSummary()]).then(
      ([savedMessages, storedKey, storedProfile, storedSummary]) => {
        if (cancelled) return;
        setMessages(savedMessages);
        setApiKey(storedKey);
        setProfile(storedProfile);
        setConversationSummary(storedSummary);
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, messages, setMessages, apiKey, setApiKey, profile, setProfile, conversationSummary, setConversationSummary };
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
  const { ready, messages, setMessages, apiKey, setApiKey, profile, setProfile, conversationSummary, setConversationSummary } =
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

  // Ensure in-flight requests survive app backgrounding: when the user returns
  // from background while loading, the request may have completed or timed out.
  // We keep a ref so the async callback can update state even when backgrounded.
  const isLoadingRef = useRef(false);
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isLoadingRef.current) {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }
    });
    return () => sub.remove();
  }, []);

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
        const fallbackGoals = estimateDailyGoals(currentProfile);
        const parsedGoals = parseMacrosFromPlanText(planText, fallbackGoals) ?? fallbackGoals;
        await saveUserPlan(currentProfile, planText, parsedGoals);
        const updatedProfile: UserProfile = {
          ...currentProfile,
          plan: planText,
          dailyGoals: parsedGoals,
        };
        setProfile(updatedProfile);
        currentProfile = updatedProfile;
      }

      const mealDataList = parseAllMealData(displayText);
      displayText = stripMealMarkers(displayText);

      const saveMealList = parseAllSaveMealSuggestions(displayText);
      displayText = stripSaveMealMarkers(displayText);

      // Backward compat: also set legacy single-item fields
      const mealData = mealDataList[0] || null;
      const saveSuggestion = saveMealList[0] || null;

      const assistantMsg: Message = {
        text: displayText,
        role: 'assistant',
        timestamp: Date.now(),
        ...(mealData ? { mealData, mealLogged: false } : {}),
        ...(mealDataList.length > 0 ? {
          mealDataList,
          mealLoggedList: mealDataList.map(() => false),
          mealLogIds: mealDataList.map(() => null),
        } : {}),
        ...(saveSuggestion ? { saveMealSuggestion: saveSuggestion, mealSaved: false } : {}),
        ...(saveMealList.length > 0 ? {
          saveMealList,
          mealSavedList: saveMealList.map(() => false),
        } : {}),
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

      let systemPrompt = buildChatSystemPrompt(profile, { meals: todayMeals, totals: todayTotals });

      const allApiMessages: ChatMessage[] = newMessages.map((msg, i) => {
        if (i === newMessages.length - 1 && image) {
          return {
            role: msg.role as 'user' | 'assistant',
            content: msg.text,
            imageBase64: image.base64,
            imageMimeType: image.mimeType,
          };
        }
        return { role: msg.role as 'user' | 'assistant', content: msg.text };
      });

      const systemTokens = Math.ceil(systemPrompt.length / 4);
      const { kept, dropped } = windowMessages(allApiMessages, systemTokens);

      if (dropped.length > 0 && apiKey) {
        const newSummary = await summarizeDroppedMessages(dropped, conversationSummary, apiKey);
        setConversationSummary(newSummary);
        saveConversationSummary(newSummary);
        systemPrompt += `\n\n**Summary of earlier conversation**\n${newSummary}`;
      } else if (conversationSummary) {
        systemPrompt += `\n\n**Summary of earlier conversation**\n${conversationSummary}`;
      }

      const rawResponse = await sendMessageToClaude(
        kept,
        apiKey,
        systemPrompt,
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

  const handleLogMeal = async (msgIndex: number, editedData?: MealData, mealListIndex?: number) => {
    const msg = messages[msgIndex];
    const listIdx = mealListIndex ?? 0;
    const mealData = editedData || msg.mealDataList?.[listIdx] || msg.mealData;
    if (!mealData) return;

    const imageMsg = findPrecedingImageMessage(msgIndex);
    const imgUri = imageMsg?.imageUri;
    const imgBase64 = imgUri ? imageBase64Cache.get(imgUri) : undefined;
    const entry = await logMeal(mealData, imgUri, imgBase64);

    const updated = [...messages];
    const updatedMsg = { ...msg };

    // Update multi-meal list state
    if (updatedMsg.mealDataList && updatedMsg.mealLoggedList) {
      updatedMsg.mealLoggedList = [...updatedMsg.mealLoggedList];
      updatedMsg.mealLoggedList[listIdx] = true;
      updatedMsg.mealLogIds = [...(updatedMsg.mealLogIds || updatedMsg.mealDataList.map(() => null))];
      updatedMsg.mealLogIds[listIdx] = entry.id;
      if (editedData) {
        updatedMsg.mealDataList = [...updatedMsg.mealDataList];
        updatedMsg.mealDataList[listIdx] = editedData;
      }
    }

    // Legacy single-item compat
    if (listIdx === 0) {
      updatedMsg.mealData = mealData;
      updatedMsg.mealLogged = true;
    }

    updated[msgIndex] = updatedMsg;
    setMessages(updated);
    setEditingMeal(null);
    await refreshTotals();
    onMealLogged?.();

    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) await syncWidgetData(userId);

    Alert.alert('Meal Logged', `${mealData.name} (${mealData.calories} cal) has been added to today's log.`);
  };

  // ── Save to meal library ───────────────────────────────────────────

  const handleSaveMeal = async (msgIndex: number, saveListIndex?: number) => {
    const msg = messages[msgIndex];
    const listIdx = saveListIndex ?? 0;
    const data = msg.saveMealList?.[listIdx] || msg.saveMealSuggestion;
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
      const updatedMsg = { ...msg };

      if (updatedMsg.saveMealList && updatedMsg.mealSavedList) {
        updatedMsg.mealSavedList = [...updatedMsg.mealSavedList];
        updatedMsg.mealSavedList[listIdx] = true;
      }
      if (listIdx === 0) updatedMsg.mealSaved = true;

      updated[msgIndex] = updatedMsg;
      setMessages(updated);
      Alert.alert('Saved', `"${data.name}" has been added to your meal library.`);
    } catch (e) {
      console.error('Failed to save meal to library:', e);
      Alert.alert('Error', getUserFriendlyError(e));
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────

  const handleReplaceMeal = async (msgIndex: number, mealListIndex: number) => {
    const msg = messages[msgIndex];
    const logId = msg.mealLogIds?.[mealListIndex];
    const mealData = msg.mealDataList?.[mealListIndex];
    if (!logId || !mealData) return;

    Alert.alert(
      'Replace Meal',
      `Delete the logged entry for "${mealData.name}" and log a corrected version?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          onPress: async () => {
            try {
              const { deleteMeal: deleteMealFn } = require('../services/mealLog');
              await deleteMealFn(logId);
              const updated = [...messages];
              const updatedMsg = { ...msg };
              if (updatedMsg.mealLoggedList) {
                updatedMsg.mealLoggedList = [...updatedMsg.mealLoggedList];
                updatedMsg.mealLoggedList[mealListIndex] = false;
              }
              if (updatedMsg.mealLogIds) {
                updatedMsg.mealLogIds = [...updatedMsg.mealLogIds];
                updatedMsg.mealLogIds[mealListIndex] = null;
              }
              if (mealListIndex === 0) updatedMsg.mealLogged = false;
              updated[msgIndex] = updatedMsg;
              setMessages(updated);
              await refreshTotals();
              onMealLogged?.();
              setEditingMeal({ index: msgIndex, data: mealData, listIndex: mealListIndex } as any);
            } catch (e) {
              Alert.alert('Error', getUserFriendlyError(e));
            }
          },
        },
      ],
    );
  };

  const renderMealActions = (msg: Message, index: number) => {
    if (msg.role !== 'assistant') return null;

    const mealList = msg.mealDataList ?? (msg.mealData ? [msg.mealData] : []);
    const loggedList = msg.mealLoggedList ?? (msg.mealLogged != null ? [msg.mealLogged] : []);
    const saveList = msg.saveMealList ?? (msg.saveMealSuggestion ? [msg.saveMealSuggestion] : []);
    const savedList = msg.mealSavedList ?? (msg.mealSaved != null ? [msg.mealSaved] : []);

    if (mealList.length === 0 && saveList.length === 0) return null;

    return (
      <View style={styles.mealActions}>
        {mealList.map((meal, mi) => (
          <View key={`meal-${mi}`}>
            <Text style={[styles.mealSummary, { color: colors.textSecondary }]}>
              {meal.name}: {meal.calories} cal · {meal.protein}g P · {meal.carbs}g C · {meal.fat}g F
            </Text>
            {loggedList[mi] ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.mealLoggedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.accent} />
                  <Text style={styles.mealLoggedText}>Logged</Text>
                </View>
                <TouchableOpacity onPress={() => handleReplaceMeal(index, mi)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.accent, fontWeight: '600' }}>Replace</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.mealActionButtons}>
                <TouchableOpacity style={styles.logMealButton} onPress={() => handleLogMeal(index, undefined, mi)}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.logMealButtonText}>Log Meal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.editMealButton}
                  onPress={() => setEditingMeal({ index, data: meal, listIndex: mi } as any)}
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.accent} />
                  <Text style={styles.editMealButtonText}>Edit & Log</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
        {saveList.map((saveMeal, si) => (
          <View key={`save-${si}`} style={styles.saveMealRow}>
            {savedList[si] ? (
              <View style={styles.mealLoggedBadge}>
                <Ionicons name="bookmark" size={14} color="#FF9800" />
                <Text style={[styles.mealLoggedText, { color: '#FF9800' }]}>Saved to library</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.saveMealButton} onPress={() => handleSaveMeal(index, si)}>
                <Ionicons name="bookmark-outline" size={16} color="#FF9800" />
                <Text style={styles.saveMealButtonText}>Save "{saveMeal.name}"</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
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
                <ChatImage uri={msg.imageUri} />
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
          onSave={(edited) => handleLogMeal(editingMeal.index, edited, (editingMeal as any).listIndex)}
          onCancel={() => setEditingMeal(null)}
        />
      )}
    </View>
  );
}
