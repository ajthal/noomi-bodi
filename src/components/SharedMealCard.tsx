import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import type { SharedMeal } from '../services/sharedMeals';

interface SharedMealCardProps {
  sharedMeal: SharedMeal;
  onAddToMeals: () => void;
  onDelete: () => void;
}

export default function SharedMealCard({
  sharedMeal,
  onAddToMeals,
  onDelete,
}: SharedMealCardProps) {
  const { colors } = useTheme();

  const timeAgo = getTimeAgo(sharedMeal.createdAt);

  return (
    <View style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {!sharedMeal.isRead && <View style={s.unreadDot} />}

      <View style={s.header}>
        <Text style={[s.mealName, { color: colors.text }]}>{sharedMeal.mealName}</Text>
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-outline" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <View style={s.macroRow}>
        <MacroPill label="Cal" value={sharedMeal.calories} color="#4CAF50" labelColor={colors.textSecondary} />
        <MacroPill label="P" value={sharedMeal.protein} unit="g" color="#2196F3" labelColor={colors.textSecondary} />
        <MacroPill label="C" value={sharedMeal.carbs} unit="g" color="#FF9800" labelColor={colors.textSecondary} />
        <MacroPill label="F" value={sharedMeal.fat} unit="g" color="#9C27B0" labelColor={colors.textSecondary} />
      </View>

      <View style={s.senderRow}>
        {sharedMeal.sharedByProfilePicture ? (
          <Image source={{ uri: sharedMeal.sharedByProfilePicture }} style={s.senderAvatar} />
        ) : (
          <View style={[s.senderAvatarPlaceholder, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="person" size={10} color={colors.textTertiary} />
          </View>
        )}
        <Text style={[s.senderText, { color: colors.textSecondary }]}>
          From @{sharedMeal.sharedByUsername || 'friend'}
        </Text>
        <Text style={[s.time, { color: colors.textTertiary }]}>{timeAgo}</Text>
      </View>

      {sharedMeal.message ? (
        <View style={[s.messageBubble, { backgroundColor: colors.inputBg }]}>
          <Text style={[s.messageText, { color: colors.text }]}>{sharedMeal.message}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={s.addBtn} onPress={onAddToMeals} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={s.addBtnText}>Add to My Meals</Text>
      </TouchableOpacity>
    </View>
  );
}

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
      <Text style={[s.pillValue, { color }]}>{value}{unit || ''}</Text>
      <Text style={[s.pillLabel, labelColor ? { color: labelColor } : undefined]}>{label}</Text>
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
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
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
    paddingVertical: 4,
    alignItems: 'center',
  },
  pillValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillLabel: {
    fontSize: 9,
    color: '#999',
    marginTop: 1,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  senderAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  senderAvatarPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderText: {
    fontSize: 12,
    flex: 1,
  },
  time: {
    fontSize: 11,
  },
  messageBubble: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
  },
  messageText: {
    fontSize: 13,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
