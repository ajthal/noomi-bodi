import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  ActionSheetIOS,
  StyleSheet,
  TextInput,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  launchImageLibrary,
  launchCamera,
  type ImagePickerResponse,
  type CameraOptions,
} from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import DailyTotals from '../components/DailyTotals';
import EditMealModal from '../components/EditMealModal';
import {
  sendMessageToClaude,
  buildChatSystemPrompt,
  parseMealData,
  stripMealMarkers,
  parseSaveMealSuggestion,
  stripSaveMealMarkers,
  type DailyContext,
} from '../services/claude';
import {
  MealData,
  getApiKey,
  loadUserProfile,
  estimateDailyGoals,
  MacroGoals,
  UserProfile,
} from '../services/storage';
import {
  logMeal,
  getTodaysMeals,
  getDailyTotals,
  deleteMeal,
  MealEntry,
  DailyMacroTotals,
} from '../services/mealLog';
import { saveMeal } from '../services/savedMeals';
import { logWeight as logWeightApi, getWeightLogs, WeightLog } from '../services/reportData';
import { syncWidgetData } from '../services/widgetDataSync';
import { supabase } from '../services/supabase';
import { lbsToKg, kgToLbs } from '../utils/units';
import { LineChart } from 'react-native-chart-kit';
import { useDayChange } from '../hooks/useDayChange';
import { useDeepLink } from '../hooks/useDeepLink';
import { useTheme } from '../contexts/ThemeContext';
import SmartRecommendations from '../components/SmartRecommendations';
import ThemedMarkdown from '../components/ThemedMarkdown';
import { SkeletonCard, SkeletonText, SkeletonRow } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useStaleFetch } from '../hooks/useStaleFetch';

// ── Constants ────────────────────────────────────────────────────────

const IMAGE_PICKER_OPTIONS: CameraOptions = {
  mediaType: 'photo',
  quality: 0.7,
  maxWidth: 1024,
  maxHeight: 1024,
  includeBase64: true,
};

interface PendingResult {
  imageUri: string;
  imageBase64: string;
  imageMimeType: string;
  mealData: MealData;
  description: string;
  saveMealSuggestion: MealData | null;
}

interface Props {
  refreshTrigger?: number;
  onMealLogged?: () => void;
}

// ── Component ────────────────────────────────────────────────────────

export default function QuickLogPage({
  refreshTrigger = 0,
  onMealLogged = () => {},
}: Props): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [goals, setGoals] = useState<MacroGoals | null>(null);
  const [totals, setTotals] = useState<DailyMacroTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 });
  const [todaysMeals, setTodaysMeals] = useState<MealEntry[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [mealLogged, setMealLogged] = useState(false);
  const [mealSaved, setMealSaved] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [loggingWeight, setLoggingWeight] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [weekWeights, setWeekWeights] = useState<WeightLog[]>([]);
  const isFocused = useIsFocused();
  const { width: screenWidth } = useWindowDimensions();

  // ── Data loading ──────────────────────────────────────────────────

  const refresh = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setLoadError(null);
    try {
      const [key, prof, meals, daily, ww] = await Promise.all([
        getApiKey(),
        loadUserProfile(),
        getTodaysMeals(),
        getDailyTotals(),
        getWeightLogs(7),
      ]);
      setApiKey(key);
      setProfile(prof);
      if (prof) setGoals(estimateDailyGoals(prof));
      setTodaysMeals(meals);
      setTotals(daily);
      setWeekWeights(ww);
    } catch (e) {
      console.error('QuickLogPage refresh error:', e);
      setLoadError(getUserFriendlyError(e));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  const { fetchIfStale, forceFetch, markStale } = useStaleFetch(refresh, 15_000);

  useEffect(() => {
    if (isFocused) fetchIfStale();
  }, [isFocused, fetchIfStale]);

  // Cross-screen invalidation: when ChatScreen logs a meal, refreshTrigger increments
  useEffect(() => {
    if (refreshTrigger > 0) markStale();
  }, [refreshTrigger, markStale]);

  useEffect(() => {
    if (!isFocused) return;
    (async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) syncWidgetData(userId);
    })();
  }, [isFocused]);

  useDayChange(refresh);

  // ── Image handling ────────────────────────────────────────────────

  const handleImageResult = useCallback(async (response: ImagePickerResponse) => {
    if (response.didCancel || response.errorCode) return;
    const asset = response.assets?.[0];
    if (!asset?.base64 || !asset.uri) {
      Alert.alert('Error', 'Could not process the image.');
      return;
    }

    setAnalyzing(true);
    setMealLogged(false);
    setMealSaved(false);
    setDescExpanded(false);

    try {
      const daily: DailyContext = { meals: todaysMeals, totals };
      const systemPrompt = buildChatSystemPrompt(profile, daily);
      const reply = await sendMessageToClaude(
        [{
          role: 'user',
          content: 'What is this meal? Estimate its nutritional content.',
          imageBase64: asset.base64,
          imageMimeType: asset.type || 'image/jpeg',
        }],
        apiKey,
        systemPrompt,
      );

      const mealData = parseMealData(reply);
      if (!mealData) {
        Alert.alert('Could not analyze', 'Claude could not estimate the nutritional content of this image. Try a clearer photo.');
        setAnalyzing(false);
        return;
      }

      const saveSuggestion = parseSaveMealSuggestion(reply);
      const description = stripSaveMealMarkers(stripMealMarkers(reply)).trim();

      setPendingResult({
        imageUri: asset.uri,
        imageBase64: asset.base64,
        imageMimeType: asset.type || 'image/jpeg',
        mealData,
        description,
        saveMealSuggestion: saveSuggestion,
      });
    } catch (e: any) {
      console.error('Image analysis error:', e);
      Alert.alert('Error', getUserFriendlyError(e));
    } finally {
      setAnalyzing(false);
    }
  }, [apiKey, profile, goals, totals, todaysMeals]);

  const handleAddPhoto = useCallback(() => {
    if (!apiKey) return;
    const pick = () => launchImageLibrary(IMAGE_PICKER_OPTIONS, handleImageResult);
    const take = () => launchCamera(IMAGE_PICKER_OPTIONS, handleImageResult);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        idx => { if (idx === 1) take(); else if (idx === 2) pick(); },
      );
    } else {
      Alert.alert('Add Meal Photo', '', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: take },
        { text: 'Choose from Library', onPress: pick },
      ]);
    }
  }, [apiKey, handleImageResult]);

  useDeepLink(useCallback((action) => {
    if ((action === 'quick-log' || action === 'add-photo') && apiKey) {
      launchCamera(IMAGE_PICKER_OPTIONS, handleImageResult);
    }
  }, [apiKey, handleImageResult]));

  // ── Meal logging ──────────────────────────────────────────────────

  const handleLogMeal = useCallback(async (edited?: MealData) => {
    if (!pendingResult) return;
    const data = edited || pendingResult.mealData;
    try {
      await logMeal(data, pendingResult.imageUri, pendingResult.imageBase64);
      setEditModalVisible(false);
      setPendingResult(null);
      await refresh(false);
      onMealLogged();
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) await syncWidgetData(userId);
    } catch (e) {
      console.error('Failed to log meal:', e);
      Alert.alert('Error', getUserFriendlyError(e));
    }
  }, [pendingResult, refresh, onMealLogged]);

  const handleSaveMeal = useCallback(async () => {
    const data = pendingResult?.saveMealSuggestion || pendingResult?.mealData;
    if (!data) return;
    try {
      await saveMeal({
        name: data.name,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
      });
      setMealSaved(true);
      Alert.alert('Saved', `"${data.name}" added to your meal library.`);
    } catch (e) {
      console.error('Failed to save meal:', e);
    }
  }, [pendingResult]);

  const handleDeleteMeal = useCallback(async (meal: MealEntry) => {
    Alert.alert('Delete Meal', `Remove "${meal.name}" from today?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const prevMeals = todaysMeals;
          setTodaysMeals(prev => prev.filter(m => m.id !== meal.id));
          try {
            await deleteMeal(meal.id);
            await refresh(false);
            onMealLogged();
            const userId = (await supabase.auth.getUser()).data.user?.id;
            if (userId) await syncWidgetData(userId);
          } catch (e) {
            setTodaysMeals(prevMeals);
            Alert.alert('Error', getUserFriendlyError(e));
          }
        },
      },
    ]);
  }, [refresh, onMealLogged, todaysMeals]);

  // ── Weight logging ────────────────────────────────────────────────

  const handleLogWeight = async () => {
    const val = parseFloat(weightInput);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid weight', 'Please enter a valid number.');
      return;
    }
    setLoggingWeight(true);
    try {
      await logWeightApi(lbsToKg(val));
      setWeightInput('');
      const updatedWeights = await getWeightLogs(7);
      setWeekWeights(updatedWeights);
      Alert.alert('Weight Logged', `${val} lbs recorded.`);
    } catch {
      Alert.alert('Error', 'Could not log weight.');
    } finally {
      setLoggingWeight(false);
    }
  };

  // ── Date display ──────────────────────────────────────────────────

  const now = new Date();
  const dayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Loading / Error ──────────────────────────────────────────────

  if (initialLoading) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={s.scrollContent}>
          <SkeletonText lines={2} style={{ marginBottom: 16 }} />
          <SkeletonCard height={120} />
          <SkeletonCard height={52} />
          <SkeletonCard height={44} />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  if (loadError && !profile) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <ErrorState message={loadError} onRetry={() => refresh(false)} />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={forceFetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Header */}
        <Text style={[s.todayTitle, { color: colors.text }]}>Today</Text>
        <Text style={[s.dateSubtitle, { color: colors.textSecondary }]}>{dayLabel}</Text>

        {/* Daily progress */}
        {goals && (
          <View style={[s.totalsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <DailyTotals totals={totals} goals={goals} />
            <Text style={[s.mealCountText, { color: colors.textTertiary }]}>
              {totals.mealCount} meal{totals.mealCount !== 1 ? 's' : ''} logged
            </Text>
          </View>
        )}

        {!apiKey && (
          <Text style={[s.hintText, { color: colors.error }]}>
            Add your Claude API key in Profile settings to get started.
          </Text>
        )}

        {/* Weight section */}
        <View style={s.weightSection}>
          <View style={s.weightSectionHeader}>
            <Ionicons name="scale-outline" size={18} color={colors.accent} />
            <Text style={[s.weightSectionTitle, { color: colors.text }]}>Weight</Text>
          </View>

          {weekWeights.length > 0 && (
            <View style={[s.weightChartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <LineChart
                data={{
                  labels: weekWeights.map(w => {
                    const d = new Date(w.loggedAt);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }),
                  datasets: [{ data: weekWeights.map(w => Math.round(kgToLbs(w.weightKg) * 10) / 10) }],
                }}
                width={screenWidth - 52}
                height={180}
                yAxisSuffix=""
                yAxisLabel=""
                formatYLabel={(v) => `${v} lbs`}
                segments={3}
                chartConfig={{
                  backgroundGradientFrom: colors.surface,
                  backgroundGradientTo: colors.surface,
                  decimalPlaces: 1,
                  color: (opacity = 1) => `rgba(156, 39, 176, ${opacity})`,
                  labelColor: (opacity = 1) => isDark ? `rgba(200,200,200,${opacity})` : `rgba(0,0,0,${opacity})`,
                  propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '4 4' },
                  propsForLabels: { fontSize: 10 },
                }}
                bezier
                withInnerLines
                withOuterLines={false}
                style={{ borderRadius: 12, marginLeft: -8 }}
              />
              <Text style={[s.weekAvgText, { color: colors.textSecondary }]}>
                Weekly avg: {(weekWeights.reduce((sum, w) => sum + kgToLbs(w.weightKg), 0) / weekWeights.length).toFixed(1)} lbs
              </Text>
            </View>
          )}

          <View style={[s.weightRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="scale-outline" size={14} color={colors.textTertiary} />
            <TextInput
              style={[s.weightInput, { color: colors.text }]}
              placeholder="Log weight (lbs)"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              value={weightInput}
              onChangeText={setWeightInput}
            />
            <Pressable
              style={[s.weightBtn, loggingWeight && { opacity: 0.5 }]}
              onPress={handleLogWeight}
              disabled={loggingWeight}
            >
              {loggingWeight ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.weightBtnText}>Log</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Analysis Result Card */}
        {pendingResult && (
          <View style={[s.resultCard, { backgroundColor: colors.surface, borderColor: isDark ? '#5B21B6' : '#DDD6FE' }]}>
            <View style={s.resultHeader}>
              <Image source={{ uri: pendingResult.imageUri }} style={s.resultImage} />
              <View style={s.resultInfo}>
                <Text style={[s.resultName, { color: colors.text }]} numberOfLines={2}>
                  {pendingResult.mealData.name}
                </Text>
                <Text style={[s.resultMacros, { color: colors.textSecondary }]}>
                  {pendingResult.mealData.calories} cal
                  {' · '}{pendingResult.mealData.protein}g P
                  {' · '}{pendingResult.mealData.carbs}g C
                  {' · '}{pendingResult.mealData.fat}g F
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPendingResult(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {pendingResult.description.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setDescExpanded(prev => !prev)}
              >
                <View style={descExpanded ? undefined : s.descCollapsed}>
                  <ThemedMarkdown fontSize={14} lineHeight={20}>{pendingResult.description}</ThemedMarkdown>
                </View>
                <Text style={s.showMoreText}>
                  {descExpanded ? 'Show less' : 'Show more'}
                </Text>
              </TouchableOpacity>
            )}

            <View style={s.resultActions}>
              <TouchableOpacity
                style={s.logButton}
                onPress={() => handleLogMeal()}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={s.logButtonText}>Log Meal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.editButton, { borderColor: colors.border }]}
                onPress={() => setEditModalVisible(true)}
              >
                <Ionicons name="create-outline" size={18} color={colors.text} />
                <Text style={[s.editButtonText, { color: colors.text }]}>Edit</Text>
              </TouchableOpacity>
            </View>

            {mealLogged && (
              <View style={s.loggedBanner}>
                <Ionicons name="checkmark-circle" size={16} color="#7C3AED" />
                <Text style={s.loggedBannerText}>Meal logged!</Text>
              </View>
            )}

            {pendingResult.saveMealSuggestion && !mealSaved && (
              <TouchableOpacity style={s.saveRow} onPress={handleSaveMeal}>
                <Ionicons name="bookmark-outline" size={16} color="#FF9800" />
                <Text style={s.saveRowText}>Save to meal library</Text>
              </TouchableOpacity>
            )}

            {mealSaved && (
              <View style={s.loggedBanner}>
                <Ionicons name="bookmark" size={16} color="#FF9800" />
                <Text style={[s.loggedBannerText, { color: '#FF9800' }]}>Saved to library!</Text>
              </View>
            )}
          </View>
        )}

        {/* Today's Meals */}
        <View style={s.mealsSection}>
          <Text style={[s.mealsSectionTitle, { color: colors.text }]}>Today's Meals</Text>
          {apiKey && goals && !pendingResult && (
            <SmartRecommendations onMealLogged={() => { refresh(); onMealLogged(); }} />
          )}
          {todaysMeals.length === 0 && !pendingResult && (
            <EmptyState
              icon="restaurant-outline"
              title="No meals logged yet today"
              subtitle="Take a photo of your meal to get started"
              compact
            />
          )}
          {todaysMeals.map(meal => {
              const imageSource = meal.imageUri?.startsWith('data:')
                ? { uri: meal.imageUri }
                : meal.imageUri
                  ? { uri: meal.imageUri }
                  : null;

              return (
                <TouchableOpacity
                  key={meal.id}
                  style={[s.mealCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onLongPress={() => handleDeleteMeal(meal)}
                  delayLongPress={500}
                  activeOpacity={0.7}
                >
                  <View style={s.mealCardHeader}>
                    {imageSource ? (
                      <Image source={imageSource} style={s.mealThumb} />
                    ) : (
                      <View style={[s.mealThumbPlaceholder, { backgroundColor: colors.inputBg }]}>
                        <Ionicons name="restaurant-outline" size={16} color={colors.textTertiary} />
                      </View>
                    )}
                    <Text style={[s.mealName, { color: colors.text }]} numberOfLines={1}>{meal.name}</Text>
                  </View>
                  <View style={s.mealMacroRow}>
                    <MacroPill label="Cal" value={meal.calories} color="#7C3AED" textSecondary={colors.textSecondary} />
                    <MacroPill label="Protein" value={meal.protein} unit="g" color="#2196F3" textSecondary={colors.textSecondary} />
                    <MacroPill label="Carbs" value={meal.carbs} unit="g" color="#FF9800" textSecondary={colors.textSecondary} />
                    <MacroPill label="Fat" value={meal.fat} unit="g" color="#9C27B0" textSecondary={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })}
        </View>
      </ScrollView>

      <View style={[s.stickyButtonWrap, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[s.addButton, (analyzing || !apiKey) && s.addButtonDisabled]}
          onPress={handleAddPhoto}
          disabled={analyzing || !apiKey}
          activeOpacity={0.7}
        >
          {analyzing ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={s.addButtonText}>Analyzing meal...</Text>
            </>
          ) : (
            <>
              <Ionicons name="camera-outline" size={22} color="#fff" />
              <Text style={s.addButtonText}>Add Meal Photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {pendingResult && (
        <EditMealModal
          visible={editModalVisible}
          initialData={pendingResult.mealData}
          onSave={(edited) => handleLogMeal(edited)}
          onCancel={() => setEditModalVisible(false)}
        />
      )}
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function MacroPill({
  label,
  value,
  unit,
  color,
  textSecondary,
}: {
  label: string;
  value: number;
  unit?: string;
  color: string;
  textSecondary?: string;
}) {
  return (
    <View style={s.pill}>
      <Text style={[s.pillValue, { color }]}>{value}{unit || ''}</Text>
      <Text style={[s.pillLabel, textSecondary ? { color: textSecondary } : undefined]}>{label}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  todayTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dateSubtitle: {
    fontSize: 14,
    marginTop: 2,
    marginBottom: 16,
  },

  // Totals card
  totalsCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  mealCountText: {
    textAlign: 'center',
    fontSize: 12,
    paddingBottom: 10,
  },

  // Sticky add button
  stickyButtonWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 16,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  hintText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },

  // Weight section
  weightSection: {
    marginTop: 16,
  },
  weightSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  weightSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  weightChartCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 6,
    overflow: 'hidden',
    marginBottom: 10,
  },
  weekAvgText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  weightInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  weightBtn: {
    backgroundColor: '#9C27B0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  weightBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // Result card
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
  },
  resultMacros: {
    fontSize: 12,
    marginTop: 4,
  },
  resultDescription: {
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  descCollapsed: {
    maxHeight: 65,
    overflow: 'hidden',
  },
  showMoreText: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
    marginTop: 4,
  },

  // Result actions
  resultActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  logButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 12,
  },
  logButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  editButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  loggedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 6,
  },
  loggedBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
  },
  saveRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9800',
  },

  // Today's meals
  mealsSection: {
    marginTop: 24,
  },
  mealsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  mealCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  mealCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  mealThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  mealThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  mealMacroRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  pillValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  pillLabel: {
    fontSize: 10,
    color: '#999',
    marginTop: 1,
  },
});
