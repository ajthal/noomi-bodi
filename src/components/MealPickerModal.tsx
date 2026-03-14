import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import { EmptyState } from './EmptyState';
import { useTheme } from '../contexts/ThemeContext';
import { getSavedMeals, SavedMeal } from '../services/savedMeals';

interface MealPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (meal: SavedMeal) => void;
}

export default function MealPickerModal({ visible, onClose, onSelect }: MealPickerModalProps) {
  const { colors } = useTheme();
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setLoading(true);
    getSavedMeals()
      .then(setMeals)
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = query.trim()
    ? meals.filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
    : meals;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.content}>
        <Text style={[s.title, { color: colors.text }]}>Choose a Meal to Share</Text>

        <View style={[s.searchRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search meals..."
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={s.loader} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={meals.length === 0 ? 'bookmark-outline' : 'search-outline'}
            title={meals.length === 0 ? 'No saved meals yet' : 'No meals match your search'}
            subtitle={meals.length === 0 ? 'Save a meal first!' : undefined}
            compact
          />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={m => m.id}
            style={s.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.row, { borderColor: colors.border }]}
                onPress={() => onSelect(item)}
                activeOpacity={0.7}
              >
                <View style={s.mealInfo}>
                  <Text style={[s.mealName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[s.macros, { color: colors.textSecondary }]}>
                    {item.calories} cal · {item.protein}g P · {item.carbs}g C · {item.fat}g F
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    maxHeight: 500,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 10,
  },
  loader: {
    marginVertical: 40,
  },
  list: {
    maxHeight: 340,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mealInfo: {
    flex: 1,
    gap: 2,
  },
  mealName: {
    fontSize: 15,
    fontWeight: '600',
  },
  macros: {
    fontSize: 12,
  },
});
