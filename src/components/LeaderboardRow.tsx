import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

interface LeaderboardRowProps {
  rank: number;
  user: {
    userId: string;
    username: string | null;
    profilePictureUrl: string | null;
  };
  adherence: {
    percentage: number;
    daysHit: number;
    daysTotal: number;
  };
  isCurrentUser: boolean;
  onPress: () => void;
}

const MEDALS: Record<number, string> = { 1: '\uD83E\uDD47', 2: '\uD83E\uDD48', 3: '\uD83E\uDD49' };

export default function LeaderboardRow({
  rank,
  user,
  adherence,
  isCurrentUser,
  onPress,
}: LeaderboardRowProps) {
  const { colors, isDark } = useTheme();

  const highlightBg = isCurrentUser
    ? isDark ? '#1a1033' : '#EDE9FE'
    : undefined;

  return (
    <TouchableOpacity
      style={[
        s.container,
        { borderColor: colors.border },
        highlightBg ? { backgroundColor: highlightBg } : undefined,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[s.rank, { color: colors.text }]}>
        {MEDALS[rank] || `${rank}`}
      </Text>
      {user.profilePictureUrl ? (
        <Image source={{ uri: user.profilePictureUrl }} style={s.avatar} />
      ) : (
        <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="person" size={14} color={colors.textTertiary} />
        </View>
      )}
      <Text style={[s.username, { color: colors.text }]} numberOfLines={1}>
        @{user.username || 'user'}
        {isCurrentUser ? ' (you)' : ''}
      </Text>
      <Text style={[s.adherence, { color: colors.accent }]}>
        {adherence.percentage}% ({adherence.daysHit}/{adherence.daysTotal})
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rank: {
    width: 28,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  avatarPlaceholder: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  adherence: {
    fontSize: 13,
    fontWeight: '700',
  },
});
