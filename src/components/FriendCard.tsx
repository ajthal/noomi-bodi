import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

interface FriendCardProps {
  friend: {
    id: string;
    username: string | null;
    displayName: string | null;
    profilePictureUrl: string | null;
    currentStreak?: number;
  };
  onPress: () => void;
}

export default function FriendCard({ friend, onPress }: FriendCardProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {friend.profilePictureUrl ? (
        <Image source={{ uri: friend.profilePictureUrl }} style={s.avatar} />
      ) : (
        <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="person" size={28} color={colors.textTertiary} />
        </View>
      )}
      <Text style={[s.username, { color: colors.text }]} numberOfLines={1}>
        @{friend.username || 'user'}
      </Text>
      {friend.displayName ? (
        <Text style={[s.displayName, { color: colors.textSecondary }]} numberOfLines={1}>
          {friend.displayName}
        </Text>
      ) : null}
      {(friend.currentStreak ?? 0) > 0 && (
        <Text style={s.streak}>{'\uD83D\uDD25'} {friend.currentStreak} days</Text>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: {
    width: 100,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 10,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  displayName: {
    fontSize: 11,
    marginTop: 2,
  },
  streak: {
    fontSize: 11,
    marginTop: 4,
    color: '#FF9800',
    fontWeight: '600',
  },
});
