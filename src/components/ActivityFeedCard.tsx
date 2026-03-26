import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { getStreakEmoji, getStreakText } from '../services/activityFeed';

interface ActivityFeedCardProps {
  activity: {
    userId: string;
    activityType: string;
    activityData: Record<string, any>;
    createdAt: string;
    username: string | null;
    profilePictureUrl: string | null;
  };
  onPress: () => void;
}

export default function ActivityFeedCard({ activity, onPress }: ActivityFeedCardProps) {
  const { colors } = useTheme();

  const streakDays = activity.activityData?.streak_days ?? 0;
  const emoji = getStreakEmoji(streakDays);
  const text = getStreakText(streakDays);
  const timeAgo = getTimeAgo(activity.createdAt);

  return (
    <TouchableOpacity
      style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {activity.profilePictureUrl ? (
        <Image source={{ uri: activity.profilePictureUrl }} style={s.avatar} />
      ) : (
        <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="person" size={18} color={colors.textTertiary} />
        </View>
      )}
      <View style={s.content}>
        <Text style={[s.text, { color: colors.text }]}>
          <Text style={s.bold}>@{activity.username || 'user'}</Text> {text} {emoji}
        </Text>
        <Text style={[s.time, { color: colors.textTertiary }]}>{timeAgo}</Text>
      </View>
    </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '700',
  },
  time: {
    fontSize: 12,
    marginTop: 2,
  },
});
