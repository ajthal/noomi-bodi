import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BottomSheet from '../components/BottomSheet';
import { useTheme } from '../contexts/ThemeContext';
import { searchUsers, PublicProfile } from '../services/profileService';
import {
  sendFriendRequest,
  acceptFriendRequest,
  getFriendshipStatus,
  RelationshipStatus,
} from '../services/friendships';
import { sendNotification } from '../services/notifications';
import { getUserFriendlyError } from '../utils/errorMessages';

interface AddFriendModalProps {
  visible: boolean;
  onClose: () => void;
  onFriendAdded?: () => void;
}

interface SearchResult extends PublicProfile {
  relationship: RelationshipStatus;
  friendshipId: string | null;
}

export default function AddFriendModal({
  visible,
  onClose,
  onFriendAdded,
}: AddFriendModalProps) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  const handleSearch = useCallback(async (text: string) => {
    if (text.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const users = await searchUsers(text);
      const enriched = await Promise.all(
        users.map(async u => {
          const { status, friendshipId } = await getFriendshipStatus(u.id);
          return { ...u, relationship: status, friendshipId };
        }),
      );
      setResults(enriched);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(text), 300);
  };

  const handleFollow = async (user: SearchResult) => {
    setActionLoading(user.id);
    try {
      await sendFriendRequest(user.id);
      setResults(prev =>
        prev.map(r =>
          r.id === user.id ? { ...r, relationship: 'pending_sent' } : r,
        ),
      );
      onFriendAdded?.();
      sendNotification('friend_request', user.id, {}).catch(() => {});
    } catch (error) {
      console.error('Failed to send friend request:', error);
      Alert.alert('Error', getUserFriendlyError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (user: SearchResult) => {
    if (!user.friendshipId) return;
    setActionLoading(user.id);
    try {
      await acceptFriendRequest(user.friendshipId);
      setResults(prev =>
        prev.map(r =>
          r.id === user.id ? { ...r, relationship: 'accepted' } : r,
        ),
      );
      onFriendAdded?.();
      sendNotification('friend_accepted', user.id, {}).catch(() => {});
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      Alert.alert('Error', getUserFriendlyError(error));
    } finally {
      setActionLoading(null);
    }
  };

  const renderStatusButton = (user: SearchResult) => {
    if (actionLoading === user.id) {
      return <ActivityIndicator size="small" color={colors.accent} />;
    }
    switch (user.relationship) {
      case 'accepted':
        return (
          <View style={[s.badge, { backgroundColor: '#4CAF5020' }]}>
            <Text style={[s.badgeText, { color: '#4CAF50' }]}>Friends</Text>
          </View>
        );
      case 'pending_sent':
        return (
          <View style={[s.badge, { backgroundColor: colors.inputBg }]}>
            <Text style={[s.badgeText, { color: colors.textSecondary }]}>Pending</Text>
          </View>
        );
      case 'pending_received':
        return (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#4CAF50' }]}
            onPress={() => handleAccept(user)}
          >
            <Text style={s.actionBtnText}>Accept</Text>
          </TouchableOpacity>
        );
      default:
        return (
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#2196F3' }]}
            onPress={() => handleFollow(user)}
          >
            <Text style={s.actionBtnText}>Follow</Text>
          </TouchableOpacity>
        );
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={s.content}>
        <Text style={[s.title, { color: colors.text }]}>Add Friend</Text>

        <View style={[s.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <Ionicons name="search" size={16} color={colors.textTertiary} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search by username or email"
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={handleQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={s.loader} />
        ) : query.length < 2 ? (
          <Text style={[s.hint, { color: colors.textTertiary }]}>
            Search for friends by username or email
          </Text>
        ) : results.length === 0 ? (
          <Text style={[s.hint, { color: colors.textTertiary }]}>No users found</Text>
        ) : (
          <FlatList
            data={results}
            keyExtractor={r => r.id}
            style={s.list}
            renderItem={({ item }) => (
              <View style={[s.row, { borderColor: colors.border }]}>
                {item.profilePictureUrl ? (
                  <Image source={{ uri: item.profilePictureUrl }} style={s.avatar} />
                ) : (
                  <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
                    <Ionicons name="person" size={22} color={colors.textTertiary} />
                  </View>
                )}
                <View style={s.userInfo}>
                  <Text style={[s.username, { color: colors.text }]} numberOfLines={1}>
                    @{item.username || 'user'}
                    {item.displayName ? ` \u00B7 ${item.displayName}` : ''}
                  </Text>
                  {item.bio ? (
                    <Text style={[s.bio, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.bio}
                    </Text>
                  ) : null}
                </View>
                {renderStatusButton(item)}
              </View>
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
    maxHeight: 520,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  loader: {
    marginVertical: 40,
  },
  hint: {
    textAlign: 'center',
    paddingVertical: 30,
    fontSize: 14,
  },
  list: {
    marginTop: 12,
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
  },
  bio: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
