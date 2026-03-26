import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import { SkeletonCircle, SkeletonText, SkeletonCard } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { getPublicProfile, PublicProfile } from '../services/profileService';
import {
  getFriendshipStatus,
  removeFriend,
  RelationshipStatus,
} from '../services/friendships';
import { getFriendStats, FriendStats } from '../services/reportData';
import { kgToLbs } from '../utils/units';

interface FriendProfileScreenProps {
  route: any;
  navigation: any;
}

export default function FriendProfileScreen({ route, navigation }: FriendProfileScreenProps) {
  const { colors, isDark } = useTheme();
  const { userId } = route.params;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [relationship, setRelationship] = useState<RelationshipStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [stats, setStats] = useState<FriendStats | null>(null);

  useEffect(() => {
    Promise.all([
      getPublicProfile(userId),
      getFriendshipStatus(userId),
      getFriendStats(userId),
    ]).then(([p, fs, friendStats]) => {
      setProfile(p);
      setRelationship(fs.status);
      setFriendshipId(fs.friendshipId);
      setStats(friendStats);
      setLoading(false);
    });
  }, [userId]);

  const handleRemoveFriend = () => {
    if (!friendshipId || !profile) return;
    Alert.alert(
      'Remove Friend',
      `Remove @${profile.username || 'this user'} as a friend?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFriend(friendshipId);
              setRelationship('none');
              setFriendshipId(null);
            } catch (error) {
              console.error('Remove friend failed:', error);
              Alert.alert('Error', getUserFriendlyError(error));
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.content}>
          <View style={s.profileHeader}>
            <SkeletonCircle style={s.avatarSkeleton} size={120} />
            <SkeletonText lines={1} lastLineWidth="40%" style={s.skeletonUsername} />
            <SkeletonText lines={1} lastLineWidth="30%" style={s.skeletonDisplayName} />
            <SkeletonText lines={2} lastLineWidth="70%" style={s.skeletonBio} />
          </View>
          <View style={s.statsGrid}>
            <SkeletonCard style={{ flex: 1 }} height={80} />
            <SkeletonCard style={{ flex: 1 }} height={80} />
            <SkeletonCard style={{ flex: 1 }} height={80} />
          </View>
          <SkeletonCard height={90} style={{ marginBottom: 12 }} />
          <SkeletonCard height={70} style={{ marginBottom: 12 }} />
          <SkeletonCard height={70} style={{ marginBottom: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: colors.text }]}>Profile</Text>
          <View style={{ width: 24 }} />
        </View>
        <EmptyState
          icon="person-outline"
          title="User not found"
          subtitle="This profile may have been removed or the link is invalid."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>@{profile.username || 'user'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Profile header */}
        <View style={s.profileHeader}>
          {profile.profilePictureUrl ? (
            <Image source={{ uri: profile.profilePictureUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="person" size={50} color={colors.textTertiary} />
            </View>
          )}
          <Text style={[s.username, { color: colors.text }]}>@{profile.username || 'user'}</Text>
          {profile.displayName ? (
            <Text style={[s.displayName, { color: colors.textSecondary }]}>{profile.displayName}</Text>
          ) : null}
          {profile.bio ? (
            <Text style={[s.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
          ) : null}
          {relationship === 'accepted' && (
            <View style={[s.friendBadge, { backgroundColor: '#7C3AED20' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
              <Text style={s.friendBadgeText}>Friends</Text>
            </View>
          )}
        </View>

        {/* Stats card — only for accepted, non-private friends */}
        {relationship === 'accepted' && !profile.isPrivate && stats && (
          <View style={s.statsGrid}>
            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={s.statEmoji}>{'\uD83D\uDD25'}</Text>
              <Text style={[s.statValue, { color: colors.text }]}>{stats.streak}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>Day Streak</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={s.statEmoji}>{'\uD83D\uDCC5'}</Text>
              <Text style={[s.statValue, { color: colors.text }]}>{stats.daysTracked}</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>Days Tracked</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={s.statEmoji}>{'\uD83C\uDFAF'}</Text>
              <Text style={[s.statValue, { color: colors.text }]}>{stats.adherencePct}%</Text>
              <Text style={[s.statLabel, { color: colors.textSecondary }]}>This Week</Text>
            </View>
          </View>
        )}

        {/* Plan summary */}
        {relationship === 'accepted' && !profile.isPrivate && stats?.goalCalories && (
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.infoCardHeader}>
              <Ionicons name="nutrition-outline" size={18} color={colors.accent} />
              <Text style={[s.infoCardTitle, { color: colors.text }]}>Plan</Text>
            </View>
            <Text style={[s.planGoalType, { color: colors.accent }]}>
              Goal: {stats.goalType === 'lose' ? 'Lose weight' : stats.goalType === 'gain' ? 'Gain weight' : 'Maintain weight'}
            </Text>
            <View style={s.planMacroRow}>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.goalCalories} cal
              </Text>
              <Text style={[s.planMacroDot, { color: colors.border }]}>{'\u00B7'}</Text>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.goalProtein}g P
              </Text>
              <Text style={[s.planMacroDot, { color: colors.border }]}>{'\u00B7'}</Text>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.goalCarbs}g C
              </Text>
              <Text style={[s.planMacroDot, { color: colors.border }]}>{'\u00B7'}</Text>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.goalFat}g F
              </Text>
            </View>
          </View>
        )}

        {/* Weight progress */}
        {relationship === 'accepted' && !profile.isPrivate && stats?.currentWeightKg != null && (
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.infoCardHeader}>
              <Ionicons name="scale-outline" size={18} color="#9C27B0" />
              <Text style={[s.infoCardTitle, { color: colors.text }]}>Weight Progress</Text>
            </View>
            <View style={s.weightRow}>
              {stats.startWeightKg != null && (
                <View style={s.weightItem}>
                  <Text style={[s.weightItemLabel, { color: colors.textSecondary }]}>Start</Text>
                  <Text style={[s.weightItemValue, { color: colors.text }]}>
                    {Math.round(kgToLbs(stats.startWeightKg) * 10) / 10} lbs
                  </Text>
                </View>
              )}
              <View style={s.weightItem}>
                <Text style={[s.weightItemLabel, { color: colors.textSecondary }]}>Current</Text>
                <Text style={[s.weightItemValue, { color: colors.text }]}>
                  {Math.round(kgToLbs(stats.currentWeightKg) * 10) / 10} lbs
                </Text>
              </View>
              {stats.weightChangeKg != null && (
                <View style={s.weightItem}>
                  <Text style={[s.weightItemLabel, { color: colors.textSecondary }]}>Change</Text>
                  <Text style={[
                    s.weightItemValue,
                    { color: stats.weightChangeKg < 0 ? '#4CAF50' : stats.weightChangeKg > 0 ? '#FF9800' : colors.text },
                  ]}>
                    {stats.weightChangeKg > 0 ? '+' : ''}{Math.round(kgToLbs(stats.weightChangeKg) * 10) / 10} lbs
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Average daily macros */}
        {relationship === 'accepted' && !profile.isPrivate && stats && stats.avgDays > 0 && (
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={s.infoCardHeader}>
              <Ionicons name="pie-chart-outline" size={18} color="#2196F3" />
              <Text style={[s.infoCardTitle, { color: colors.text }]}>Avg Daily Intake</Text>
              <Text style={[s.infoCardSubtitle, { color: colors.textTertiary }]}>
                last {stats.avgDays} day{stats.avgDays !== 1 ? 's' : ''}
              </Text>
            </View>
            <View style={s.planMacroRow}>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.avgCalories} cal
              </Text>
              <Text style={[s.planMacroDot, { color: colors.border }]}>{'\u00B7'}</Text>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.avgProtein}g P
              </Text>
              <Text style={[s.planMacroDot, { color: colors.border }]}>{'\u00B7'}</Text>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.avgCarbs}g C
              </Text>
              <Text style={[s.planMacroDot, { color: colors.border }]}>{'\u00B7'}</Text>
              <Text style={[s.planMacro, { color: colors.textSecondary }]}>
                {stats.avgFat}g F
              </Text>
            </View>
          </View>
        )}

        {/* Privacy notice */}
        {profile.isPrivate && relationship === 'accepted' && (
          <View style={[s.privacyNotice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
            <View style={s.privacyTextContainer}>
              <Text style={[s.privacyTitle, { color: colors.text }]}>Private Account</Text>
              <Text style={[s.privacyDescription, { color: colors.textSecondary }]}>
                You can still share meals with each other
              </Text>
            </View>
          </View>
        )}

        {/* Actions */}
        {relationship === 'accepted' && (
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.removeBtn, { borderColor: colors.error }]}
              onPress={handleRemoveFriend}
            >
              <Ionicons name="person-remove-outline" size={18} color={colors.error} />
              <Text style={[s.removeBtnText, { color: colors.error }]}>Remove Friend</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarSkeleton: {
    alignSelf: 'center',
  },
  skeletonUsername: {
    marginTop: 14,
    alignSelf: 'center',
  },
  skeletonDisplayName: {
    marginTop: 8,
    alignSelf: 'center',
  },
  skeletonBio: {
    marginTop: 8,
    alignSelf: 'center',
  },
  skeletonCard: {
    marginTop: 0,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 14,
  },
  displayName: {
    fontSize: 16,
    marginTop: 4,
  },
  bio: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  friendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  friendBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C3AED',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  statEmoji: {
    fontSize: 22,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  infoCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  infoCardSubtitle: {
    fontSize: 11,
    marginLeft: 'auto' as any,
  },
  planGoalType: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  planMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  planMacro: {
    fontSize: 13,
    fontWeight: '500',
  },
  planMacroDot: {
    fontSize: 13,
  },
  weightRow: {
    flexDirection: 'row',
    gap: 16,
  },
  weightItem: {
    flex: 1,
    alignItems: 'center',
  },
  weightItemLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  weightItemValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  privacyDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    marginTop: 16,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  removeBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
