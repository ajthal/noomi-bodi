import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import SharedMealCard from '../components/SharedMealCard';
import MealPickerModal from '../components/MealPickerModal';
import FriendPickerModal from '../components/FriendPickerModal';
import {
  getSharedWithMe,
  getSharedByMe,
  SharedMeal,
  SentSharedMeal,
  copyToSavedMeals,
  deleteSharedMeal,
  shareMealWithMultiple,
} from '../services/sharedMeals';
import type { SavedMeal } from '../services/savedMeals';
import { sendNotification } from '../services/notifications';

interface SharedMealsPageProps {
  onUnreadCountChange?: (count: number) => void;
}

export default function SharedMealsPage({ onUnreadCountChange }: SharedMealsPageProps) {
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(true);
  const [received, setReceived] = useState<SharedMeal[]>([]);
  const [sent, setSent] = useState<SentSharedMeal[]>([]);
  const [sentExpanded, setSentExpanded] = useState(false);

  const [mealPickerVisible, setMealPickerVisible] = useState(false);
  const [friendPickerVisible, setFriendPickerVisible] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [receivedData, sentData] = await Promise.all([
        getSharedWithMe(),
        getSharedByMe(),
      ]);
      setReceived(receivedData);
      setSent(sentData);
      onUnreadCountChange?.(receivedData.filter(m => !m.isRead).length);
    } catch (error) {
      console.error('Error loading shared meals:', error);
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  React.useEffect(() => {
    if (isFocused) refresh();
  }, [isFocused, refresh]);

  const handleAddToMeals = async (meal: SharedMeal) => {
    try {
      await copyToSavedMeals(meal);
      Alert.alert('Added', `${meal.mealName} added to your meals!`);
      await refresh();
    } catch (error) {
      console.error('Error adding shared meal:', error);
      Alert.alert('Error', 'Could not add meal. Try again.');
    }
  };

  const handleDelete = (meal: SharedMeal) => {
    Alert.alert('Remove', `Remove "${meal.mealName}" from your shared meals?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteSharedMeal(meal.id);
          await refresh();
        },
      },
    ]);
  };

  const handleMealSelected = (meal: SavedMeal) => {
    setSelectedMealId(meal.id);
    setMealPickerVisible(false);
    setFriendPickerVisible(true);
  };

  const handleShareSend = async (selectedIds: string[], message: string) => {
    if (!selectedMealId) return;
    try {
      await shareMealWithMultiple(selectedMealId, selectedIds, message);
      setFriendPickerVisible(false);
      setSelectedMealId(null);
      Alert.alert('Shared', `Meal shared with ${selectedIds.length} friend${selectedIds.length > 1 ? 's' : ''}.`);
      for (const id of selectedIds) {
        sendNotification('shared_meal', id, {}).catch(() => {});
      }
      await refresh();
    } catch (error) {
      console.error('Failed to share meal:', error);
      Alert.alert('Error', 'Failed to share meal. Try again.');
    }
  };

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const sections: { title: string; data: any[]; type: 'received' | 'sent' }[] = [];

  sections.push({
    title: `Received (${received.length})`,
    data: received.length > 0 ? received : [{ _empty: true }],
    type: 'received',
  });

  sections.push({
    title: `Shared by You (${sent.length})`,
    data: sentExpanded ? (sent.length > 0 ? sent : [{ _empty: true }]) : [],
    type: 'sent',
  });

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.id ?? `empty-${index}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <TouchableOpacity
            style={[s.shareButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setMealPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="share-outline" size={20} color="#4CAF50" />
            <Text style={[s.shareButtonText, { color: colors.text }]}>Share a Meal</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        }
        renderSectionHeader={({ section }) => (
          <TouchableOpacity
            activeOpacity={section.type === 'sent' ? 0.7 : 1}
            onPress={() => section.type === 'sent' && setSentExpanded(p => !p)}
            style={s.sectionHeaderRow}
          >
            <Text style={[s.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            {section.type === 'sent' && (
              <Ionicons
                name={sentExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            )}
          </TouchableOpacity>
        )}
        renderItem={({ item, section }) => {
          if (item._empty) {
            return (
              <Text style={[s.emptyRow, { color: colors.textTertiary }]}>
                {section.type === 'received'
                  ? 'No meals received yet'
                  : 'You haven\'t shared any meals yet'}
              </Text>
            );
          }
          if (section.type === 'received') {
            return (
              <SharedMealCard
                sharedMeal={item as SharedMeal}
                onAddToMeals={() => handleAddToMeals(item as SharedMeal)}
                onDelete={() => handleDelete(item as SharedMeal)}
              />
            );
          }
          const sentItem = item as SentSharedMeal;
          return <SentMealCard item={sentItem} />;
        }}
      />

      <MealPickerModal
        visible={mealPickerVisible}
        onClose={() => setMealPickerVisible(false)}
        onSelect={handleMealSelected}
      />

      <FriendPickerModal
        visible={friendPickerVisible}
        onClose={() => {
          setFriendPickerVisible(false);
          setSelectedMealId(null);
        }}
        onSend={handleShareSend}
      />
    </View>
  );
}

function SentMealCard({ item }: { item: SentSharedMeal }) {
  const { colors } = useTheme();
  const recipient = item.sharedWithDisplayName || item.sharedWithUsername || 'someone';
  const timeAgo = getTimeAgo(item.createdAt);

  return (
    <View style={[s.sentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.sentHeader}>
        <Text style={[s.sentMealName, { color: colors.text }]} numberOfLines={1}>
          {item.mealName}
        </Text>
        <Text style={[s.sentTime, { color: colors.textTertiary }]}>{timeAgo}</Text>
      </View>
      <View style={s.sentMacros}>
        <Text style={[s.sentMacroText, { color: colors.textSecondary }]}>
          {item.calories} cal · {item.protein}g P · {item.carbs}g C · {item.fat}g F
        </Text>
      </View>
      <View style={s.sentRecipientRow}>
        {item.sharedWithProfilePicture ? (
          <Image source={{ uri: item.sharedWithProfilePicture }} style={s.sentAvatar} />
        ) : (
          <View style={[s.sentAvatarPlaceholder, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="person" size={10} color={colors.textTertiary} />
          </View>
        )}
        <Text style={[s.sentRecipientText, { color: colors.textSecondary }]}>
          Sent to @{item.sharedWithUsername || 'user'}
        </Text>
      </View>
      {item.message ? (
        <View style={[s.sentMessage, { backgroundColor: colors.inputBg }]}>
          <Text style={[s.sentMessageText, { color: colors.text }]}>{item.message}</Text>
        </View>
      ) : null}
    </View>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  shareButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyRow: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  sentCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  sentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sentMealName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  sentTime: {
    fontSize: 11,
  },
  sentMacros: {
    marginTop: 4,
  },
  sentMacroText: {
    fontSize: 12,
  },
  sentRecipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  sentAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sentAvatarPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentRecipientText: {
    fontSize: 12,
  },
  sentMessage: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
  },
  sentMessageText: {
    fontSize: 13,
  },
});
