import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../contexts/ThemeContext';
import ThemedMarkdown from '../components/ThemedMarkdown';
import UpdatePlanModal from '../components/UpdatePlanModal';
import { SkeletonCard, SkeletonCircle, SkeletonText } from '../components/SkeletonLoader';
import { ErrorState } from '../components/ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useStaleFetch } from '../hooks/useStaleFetch';
import {
  loadUserProfile,
  UserProfile,
  estimateDailyGoals,
  MacroGoals,
} from '../services/storage';
import { getOverviewStats, OverviewStats } from '../services/reportData';
import { cmToFeetInches, kgToLbs } from '../utils/units';

export default function ProfilePage(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [updatePlanVisible, setUpdatePlanVisible] = useState(false);

  const loadData = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError(null);
      try {
        const p = await loadUserProfile();
        setProfile(p);
        if (p) {
          const goals = estimateDailyGoals(p);
          const overview = await getOverviewStats(goals.calories);
          setStats(overview);
        }
      } catch (error) {
        const message = getUserFriendlyError(error);
        setLoadError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  const { fetchIfStale, forceFetch } = useStaleFetch(loadData, 60_000);

  useEffect(() => {
    if (!isFocused) return;
    fetchIfStale();
  }, [isFocused, fetchIfStale]);

  const isStandaloneScreen = useRoute().name === 'ProfileScreen';

  const headerBar = isStandaloneScreen ? (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
      <View style={[s.headerBar, { borderBottomColor: colors.borderLight }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('SettingsScreen')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  ) : null;

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {headerBar}
        <ScrollView
          style={[s.container, { backgroundColor: colors.background }]}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.profileHeader}>
            <SkeletonCircle size={100} />
            <SkeletonText lines={2} lastLineWidth="50%" style={{ marginTop: 12, width: 100 }} />
            <SkeletonText lines={1} lastLineWidth="40%" style={{ marginTop: 8, width: 80 }} />
          </View>
          <View style={s.statsGrid}>
            <SkeletonCard style={{ flex: 1 }} height={80} />
            <SkeletonCard style={{ flex: 1 }} height={80} />
            <SkeletonCard style={{ flex: 1 }} height={80} />
          </View>
          <SkeletonCard height={100} />
        </ScrollView>
      </View>
    );
  }

  if (loadError && !profile) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {headerBar}
        <ErrorState message={loadError} onRetry={() => loadData(false)} />
      </View>
    );
  }

  const goals: MacroGoals | null = profile ? estimateDailyGoals(profile) : null;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {headerBar}
      <ScrollView
        style={[s.container, { backgroundColor: colors.background }]}
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
      {/* Profile header */}
      <View style={s.profileHeader}>
        {profile?.profilePictureUrl ? (
          <Image source={{ uri: profile.profilePictureUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatarPlaceholder, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="person" size={40} color={colors.textTertiary} />
          </View>
        )}
        <Text style={[s.username, { color: colors.text }]}>
          {profile?.username ? `@${profile.username}` : 'Set up your profile'}
        </Text>
        {profile?.displayName ? (
          <Text style={[s.displayName, { color: colors.textSecondary }]}>{profile.displayName}</Text>
        ) : null}
        {profile?.bio ? (
          <Text style={[s.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
        ) : null}

        <TouchableOpacity
          style={[s.editBtn, { backgroundColor: isDark ? '#ffffff' : '#111827' }]}
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.7}
        >
          <Text style={[s.editBtnText, { color: isDark ? '#111827' : '#ffffff' }]}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Stats cards */}
      <View style={s.statsGrid}>
        <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={s.statEmoji}>{'\uD83D\uDD25'}</Text>
          <Text style={[s.statValue, { color: colors.text }]}>{stats?.streak ?? 0}</Text>
          <Text style={[s.statLabel, { color: colors.textSecondary }]}>Day Streak</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={s.statEmoji}>{'\uD83D\uDCC5'}</Text>
          <Text style={[s.statValue, { color: colors.text }]}>{stats?.daysTracked ?? 0}</Text>
          <Text style={[s.statLabel, { color: colors.textSecondary }]}>Days Tracked</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={s.statEmoji}>{'\uD83C\uDFAF'}</Text>
          <Text style={[s.statValue, { color: colors.text }]}>
            {stats ? Math.round(stats.adherenceRate * 100) : 0}%
          </Text>
          <Text style={[s.statLabel, { color: colors.textSecondary }]}>This Week</Text>
        </View>
      </View>

      {/* Goals summary */}
      {goals && (
        <View style={[s.goalsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.goalsTitle, { color: colors.text }]}>Daily Goals</Text>
          {profile && (
            <Text style={[s.goalsMeta, { color: colors.textSecondary }]}>
              {profile.gender.toUpperCase()} {'\u00B7'} {profile.age}y {'\u00B7'}{' '}
              {cmToFeetInches(profile.heightCm).feet}'{cmToFeetInches(profile.heightCm).inches}" {'\u00B7'}{' '}
              {Math.round(kgToLbs(profile.weightKg))} lb
            </Text>
          )}
          <View style={[s.calorieCard, { backgroundColor: isDark ? '#1a1033' : '#EDE9FE' }]}>
            <Text style={[s.calorieValue, { color: isDark ? '#A78BFA' : '#5B21B6' }]}>{goals.calories}</Text>
            <Text style={[s.calorieUnit, { color: colors.accent }]}>cal / day</Text>
          </View>
          <View style={s.macroRow}>
            <MacroPill label="Protein" value={goals.protein} color="#2196F3" labelColor={colors.textSecondary} />
            <MacroPill label="Carbs" value={goals.carbs} color="#FF9800" labelColor={colors.textSecondary} />
            <MacroPill label="Fat" value={goals.fat} color="#9C27B0" labelColor={colors.textSecondary} />
          </View>
        </View>
      )}

      {/* Expandable plan */}
      {profile?.plan ? (
        <View style={[s.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.planHeader}>
            <Text style={[s.goalsTitle, { color: colors.text }]}>Your Plan</Text>
            {planExpanded && (
              <TouchableOpacity
                style={[s.updatePlanBtn, { backgroundColor: isDark ? '#1a1033' : '#EDE9FE' }]}
                onPress={() => setUpdatePlanVisible(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="sparkles" size={14} color="#7C3AED" />
                <Text style={s.updatePlanText}>Update</Text>
              </TouchableOpacity>
            )}
          </View>
          {planExpanded && (
            <View style={s.planTextContainer}>
              <ThemedMarkdown fontSize={14} lineHeight={22}>{profile.plan}</ThemedMarkdown>
            </View>
          )}
          <TouchableOpacity
            style={[s.readMoreButton, { borderTopColor: colors.border }]}
            onPress={() => setPlanExpanded(prev => !prev)}
            activeOpacity={0.7}
          >
            <Text style={s.readMoreText}>
              {planExpanded ? 'Show less' : 'Read full plan'}
            </Text>
            <Ionicons
              name={planExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#7C3AED"
            />
          </TouchableOpacity>
        </View>
      ) : null}

      <UpdatePlanModal
        visible={updatePlanVisible}
        onClose={() => setUpdatePlanVisible(false)}
        onPlanUpdated={() => {
          loadData(true);
        }}
      />
      </ScrollView>
    </View>
  );
}

function MacroPill({
  label,
  value,
  color,
  labelColor,
}: {
  label: string;
  value: number;
  color: string;
  labelColor?: string;
}) {
  return (
    <View style={[s.pill, { borderColor: color + '30' }]}>
      <View style={[s.pillDot, { backgroundColor: color }]} />
      <View>
        <Text style={[s.pillValue, { color }]}>{value}g</Text>
        <Text style={[s.pillLabel, labelColor ? { color: labelColor } : undefined]}>{label}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 12,
  },
  displayName: {
    fontSize: 15,
    marginTop: 4,
  },
  bio: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 20,
  },
  editBtn: {
    marginTop: 14,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 999,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
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
  goalsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  goalsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  goalsMeta: {
    fontSize: 12,
    letterSpacing: 0.3,
  },
  calorieCard: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  calorieValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  calorieUnit: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  pillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pillValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  pillLabel: {
    fontSize: 10,
    color: '#888',
    marginTop: 1,
  },
  planCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  updatePlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  updatePlanText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },
  planTextContainer: {
    marginTop: 10,
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    gap: 4,
  },
  readMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },
});
