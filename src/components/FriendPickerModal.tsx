import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BottomSheet from './BottomSheet';
import { useTheme } from '../contexts/ThemeContext';
import { getAcceptedFriends, FriendWithProfile } from '../services/friendships';

interface FriendPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (selectedIds: string[], message: string) => void;
}

export default function FriendPickerModal({
  visible,
  onClose,
  onSend,
}: FriendPickerModalProps) {
  const { colors } = useTheme();
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set());
    setMessage('');
    setLoading(true);
    getAcceptedFriends()
      .then(setFriends)
      .finally(() => setLoading(false));
  }, [visible]);

  const toggleFriend = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = () => {
    onSend(Array.from(selected), message.trim());
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.content}>
        <Text style={[s.title, { color: colors.text }]}>Share with Friends</Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={s.loader} />
        ) : friends.length === 0 ? (
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>
            No friends yet. Add friends from the Social tab!
          </Text>
        ) : (
          <>
            <FlatList
              data={friends}
              keyExtractor={f => f.id}
              style={s.list}
              renderItem={({ item }) => {
                const isSelected = selected.has(item.id);
                return (
                  <TouchableOpacity
                    style={[s.row, { borderColor: colors.border }]}
                    onPress={() => toggleFriend(item.id)}
                    activeOpacity={0.7}
                  >
                    {item.profilePictureUrl ? (
                      <Image source={{ uri: item.profilePictureUrl }} style={s.avatar} />
                    ) : (
                      <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
                        <Ionicons name="person" size={16} color={colors.textTertiary} />
                      </View>
                    )}
                    <Text style={[s.username, { color: colors.text }]} numberOfLines={1}>
                      @{item.username || 'user'}
                    </Text>
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={isSelected ? '#4CAF50' : colors.textTertiary}
                    />
                  </TouchableOpacity>
                );
              }}
            />
            <TextInput
              style={[s.messageInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}
              placeholder="Add a message (optional)"
              placeholderTextColor={colors.textTertiary}
              value={message}
              onChangeText={setMessage}
              multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, selected.size === 0 && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={selected.size === 0}
              activeOpacity={0.7}
            >
              <Text style={s.sendBtnText}>
                Send{selected.size > 0 ? ` to ${selected.size} friend${selected.size > 1 ? 's' : ''}` : ''}
              </Text>
            </TouchableOpacity>
          </>
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
    marginBottom: 16,
    textAlign: 'center',
  },
  loader: {
    marginVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30,
  },
  list: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  messageInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 12,
    minHeight: 44,
    maxHeight: 80,
  },
  sendBtn: {
    marginTop: 12,
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
