import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import FriendCard from '../components/FriendCard';
import PendingRequestCard from '../components/PendingRequestCard';
import ActivityFeedCard from '../components/ActivityFeedCard';
import LeaderboardRow from '../components/LeaderboardRow';
import AddFriendModal from './AddFriendModal';
import { getAcceptedFriends, FriendWithProfile, getPendingReceived, getPendingSent, acceptFriendRequest, declineFriendRequest } from '../services/friendships';
import { getFriendActivity, ActivityFeedItem } from '../services/activityFeed';
import { getWeeklyLeaderboard, LeaderboardEntry, WeekRange } from '../services/leaderboard';
import { sendNotification } from '../services/notifications';
import { SkeletonCard, SkeletonRow, SkeletonCircle } from '../components/SkeletonLoader';
import { ErrorState } from '../components/ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useStaleFetch } from '../hooks/useStaleFetch';

export default function SocialScreen(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();

  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [pending, setPending] = useState<{ friendship: any; profile: any }[]>([]);
  const [sentRequests, setSentRequests] = useState<{ friendship: any; profile: any }[]>([]);
  const [activities, setActivities] = useState<ActivityFeedItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [weekRange, setWeekRange] = useState<WeekRange | null>(null);
  const [addFriendVisible, setAddFriendVisible] = useState(false);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [sentExpanded, setSentExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const [friendsList, pendingList, sentList, feedItems, lb] = await Promise.all([
        getAcceptedFriends(),
        getPendingReceived(),
        getPendingSent(),
        getFriendActivity(20),
        getWeeklyLeaderboard(),
      ]);
      setFriends(friendsList);
      setPending(pendingList);
      setSentRequests(sentList);
      setActivities(feedItems);
      setLeaderboard(lb.entries);
      setWeekRange(lb.weekRange);
    } catch (error) {
      console.error('Error loading social data:', error);
      setLoadError(getUserFriendlyError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const { fetchIfStale, forceFetch } = useStaleFetch(loadData, 30_000);

  React.useEffect(() => {
    if (isFocused) fetchIfStale();
  }, [isFocused, fetchIfStale]);

  const handleAccept = async (friendshipId: string, senderId?: string) => {
    const prevPending = pending;
    setPending(prev => prev.filter(p => p.friendship.id !== friendshipId));
    try {
      await acceptFriendRequest(friendshipId);
      await loadData(false);
      if (senderId) {
        sendNotification('friend_accepted', senderId, {}).catch(() => {});
      }
    } catch (error) {
      console.error('Error accepting request:', error);
      setPending(prevPending);
      Alert.alert('Error', getUserFriendlyError(error));
    }
  };

  const handleDecline = async (friendshipId: string) => {
    const prevPending = pending;
    setPending(prev => prev.filter(p => p.friendship.id !== friendshipId));
    try {
      await declineFriendRequest(friendshipId);
      await loadData(false);
    } catch (error) {
      console.error('Error declining request:', error);
      setPending(prevPending);
      Alert.alert('Error', getUserFriendlyError(error));
    }
  };

  const navigateToProfile = (userId: string) => {
    navigation.navigate('FriendProfile', { userId });
  };

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <View style={s.content}>
          <SkeletonCard height={80} />
          <SkeletonCard height={80} />
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <SkeletonCircle size={56} />
            <SkeletonCircle size={56} />
            <SkeletonCircle size={56} />
            <SkeletonCircle size={56} />
          </View>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  if (loadError && friends.length === 0) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ErrorState message={loadError} onRetry={() => loadData(false)} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.text }]}>Social</Text>
        <TouchableOpacity
          style={[s.addFriendBtn, { backgroundColor: isDark ? '#ffffff' : '#111827' }]}
          onPress={() => setAddFriendVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={18} color={isDark ? '#111827' : '#ffffff'} />
          <Text style={[s.addFriendBtnText, { color: isDark ? '#111827' : '#ffffff' }]}>Add Friend</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={forceFetch}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Activity Feed */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Friend Activity</Text>
          {activities.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="flash-outline" size={32} color={colors.textTertiary} />
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                No activity yet. Add friends to see their progress!
              </Text>
            </View>
          ) : (
            activities.map(item => (
              <ActivityFeedCard
                key={item.id}
                activity={item}
                onPress={() => navigateToProfile(item.userId)}
              />
            ))
          )}
        </View>

        {/* Pending Requests */}
        {pending.length > 0 && (
          <View style={s.section}>
            <TouchableOpacity
              style={s.sectionHeader}
              onPress={() => setPendingExpanded(prev => !prev)}
              activeOpacity={0.7}
            >
              <Text style={[s.sectionTitle, { color: colors.text }]}>
                Pending Requests ({pending.length})
              </Text>
              <Ionicons
                name={pendingExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {pendingExpanded &&
              pending.map(({ friendship, profile }) => (
                <PendingRequestCard
                  key={friendship.id}
                  user={profile}
                  createdAt={friendship.createdAt}
                  onAccept={() => handleAccept(friendship.id, friendship.followerId)}
                  onDecline={() => handleDecline(friendship.id)}
                />
              ))}
          </View>
        )}

        {/* Sent Requests */}
        {sentRequests.length > 0 && (
          <View style={s.section}>
            <TouchableOpacity
              style={s.sectionHeader}
              onPress={() => setSentExpanded(prev => !prev)}
              activeOpacity={0.7}
            >
              <Text style={[s.sectionTitle, { color: colors.text }]}>
                Sent Requests ({sentRequests.length})
              </Text>
              <Ionicons
                name={sentExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {sentExpanded &&
              sentRequests.map(({ friendship, profile }) => (
                <View
                  key={friendship.id}
                  style={[s.sentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={s.sentInfo}>
                    <Text style={[s.sentUsername, { color: colors.text }]} numberOfLines={1}>
                      @{profile.username || 'user'}
                      {profile.displayName ? ` · ${profile.displayName}` : ''}
                    </Text>
                    <Text style={[s.sentTime, { color: colors.textTertiary }]}>
                      Waiting for response
                    </Text>
                  </View>
                  <View style={[s.sentBadge, { backgroundColor: colors.border + '40' }]}>
                    <Text style={[s.sentBadgeText, { color: colors.textSecondary }]}>Pending</Text>
                  </View>
                </View>
              ))}
          </View>
        )}

        {/* Friends List */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>
            Friends ({friends.length})
          </Text>
          {friends.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="people-outline" size={32} color={colors.textTertiary} />
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                No friends yet. Tap Add Friend to get started!
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.friendsScroll}>
              {friends.map(friend => (
                <FriendCard
                  key={friend.id}
                  friend={friend}
                  onPress={() => navigateToProfile(friend.id)}
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Weekly Leaderboard */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>This Week's Leaderboard</Text>
          {weekRange && (
            <Text style={[s.weekRangeText, { color: colors.textSecondary }]}>
              {weekRange.label}
            </Text>
          )}
          {leaderboard.length <= 1 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="trophy-outline" size={32} color={colors.textTertiary} />
              <Text style={[s.emptyText, { color: colors.textTertiary }]}>
                Add friends to see the leaderboard!
              </Text>
            </View>
          ) : (
            <View style={[s.leaderboardCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {leaderboard.map(entry => (
                <LeaderboardRow
                  key={entry.userId}
                  rank={entry.rank}
                  user={{
                    userId: entry.userId,
                    username: entry.username,
                    profilePictureUrl: entry.profilePictureUrl,
                  }}
                  adherence={{
                    percentage: entry.percentage,
                    daysHit: entry.daysHit,
                    daysTotal: entry.daysTotal,
                  }}
                  isCurrentUser={entry.isCurrentUser}
                  onPress={() => {
                    if (!entry.isCurrentUser) navigateToProfile(entry.userId);
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <AddFriendModal
        visible={addFriendVisible}
        onClose={() => setAddFriendVisible(false)}
        onFriendAdded={loadData}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  addFriendBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  weekRangeText: {
    fontSize: 12,
    marginBottom: 10,
    marginTop: -6,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  friendsScroll: {
    flexDirection: 'row',
  },
  leaderboardCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  sentInfo: {
    flex: 1,
  },
  sentUsername: {
    fontSize: 14,
    fontWeight: '600',
  },
  sentTime: {
    fontSize: 11,
    marginTop: 2,
  },
  sentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
