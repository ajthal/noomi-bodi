import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import BottomSheet from './BottomSheet';
import ChatInputBox, { type PendingImage } from './ChatInputBox';
import { ErrorState } from './ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import ThemedMarkdown from './ThemedMarkdown';
import {
  sendMessageToClaude,
  buildChatSystemPrompt,
  parseMealData,
  stripMealMarkers,
} from '../services/claude';
import { MealData, getApiKey, loadUserProfile } from '../services/storage';
import { getTodaysMeals, getDailyTotals } from '../services/mealLog';

interface Props {
  visible: boolean;
  onGenerated: (data: { name: string; calories: number; protein: number; carbs: number; fat: number; notes: string }) => void;
  onCancel: () => void;
}

const PRESET_TAGS = [
  { label: 'High protein', value: 'high protein' },
  { label: 'Low carb', value: 'low carb' },
  { label: 'Quick & easy', value: 'quick and easy to prepare' },
  { label: 'Vegetarian', value: 'vegetarian' },
  { label: 'Under 400 cal', value: 'under 400 calories' },
  { label: 'Breakfast', value: 'breakfast' },
  { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' },
  { label: 'Snack', value: 'a snack' },
];

const BUILD_PROMPT = (description: string, hasImage: boolean) =>
  (hasImage
    ? `Look at this image of a meal and create a saved-meal entry based on it and my request: "${description}". `
    : `Design a specific meal based on this request: "${description}". `) +
  'Return the meal with:\n' +
  '1. A clear meal name\n' +
  '2. A [MEAL_DATA] block with accurate macro estimates\n' +
  '3. A brief recipe/description with ingredients and portion size (2-3 sentences max)\n\n' +
  'This meal will be saved to my meal library for repeated use, so make it practical and concrete. ' +
  'Return ONLY the [MEAL_DATA] block followed by the brief recipe. No other text.';

export default function AIMealBuilderModal({ visible, onGenerated, onCancel }: Props) {
  const { colors } = useTheme();
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ mealData: MealData; recipe: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);

  const toggleTag = (value: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const buildQuery = (): string => {
    const parts: string[] = [];
    if (selectedTags.size > 0) parts.push(Array.from(selectedTags).join(', '));
    if (description.trim()) parts.push(description.trim());
    if (parts.length === 0) return 'a healthy meal that fits my macros';
    return parts.join(' — ');
  };

  const handleGenerate = async (imageFromInput?: PendingImage | null) => {
    const imageToUse = imageFromInput ?? pendingImage;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const [apiKey, profile, meals, totals] = await Promise.all([
        getApiKey(),
        loadUserProfile(),
        getTodaysMeals(),
        getDailyTotals(),
      ]);

      if (!apiKey) {
        setError('Add your Claude API key in Profile settings first.');
        return;
      }

      const query = buildQuery();
      const message: { role: string; content: string; imageBase64?: string; imageMimeType?: string } = {
        role: 'user',
        content: BUILD_PROMPT(query, !!imageToUse),
      };
      if (imageToUse) {
        message.imageBase64 = imageToUse.base64;
        message.imageMimeType = imageToUse.mimeType;
      }

      const response = await sendMessageToClaude(
        [message],
        apiKey,
        buildChatSystemPrompt(profile, { meals, totals }),
      );

      const mealData = parseMealData(response);
      if (!mealData) {
        setError('Could not generate a meal. Try rephrasing your request.');
        return;
      }

      const recipe = stripMealMarkers(response).trim();
      setResult({ mealData, recipe });
    } catch (e) {
      console.error('AI meal builder error:', e);
      setError(getUserFriendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    if (!result) return;
    onGenerated({
      name: result.mealData.name,
      calories: result.mealData.calories,
      protein: result.mealData.protein,
      carbs: result.mealData.carbs,
      fat: result.mealData.fat,
      notes: result.recipe,
    });
    resetState();
  };

  const resetState = () => {
    setDescription('');
    setSelectedTags(new Set());
    setResult(null);
    setError(null);
    setLoading(false);
    setPendingImage(null);
  };

  const handleClose = () => {
    resetState();
    onCancel();
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <Text style={[s.title, { color: colors.text }]}>Build a Meal with AI</Text>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!result ? (
          <>
            <Text style={[s.label, { color: colors.textSecondary }]}>What kind of meal?</Text>
            <View style={s.tagsWrap}>
              {PRESET_TAGS.map(tag => {
                const active = selectedTags.has(tag.value);
                return (
                  <TouchableOpacity
                    key={tag.value}
                    style={[
                      s.tag,
                      {
                        backgroundColor: active ? '#7C3AED' : colors.surface,
                        borderColor: active ? '#7C3AED' : colors.border,
                      },
                    ]}
                    onPress={() => toggleTag(tag.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.tagText, { color: active ? '#fff' : colors.text }]}>{tag.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[s.label, { color: colors.textSecondary, marginTop: 16 }]}>
              Describe what you want (or attach a photo)
            </Text>
            <ChatInputBox
              value={description}
              onChangeText={setDescription}
              onSend={(img) => {
                if (img) setPendingImage(img);
                handleGenerate(img);
              }}
              placeholder='e.g. "chicken and rice" or "no dairy"'
              disabled={loading}
              sendIcon="sparkles"
            />

            {error && (
              <ErrorState message={error} compact onRetry={() => { setError(null); handleGenerate(); }} />
            )}

            {loading && (
              <View style={s.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={[s.loadingText, { color: colors.textSecondary }]}>Building meal...</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={[s.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[s.resultName, { color: colors.text }]}>{result.mealData.name}</Text>
              <View style={s.macroRow}>
                <MacroPill label="Cal" value={result.mealData.calories} color="#7C3AED" labelColor={colors.textSecondary} />
                <MacroPill label="P" value={result.mealData.protein} unit="g" color="#2196F3" labelColor={colors.textSecondary} />
                <MacroPill label="C" value={result.mealData.carbs} unit="g" color="#FF9800" labelColor={colors.textSecondary} />
                <MacroPill label="F" value={result.mealData.fat} unit="g" color="#9C27B0" labelColor={colors.textSecondary} />
              </View>
              {result.recipe ? (
                <View style={s.recipeWrap}>
                  <ThemedMarkdown fontSize={14} lineHeight={20}>{result.recipe}</ThemedMarkdown>
                </View>
              ) : null}
            </View>

            <View style={s.resultActions}>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.7}>
                <Ionicons name="bookmark" size={18} color="#fff" />
                <Text style={s.saveBtnText}>Save to Meals</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.retryBtn, { borderColor: colors.border }]}
                onPress={() => setResult(null)}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh" size={18} color={colors.accent} />
                <Text style={[s.retryBtnText, { color: colors.accent }]}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function MacroPill({ label, value, unit, color, labelColor }: {
  label: string; value: number; unit?: string; color: string; labelColor: string;
}) {
  return (
    <View style={[s.pill, { borderColor: color + '40' }]}>
      <Text style={[s.pillValue, { color }]}>{value}{unit || ''}</Text>
      <Text style={[s.pillLabel, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
  },
  resultName: {
    fontSize: 18,
    fontWeight: '700',
  },
  macroRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  pill: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 6,
    alignItems: 'center',
  },
  pillValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  pillLabel: {
    fontSize: 10,
    marginTop: 1,
  },
  recipeWrap: {
    marginTop: 12,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  retryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
