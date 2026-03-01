import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import {
  sendMessageToClaude,
  buildChatSystemPrompt,
  parseMealData,
} from '../services/claude';
import { MealData, getApiKey, loadUserProfile, estimateDailyGoals } from '../services/storage';
import { getTodaysMeals, getDailyTotals, logMeal } from '../services/mealLog';
import { syncWidgetData } from '../services/widgetDataSync';
import { supabase } from '../services/supabase';

interface Recommendation {
  name: string;
  portion: string;
  mealData: MealData | null;
  logged: boolean;
}

interface Props {
  onMealLogged: () => void;
}

const RECS_PROMPT =
  'Based on my remaining macros for today, suggest 3 quick meal or snack options that would help me hit my goals. ' +
  'Prioritize whichever macro I\'m furthest from. ' +
  'For each meal, output ONLY: the [MEAL_DATA] block, then on the next line [PORTION]recommended serving size[/PORTION]. ' +
  'Example:\n[MEAL_DATA]{"name":"Greek Yogurt Bowl","calories":220,"protein":25,"carbs":28,"fat":2}[/MEAL_DATA]\n[PORTION]1 cup plain Greek yogurt with 1/2 cup granola[/PORTION]\n' +
  'Do NOT include any other text, numbering, or descriptions — just the meal data and portion markers for each of the 3 meals.';

export default function SmartRecommendations({ onMealLogged }: Props) {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [remaining, setRemaining] = useState<{ calories: number; protein: number; carbs: number; fat: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const hasAutoFetched = useRef(false);

  const fetchRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const [apiKey, profile, meals, totals] = await Promise.all([
        getApiKey(),
        loadUserProfile(),
        getTodaysMeals(),
        getDailyTotals(),
      ]);

      if (!apiKey || !profile) {
        setLoading(false);
        return;
      }

      const goals = estimateDailyGoals(profile);
      const rem = {
        calories: Math.max(0, goals.calories - totals.calories),
        protein: Math.max(0, goals.protein - totals.protein),
        carbs: Math.max(0, goals.carbs - totals.carbs),
        fat: Math.max(0, goals.fat - totals.fat),
      };
      setRemaining(rem);

      if (rem.calories < 100 && rem.protein < 10) {
        setRecs([]);
        setLoading(false);
        return;
      }

      const response = await sendMessageToClaude(
        [{ role: 'user', content: RECS_PROMPT }],
        apiKey,
        buildChatSystemPrompt(profile, { meals, totals }),
      );

      const sections = response.split(/(?=\[MEAL_DATA\])/);
      const parsed: Recommendation[] = [];

      for (const section of sections) {
        const mealData = parseMealData(section);
        if (mealData) {
          const portionMatch = section.match(/\[PORTION\]([\s\S]*?)\[\/PORTION\]/);
          parsed.push({
            name: mealData.name,
            portion: portionMatch ? portionMatch[1].trim() : '',
            mealData,
            logged: false,
          });
        }
      }

      setRecs(parsed.slice(0, 3));
    } catch (err) {
      console.error('SmartRecommendations error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLog = async (index: number) => {
    const rec = recs[index];
    if (!rec.mealData) return;
    try {
      await logMeal(rec.mealData, undefined, undefined);
      setRecs(prev => prev.map((r, i) => i === index ? { ...r, logged: true } : r));
      onMealLogged();
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) await syncWidgetData(userId);
    } catch {
      Alert.alert('Error', 'Failed to log the meal.');
    }
  };

  const handleToggle = useCallback(() => {
    if (!visible && recs.length === 0 && !loading && !hasAutoFetched.current) {
      hasAutoFetched.current = true;
      fetchRecommendations();
    }
    setVisible(v => !v);
  }, [visible, recs.length, loading, fetchRecommendations]);

  if (!visible) {
    return (
      <TouchableOpacity
        style={[s.toggleBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={handleToggle}
        activeOpacity={0.7}
      >
        <Ionicons name="bulb-outline" size={18} color="#FF9800" />
        <Text style={[s.toggleText, { color: colors.text }]}>What should I eat?</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <Ionicons name="bulb" size={18} color="#FF9800" />
          <Text style={[s.headerTitle, { color: colors.text }]}>Smart Suggestions</Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={fetchRecommendations} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="refresh" size={18} color={loading ? colors.textTertiary : colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-up" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {remaining && (
        <Text style={[s.remainingText, { color: colors.textSecondary }]}>
          Remaining: {remaining.calories} cal · {remaining.protein}g P · {remaining.carbs}g C · {remaining.fat}g F
        </Text>
      )}

      {loading ? (
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[s.loadingText, { color: colors.textSecondary }]}>Getting suggestions...</Text>
        </View>
      ) : recs.length === 0 ? (
        <Text style={[s.emptyText, { color: colors.textTertiary }]}>
          {remaining && remaining.calories < 100
            ? "You're close to your goals — nice work!"
            : 'Tap refresh to get meal ideas.'}
        </Text>
      ) : (
        recs.map((rec, i) => (
          <View key={i} style={[s.recCard, { backgroundColor: isDark ? '#252525' : '#f5f5f5' }]}>
            <View style={s.recContent}>
              <Text style={[s.recName, { color: colors.text }]}>{rec.name}</Text>
              {rec.mealData && (
                <Text style={[s.recMacros, { color: colors.textSecondary }]}>
                  {rec.mealData.calories} cal · {rec.mealData.protein}g P · {rec.mealData.carbs}g C · {rec.mealData.fat}g F
                </Text>
              )}
              {rec.portion ? (
                <View style={s.portionRow}>
                  <Ionicons name="resize-outline" size={12} color={colors.textTertiary} />
                  <Text style={[s.portionText, { color: colors.textTertiary }]}>{rec.portion}</Text>
                </View>
              ) : null}
            </View>
            {rec.logged ? (
              <View style={s.loggedBadge}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              </View>
            ) : rec.mealData ? (
              <TouchableOpacity style={s.quickAddBtn} onPress={() => handleLog(i)}>
                <Ionicons name="add-circle" size={24} color="#4CAF50" />
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  toggleText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  container: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  remainingText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    justifyContent: 'center',
    paddingVertical: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
    paddingVertical: 6,
  },
  recCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  recContent: {
    flex: 1,
  },
  recName: {
    fontSize: 15,
    fontWeight: '600',
  },
  recMacros: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  portionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  portionText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  quickAddBtn: {
    marginLeft: 10,
    padding: 4,
  },
  loggedBadge: {
    marginLeft: 10,
    padding: 4,
  },
});
