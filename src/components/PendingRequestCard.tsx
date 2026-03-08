import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';

interface PendingRequestCardProps {
  user: {
    username: string | null;
    displayName: string | null;
    profilePictureUrl: string | null;
  };
  createdAt: string;
  onAccept: () => void;
  onDecline: () => void;
}

export default function PendingRequestCard({
  user,
  createdAt,
  onAccept,
  onDecline,
}: PendingRequestCardProps) {
  const { colors } = useTheme();

  const timeAgo = getTimeAgo(createdAt);

  return (
    <View style={[s.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.row}>
        {user.profilePictureUrl ? (
          <Image source={{ uri: user.profilePictureUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="person" size={22} color={colors.textTertiary} />
          </View>
        )}
        <View style={s.info}>
          <Text style={[s.text, { color: colors.text }]}>
            <Text style={s.bold}>@{user.username || 'user'}</Text> wants to be friends
          </Text>
          <Text style={[s.time, { color: colors.textTertiary }]}>{timeAgo}</Text>
        </View>
      </View>
      <View style={s.actions}>
        <TouchableOpacity style={s.acceptBtn} onPress={onAccept} activeOpacity={0.7}>
          <Text style={s.acceptText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.declineBtn, { borderColor: colors.border }]}
          onPress={onDecline}
          activeOpacity={0.7}
        >
          <Text style={[s.declineText, { color: colors.textSecondary }]}>Decline</Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
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
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginLeft: 62,
  },
  acceptBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
  },
  acceptText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  declineBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  declineText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
