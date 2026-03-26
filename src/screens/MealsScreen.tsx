import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import SavedMealModal from '../components/SavedMealModal';
import AIMealBuilderModal from '../components/AIMealBuilderModal';
import {
  getSavedMeals,
  saveMeal,
  updateSavedMeal,
  deleteSavedMeal,
  SavedMeal,
  SavedMealInput,
} from '../services/savedMeals';
import { logMeal } from '../services/mealLog';
import { syncWidgetData } from '../services/widgetDataSync';
import { supabase } from '../services/supabase';
import { shareMealWithMultiple } from '../services/sharedMeals';
import { sendNotification } from '../services/notifications';
import FriendPickerModal from '../components/FriendPickerModal';
import { SkeletonCard, SkeletonRow } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useStaleFetch } from '../hooks/useStaleFetch';

const SORT_OPTIONS = [
  { key: 'name', label: 'Name', color: '#607D8B' },
  { key: 'calories', label: 'Calories', color: '#7C3AED' },
  { key: 'protein', label: 'Protein', color: '#2196F3' },
  { key: 'carbs', label: 'Carbs', color: '#FF9800' },
  { key: 'fat', label: 'Fat', color: '#9C27B0' },
];

const FILTER_MACROS = [
  { key: 'calories', label: 'Calories', color: '#7C3AED' },
  { key: 'protein', label: 'Protein (g)', color: '#2196F3' },
  { key: 'carbs', label: 'Carbs (g)', color: '#FF9800' },
  { key: 'fat', label: 'Fat (g)', color: '#9C27B0' },
];

export default function MealsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [initialLoading, setInitialLoading] = useState(true);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMeal, setEditingMeal] = useState<SavedMeal | null>(null);
  const [aiBuilderVisible, setAiBuilderVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'calories' | 'protein' | 'carbs' | 'fat'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, { min: string; max: string }>>({
    calories: { min: '', max: '' },
    protein: { min: '', max: '' },
    carbs: { min: '', max: '' },
    fat: { min: '', max: '' },
  });
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const [sharingMealId, setSharingMealId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isFocused = useIsFocused();

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some(f => f.min !== '' || f.max !== ''),
    [filters],
  );

  const filteredMeals = useMemo(() => {
    let result = meals;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        m =>
          m.name.toLowerCase().includes(q) ||
          (m.notes && m.notes.toLowerCase().includes(q)),
      );
    }

    for (const [macro, range] of Object.entries(filters)) {
      const minVal = range.min !== '' ? parseFloat(range.min) : null;
      const maxVal = range.max !== '' ? parseFloat(range.max) : null;
      if (minVal !== null && !isNaN(minVal)) {
        result = result.filter(m => (m[macro as keyof SavedMeal] as number ?? 0) >= minVal);
      }
      if (maxVal !== null && !isNaN(maxVal)) {
        result = result.filter(m => (m[macro as keyof SavedMeal] as number ?? 0) <= maxVal);
      }
    }

    result = [...result].sort((a, b) => {
      let cmp: number;
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else {
        cmp = (a[sortBy] ?? 0) - (b[sortBy] ?? 0);
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [meals, searchQuery, sortBy, sortAsc, filters]);

  const handleSortPress = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortBy(field);
      setSortAsc(field === 'name');
    }
  };

  const updateFilter = (macro: string, bound: 'min' | 'max', value: string) => {
    setFilters(prev => ({
      ...prev,
      [macro]: { ...prev[macro], [bound]: value },
    }));
  };

  const clearFilters = () => {
    setFilters({
      calories: { min: '', max: '' },
      protein: { min: '', max: '' },
      carbs: { min: '', max: '' },
      fat: { min: '', max: '' },
    });
  };

  const refresh = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setLoadError(null);
    try {
      const data = await getSavedMeals();
      setMeals(data);
    } catch (e) {
      console.error('MealsScreen refresh error:', e);
      setLoadError(getUserFriendlyError(e));
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  const { fetchIfStale, forceFetch } = useStaleFetch(refresh, 30_000);

  useEffect(() => {
    if (isFocused) fetchIfStale();
  }, [isFocused, fetchIfStale]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleCreate = () => {
    setEditingMeal(null);
    setModalVisible(true);
  };

  const handleEdit = (meal: SavedMeal) => {
    setEditingMeal(meal);
    setModalVisible(true);
  };

  const handleSave = async (input: SavedMealInput) => {
    try {
      if (editingMeal) {
        await updateSavedMeal(editingMeal.id, input);
      } else {
        await saveMeal(input);
      }
      setModalVisible(false);
      setEditingMeal(null);
      await refresh();
    } catch (e) {
      console.error('Failed to save meal:', e);
      Alert.alert('Error', getUserFriendlyError(e));
    }
  };

  const handleDelete = (meal: SavedMeal) => {
    Alert.alert(
      'Delete Saved Meal',
      `Remove "${meal.name}" from your library?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const prevMeals = meals;
            setMeals(prev => prev.filter(m => m.id !== meal.id));
            try {
              await deleteSavedMeal(meal.id);
            } catch (e) {
              setMeals(prevMeals);
              Alert.alert('Error', getUserFriendlyError(e));
            }
          },
        },
      ],
    );
  };

  const handleQuickAdd = (meal: SavedMeal) => {
    Alert.alert(
      'Add to Today',
      `Log "${meal.name}" (${meal.calories} cal) to today?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log It',
          onPress: async () => {
            try {
              await logMeal({
                name: meal.name,
                calories: meal.calories,
                protein: meal.protein,
                carbs: meal.carbs,
                fat: meal.fat,
              });
              const userId = (await supabase.auth.getUser()).data.user?.id;
              if (userId) await syncWidgetData(userId);
              Alert.alert('Logged', `${meal.name} added to today's log.`);
            } catch (e) {
              console.error('Failed to quick-add meal:', e);
              Alert.alert('Error', getUserFriendlyError(e));
            }
          },
        },
      ],
    );
  };

  const handleAIGenerated = async (data: { name: string; calories: number; protein: number; carbs: number; fat: number; notes: string }) => {
    try {
      await saveMeal({
        name: data.name,
        calories: data.calories,
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        notes: data.notes || null,
      });
      setAiBuilderVisible(false);
      await refresh();
      Alert.alert('Saved', `"${data.name}" added to your meal library.`);
    } catch (e) {
      console.error('Failed to save AI-generated meal:', e);
      Alert.alert('Error', getUserFriendlyError(e));
    }
  };

  const handleLongPress = (meal: SavedMeal) => {
    Alert.alert(meal.name, 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Share with Friend', onPress: () => {
        setSharingMealId(meal.id);
        setFriendPickerVisible(true);
      }},
      { text: 'Edit', onPress: () => handleEdit(meal) },
      { text: 'Delete', style: 'destructive', onPress: () => handleDelete(meal) },
    ]);
  };

  const handleShareSend = async (selectedIds: string[], message: string) => {
    if (!sharingMealId) return;
    try {
      await shareMealWithMultiple(sharingMealId, selectedIds, message);
      setFriendPickerVisible(false);
      setSharingMealId(null);
      Alert.alert('Shared', `Meal shared with ${selectedIds.length} friend${selectedIds.length > 1 ? 's' : ''}.`);
      for (const id of selectedIds) {
        sendNotification('shared_meal', id, {}).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to share meal:', error);
      Alert.alert('Error', getUserFriendlyError(error));
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  const renderMeal = ({ item }: { item: SavedMeal }) => {
    const imageSource = item.imageUrl?.startsWith('data:')
      ? { uri: item.imageUrl }
      : item.imageUrl
        ? { uri: item.imageUrl }
        : null;

    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        activeOpacity={0.8}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
        <View style={s.cardHeader}>
          {imageSource ? (
            <Image source={imageSource} style={s.thumb} />
          ) : (
            <View style={[s.thumbPlaceholder, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="restaurant-outline" size={20} color={colors.textTertiary} />
            </View>
          )}
          <View style={s.cardInfo}>
            <Text style={[s.cardName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            {item.notes ? (
              <Text style={[s.cardNotes, { color: colors.textSecondary }]} numberOfLines={1}>{item.notes}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.macroRow}>
          <MacroPill label="Cal" value={item.calories} color="#7C3AED" labelColor={colors.textSecondary} />
          <MacroPill label="Protein" value={item.protein} unit="g" color="#2196F3" labelColor={colors.textSecondary} />
          <MacroPill label="Carbs" value={item.carbs} unit="g" color="#FF9800" labelColor={colors.textSecondary} />
          <MacroPill label="Fat" value={item.fat} unit="g" color="#9C27B0" labelColor={colors.textSecondary} />
        </View>

        <TouchableOpacity
          style={s.quickAddBtn}
          onPress={() => handleQuickAdd(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={s.quickAddText}>Quick Add</Text>
        </TouchableOpacity>

        <Text style={[s.longPressHint, { color: colors.textTertiary }]}>Hold to edit or delete</Text>
      </TouchableOpacity>
    );
  };

  if (initialLoading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <View style={{ padding: 16 }}>
          <SkeletonCard height={140} />
          <SkeletonCard height={140} />
          <SkeletonCard height={140} />
        </View>
      </View>
    );
  }

  if (loadError && meals.length === 0) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ErrorState message={loadError} onRetry={() => refresh(false)} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.text }]}>Saved Meals</Text>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={() => setAiBuilderVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="sparkles-outline" size={24} color="#FF9800" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCreate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="add-circle-outline" size={28} color="#7C3AED" />
          </TouchableOpacity>
        </View>
      </View>

      {meals.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title="No saved meals yet"
          subtitle="Tap + to create one, or chat with NoomiBodi about meals you eat regularly — it will suggest saving them here."
          actionLabel="Create Meal"
          onAction={handleCreate}
        />
      ) : (
        <>
          {/* Search bar */}
          <View style={[s.searchRow, { backgroundColor: colors.background }]}>
            <View style={[s.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: colors.text }]}
                placeholder="Search meals..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Sort chips + filter toggle */}
          <View style={[s.sortRow, { backgroundColor: colors.background }]}>
            {SORT_OPTIONS.map(opt => {
              const active = sortBy === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    s.sortChip,
                    { borderColor: active ? opt.color : colors.border },
                    active && { backgroundColor: opt.color + '18' },
                  ]}
                  onPress={() => handleSortPress(opt.key as typeof sortBy)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      s.sortChipText,
                      { color: active ? opt.color : colors.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {active && (
                    <Ionicons
                      name={sortAsc ? 'arrow-up' : 'arrow-down'}
                      size={12}
                      color={opt.color}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[
                s.sortChip,
                {
                  borderColor: hasActiveFilters ? '#E91E63' : filtersOpen ? colors.accent : colors.border,
                  backgroundColor: hasActiveFilters ? '#E91E6318' : filtersOpen ? colors.accent + '18' : undefined,
                },
              ]}
              onPress={() => setFiltersOpen(prev => !prev)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="options-outline"
                size={13}
                color={hasActiveFilters ? '#E91E63' : filtersOpen ? colors.accent : colors.textSecondary}
              />
              <Text
                style={[
                  s.sortChipText,
                  { color: hasActiveFilters ? '#E91E63' : filtersOpen ? colors.accent : colors.textSecondary },
                ]}
              >
                Filter
              </Text>
            </TouchableOpacity>
          </View>

          {/* Macro filters panel */}
          {filtersOpen && (
            <View style={[s.filterPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {FILTER_MACROS.map(fm => (
                <View key={fm.key} style={s.filterMacroRow}>
                  <Text style={[s.filterMacroLabel, { color: fm.color }]}>{fm.label}</Text>
                  <View style={s.filterInputGroup}>
                    <TextInput
                      style={[s.filterInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                      placeholder="Min"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                      value={filters[fm.key].min}
                      onChangeText={v => updateFilter(fm.key, 'min', v)}
                    />
                    <Text style={[s.filterDash, { color: colors.textTertiary }]}>–</Text>
                    <TextInput
                      style={[s.filterInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
                      placeholder="Max"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                      value={filters[fm.key].max}
                      onChangeText={v => updateFilter(fm.key, 'max', v)}
                    />
                  </View>
                </View>
              ))}
              {hasActiveFilters && (
                <TouchableOpacity style={s.clearFiltersBtn} onPress={clearFilters}>
                  <Text style={s.clearFiltersText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {filteredMeals.length === 0 ? (
            <View style={s.noResultsWrap}>
              <Text style={[s.noResultsText, { color: colors.textTertiary }]}>
                {searchQuery.trim()
                  ? `No meals match "${searchQuery}"`
                  : hasActiveFilters
                    ? 'No meals match your filters'
                    : 'No meals found'}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={[s.clearFiltersBtn, { marginTop: 12 }]} onPress={clearFilters}>
                  <Text style={s.clearFiltersText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={filteredMeals}
              keyExtractor={m => m.id}
              renderItem={renderMeal}
              contentContainerStyle={s.list}
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
            />
          )}
        </>
      )}

      <SavedMealModal
        visible={modalVisible}
        existing={editingMeal}
        onSave={handleSave}
        onCancel={() => {
          setModalVisible(false);
          setEditingMeal(null);
        }}
      />

      <AIMealBuilderModal
        visible={aiBuilderVisible}
        onGenerated={handleAIGenerated}
        onCancel={() => setAiBuilderVisible(false)}
      />

      <FriendPickerModal
        visible={friendPickerVisible}
        onClose={() => { setFriendPickerVisible(false); setSharingMealId(null); }}
        onSend={handleShareSend}
      />
    </View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function MacroPill({
  label,
  value,
  unit,
  color,
  labelColor,
}: {
  label: string;
  value: number;
  unit?: string;
  color: string;
  labelColor?: string;
}) {
  return (
    <View style={[s.pill, { borderColor: color + '40' }]}>
      <Text style={[s.pillValue, { color }]}>
        {value}{unit || ''}
      </Text>
      <Text style={[s.pillLabel, labelColor ? { color: labelColor } : undefined]}>{label}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  sortRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterPanel: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  filterMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterMacroLabel: {
    fontSize: 12,
    fontWeight: '700',
    width: 80,
  },
  filterInputGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterInput: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  filterDash: {
    fontSize: 14,
  },
  clearFiltersBtn: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#E91E6318',
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E91E63',
  },
  noResultsWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noResultsText: {
    fontSize: 14,
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },

  // Card
  card: {
    backgroundColor: '#fafafa',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  thumbPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  cardNotes: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  macroRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6,
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
    color: '#999',
    marginTop: 1,
  },

  // Quick add button
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#7C3AED',
    paddingVertical: 10,
    borderRadius: 10,
  },
  quickAddText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  longPressHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#ccc',
    marginTop: 6,
  },

  // Empty
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#aaa',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#bbb',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCreateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
