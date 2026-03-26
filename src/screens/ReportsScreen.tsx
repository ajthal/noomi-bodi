import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LineChart, PieChart } from 'react-native-chart-kit';
import CustomBarChart from '../components/CustomBarChart';
import {
  DailySummary,
  OverviewStats,
  WeightLog,
  getDailySummaries,
  getOverviewStats,
  getWeightLogs,
} from '../services/reportData';
import {
  loadUserProfile,
  estimateDailyGoals,
  MacroGoals,
} from '../services/storage';
import {
  getAnalytics,
  type GoalProjection,
  type DayOfWeekPattern,
  type Correlation,
} from '../services/analytics';
import { kgToLbs } from '../utils/units';
import { useTheme } from '../contexts/ThemeContext';
import { SkeletonCard, SkeletonText } from '../components/SkeletonLoader';
import { ErrorState } from '../components/ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import { useStaleFetch } from '../hooks/useStaleFetch';

// ── Period filter ────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'all';

const PERIOD_DAYS: Record<Period, number> = {
  week: 7,
  month: 30,
  all: 0,
};

const PIE_COLORS = ['#2196F3', '#FF9800', '#9C27B0'];

// ── Component ────────────────────────────────────────────────────────

export default function ReportsScreen(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = screenWidth - 48;
  const isFocused = useIsFocused();

  const chartConfig = {
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
    labelColor: (opacity = 1) => (isDark ? `rgba(200, 200, 200, ${opacity})` : `rgba(0, 0, 0, ${opacity})`),
    barPercentage: 0.6,
    propsForBackgroundLines: { stroke: colors.border },
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('week');

  const [goals, setGoals] = useState<MacroGoals | null>(null);
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [allWeights, setAllWeights] = useState<WeightLog[]>([]);
  const [goalProj, setGoalProj] = useState<GoalProjection | null>(null);
  const [patterns, setPatterns] = useState<DayOfWeekPattern[]>([]);
  const [correlations, setCorrelations] = useState<Correlation[]>([]);

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const [p, s, w, aw] = await Promise.all([
        loadUserProfile(),
        getDailySummaries(PERIOD_DAYS[period]),
        getWeightLogs(PERIOD_DAYS[period]),
        getWeightLogs(0),
      ]);

      const g = p ? estimateDailyGoals(p) : null;
      setGoals(g);
      setSummaries(s);
      setWeights(w);
      setAllWeights(aw);
      if (g) {
        setOverview(await getOverviewStats(g.calories));
      }

      // Analytics loaded separately so a failure doesn't break the rest
      try {
        const analytics = await getAnalytics();
        setGoalProj(analytics.goalProjection);
        setPatterns(analytics.dayOfWeekPatterns);
        setCorrelations(analytics.correlations);
      } catch (ae) {
        console.warn('Analytics fetch error (non-fatal):', ae);
      }
    } catch (e) {
      console.error('Reports fetch error:', e);
      setLoadError(getUserFriendlyError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  const { fetchIfStale, forceFetch, markStale } = useStaleFetch(fetchAll, 60_000);

  useEffect(() => {
    if (isFocused) fetchIfStale();
  }, [isFocused, fetchIfStale]);

  // Period change should invalidate staleness and re-fetch
  useEffect(() => {
    markStale();
    fetchAll(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // ── Derived data ───────────────────────────────────────────────────

  const calorieChartData = () => {
    if (summaries.length === 0) return null;
    const labels = summaries.map(s => {
      const d = new Date(s.date + 'T00:00:00');
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    return {
      labels,
      datasets: [{ data: summaries.map(s => s.calories) }],
    };
  };

  const calorieGoalHits = () => {
    if (!goals || summaries.length === 0) return { hit: 0, total: 0 };
    const lo = goals.calories * 0.9;
    const hi = goals.calories * 1.1;
    const hit = summaries.filter(s => s.calories >= lo && s.calories <= hi).length;
    return { hit, total: summaries.length };
  };

  const macroAvgPieData = () => {
    if (summaries.length === 0) return [];
    const n = summaries.length;
    const avgP = summaries.reduce((a, s) => a + s.protein, 0) / n;
    const avgC = summaries.reduce((a, s) => a + s.carbs, 0) / n;
    const avgF = summaries.reduce((a, s) => a + s.fat, 0) / n;
    const total = avgP + avgC + avgF;
    const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;
    return [
      { name: `Protein ${pct(avgP)}%`, grams: Math.round(avgP), color: PIE_COLORS[0], legendFontColor: colors.text, legendFontSize: 13 },
      { name: `Carbs ${pct(avgC)}%`, grams: Math.round(avgC), color: PIE_COLORS[1], legendFontColor: colors.text, legendFontSize: 13 },
      { name: `Fat ${pct(avgF)}%`, grams: Math.round(avgF), color: PIE_COLORS[2], legendFontColor: colors.text, legendFontSize: 13 },
    ];
  };

  const macroSuccessRates = () => {
    if (!goals || summaries.length === 0) return [];
    const macros: Array<{ label: string; goal: number; color: string; key: keyof DailySummary }> = [
      { label: 'Protein', goal: goals.protein, color: PIE_COLORS[0], key: 'protein' },
      { label: 'Carbs', goal: goals.carbs, color: PIE_COLORS[1], key: 'carbs' },
      { label: 'Fat', goal: goals.fat, color: PIE_COLORS[2], key: 'fat' },
    ];
    return macros.map(m => {
      const lo = m.goal * 0.85;
      const hi = m.goal * 1.15;
      const hit = summaries.filter(s => {
        const v = s[m.key] as number;
        return v >= lo && v <= hi;
      }).length;
      return { ...m, hit, total: summaries.length };
    });
  };

  const weightChartData = () => {
    if (weights.length === 0) return null;
    const allLabels = weights.map(w => {
      const d = new Date(w.loggedAt);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const maxLabels = Math.max(2, Math.floor(chartWidth / 60));
    const skip = Math.max(1, Math.ceil(allLabels.length / maxLabels));
    const labels = allLabels.map((l, i) => {
      if (allLabels.length <= maxLabels) return l;
      if (i === allLabels.length - 1) return l;
      if (i % skip === 0) {
        const nextShown = i + skip;
        if (nextShown > allLabels.length - 1 && allLabels.length - 1 - i < skip * 0.6) return '';
        return l;
      }
      return '';
    });
    const weightData = weights.map(w => Math.round(kgToLbs(w.weightKg) * 10) / 10);
    const n = weightData.length;
    const datasets: any[] = [
      { data: weightData, color: (opacity = 1) => `rgba(156, 39, 176, ${opacity})`, strokeWidth: 2 },
    ];

    const startLbs = weightData[0];
    datasets.push({
      data: Array(n).fill(startLbs),
      color: () => '#5599DD',
      strokeWidth: 1,
      strokeDashArray: [6, 4],
      withDots: false,
    });

    const goalLbs = goalProj?.goalLbs;
    if (goalLbs && goalLbs !== startLbs) {
      datasets.push({
        data: Array(n).fill(goalLbs),
        color: () => '#FF9800',
        strokeWidth: 1,
        strokeDashArray: [6, 4],
        withDots: false,
      });
    }

    return { labels, datasets, legend: undefined };
  };

  const weightStats = () => {
    if (allWeights.length === 0) return null;
    const first = allWeights[0];
    const last = allWeights[allWeights.length - 1];
    const changeLbs = kgToLbs(last.weightKg) - kgToLbs(first.weightKg);

    const daysDiff = Math.max(
      1,
      (new Date(last.loggedAt).getTime() - new Date(first.loggedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const weeklyRate = (changeLbs / daysDiff) * 7;

    return {
      startLbs: Math.round(kgToLbs(first.weightKg) * 10) / 10,
      currentLbs: Math.round(kgToLbs(last.weightKg) * 10) / 10,
      changeLbs: Math.round(changeLbs * 10) / 10,
      weeklyRate: Math.round(weeklyRate * 10) / 10,
    };
  };

  // ── Render helpers ─────────────────────────────────────────────────

  if (loadError && !goals && summaries.length === 0 && !overview && allWeights.length === 0) {
    return (
      <ErrorState
        message={loadError}
        onRetry={() => fetchAll(false)}
      />
    );
  }

  if (loading) {
    return (
      <View style={[s.root, { backgroundColor: colors.surfaceAlt }]}>
        <ScrollView style={s.scrollArea} contentContainerStyle={s.content}>
          <View style={s.filterRow}>
            {[1, 2, 3].map(i => (
              <SkeletonCard key={i} height={36} style={{ width: 80 }} />
            ))}
          </View>
          <SkeletonText lines={1} lastLineWidth="40%" style={{ marginBottom: 10 }} />
          <View style={s.cardGrid}>
            {[1, 2, 3, 4].map(i => (
              <SkeletonCard key={i} height={90} style={{ width: '48%' }} />
            ))}
          </View>
          <SkeletonText lines={1} lastLineWidth="30%" style={{ marginBottom: 10 }} />
          <SkeletonCard height={220} style={{ marginBottom: 18 }} />
          <SkeletonText lines={1} lastLineWidth="35%" style={{ marginBottom: 10 }} />
          <SkeletonCard height={200} style={{ marginBottom: 18 }} />
          <SkeletonText lines={1} lastLineWidth="40%" style={{ marginBottom: 10 }} />
          <SkeletonCard height={220} style={{ marginBottom: 18 }} />
          <View style={{ height: 16 }} />
        </ScrollView>
      </View>
    );
  }

  const calData = calorieChartData();
  const calGoal = calorieGoalHits();
  const pieData = macroAvgPieData();
  const macroRates = macroSuccessRates();
  const wData = weightChartData();
  const wStats = weightStats();

  return (
    <View style={[s.root, { backgroundColor: colors.surfaceAlt }]}>
    <ScrollView
      style={s.scrollArea}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={forceFetch}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      {/* ── Period filter ──────────────────────────────────────────── */}
      <View style={s.filterRow}>
        {(['week', 'month', 'all'] as Period[]).map(p => (
          <Pressable
            key={p}
            style={[
              s.filterPill,
              { backgroundColor: colors.border },
              period === p && s.filterPillActive,
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                s.filterText,
                { color: colors.textSecondary },
                period === p && s.filterTextActive,
              ]}
            >
              {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All Time'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Section 1: Overview Stats ─────────────────────────────── */}
      <Text style={[s.sectionTitle, { color: colors.text }]}>Overview</Text>
      <View style={s.cardGrid}>
        <StatCard
          colors={colors}
          icon="flame-outline"
          iconColor="#FF5722"
          label="Streak"
          value={`${overview?.streak ?? 0} day${overview?.streak !== 1 ? 's' : ''}`}
        />
        <StatCard
          colors={colors}
          icon="checkmark-circle-outline"
          iconColor="#7C3AED"
          label="Adherence"
          value={`${overview?.adherenceDays ?? 0}/${overview?.adherenceTotal ?? 0} days`}
        />
        <StatCard
          colors={colors}
          icon="calendar-outline"
          iconColor="#2196F3"
          label="Days Tracked"
          value={`${overview?.daysTracked ?? 0}`}
        />
        <StatCard
          colors={colors}
          icon={wStats && wStats.changeLbs < 0 ? 'trending-down-outline' : 'trending-up-outline'}
          iconColor="#9C27B0"
          label="Weight Change"
          value={wStats ? `${wStats.changeLbs > 0 ? '+' : ''}${wStats.changeLbs} lbs` : '—'}
        />
      </View>

      {/* ── Section 2: Calorie Chart ──────────────────────────────── */}
      <Text style={[s.sectionTitle, { color: colors.text }]}>Calories</Text>
      {calData && calData.datasets[0].data.length > 0 ? (
        <View style={[s.chartCard, { backgroundColor: colors.card }]}>
          <CustomBarChart
            labels={calData.labels}
            data={calData.datasets[0].data}
            width={chartWidth}
            height={220}
            barColor={colors.accent}
            labelColor={colors.textSecondary}
            gridColor={colors.border}
            goalValue={goals?.calories}
            goalColor="#FF9800"
            goalLabel={goals ? `Goal ${goals.calories}` : undefined}
          />
          {goals && (
            <Text style={[s.goalLine, { color: colors.textSecondary }]}>
              Hit {calGoal.hit}/{calGoal.total} days (
              {calGoal.total > 0 ? Math.round((calGoal.hit / calGoal.total) * 100) : 0}%)
            </Text>
          )}
        </View>
      ) : (
        <EmptyCard colors={colors} message="No calorie data for this period." />
      )}

      {/* ── Section 3: Macro Breakdown ────────────────────────────── */}
      <Text style={[s.sectionTitle, { color: colors.text }]}>Average Daily Macros</Text>
      {pieData.length > 0 ? (
        <View style={[s.chartCard, { backgroundColor: colors.card }]}>
          <Text style={[s.chartSubtitle, { color: colors.textSecondary }]}>
            Avg grams per day over {summaries.length} day{summaries.length !== 1 ? 's' : ''}
          </Text>
          <PieChart
            data={pieData}
            width={chartWidth}
            height={200}
            chartConfig={chartConfig}
            accessor="grams"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
          {macroRates.length > 0 && (
            <View style={s.macroPillRow}>
              {macroRates.map(m => (
                <View key={m.label} style={[s.macroPill, { borderColor: m.color }]}>
                  <Text style={[s.macroPillText, { color: m.color }]}>
                    {m.label}: {m.hit}/{m.total}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <EmptyCard colors={colors} message="No macro data for this period." />
      )}

      {/* ── Section 4: Weight Progress ────────────────────────────── */}
      <Text style={[s.sectionTitle, { color: colors.text }]}>Weight Progress</Text>
      {wData && wData.datasets[0].data.length > 0 ? (
        <View style={[s.chartCard, { backgroundColor: colors.card }]}>
          <LineChart
            data={wData}
            width={chartWidth}
            height={220}
            yAxisSuffix=" lbs"
            yAxisLabel=""
            chartConfig={{
              ...chartConfig,
              color: (opacity = 1) => `rgba(156, 39, 176, ${opacity})`,
            }}
            bezier
            style={s.chart}
          />
          <View style={s.weightLegendRow}>
            <View style={s.legendItem}>
              <View style={[s.legendDash, { backgroundColor: '#5599DD' }]} />
              <Text style={[s.legendLabel, { color: colors.textSecondary }]}>
                Start {wStats?.startLbs} lbs
              </Text>
            </View>
            {goalProj?.goalLbs != null && goalProj.goalLbs !== wStats?.startLbs && (
              <View style={s.legendItem}>
                <View style={[s.legendDash, { backgroundColor: '#FF9800' }]} />
                <Text style={[s.legendLabel, { color: colors.textSecondary }]}>
                  Goal {goalProj.goalLbs} lbs
                </Text>
              </View>
            )}
          </View>
          {wStats && (
            <View style={s.weightStatsRow}>
              <WeightStatPill colors={colors} isDark={isDark} label="Start" value={`${wStats.startLbs} lbs`} />
              <WeightStatPill colors={colors} isDark={isDark} label="Current" value={`${wStats.currentLbs} lbs`} />
              <WeightStatPill colors={colors} isDark={isDark} label="Change" value={`${wStats.changeLbs > 0 ? '+' : ''}${wStats.changeLbs} lbs`} />
              <WeightStatPill colors={colors} isDark={isDark} label="Weekly" value={`${wStats.weeklyRate > 0 ? '+' : ''}${wStats.weeklyRate} lbs/wk`} />
            </View>
          )}
        </View>
      ) : (
        <EmptyCard colors={colors} message="No weight data yet." />
      )}

      {/* ── Section 5: Goal Projection ──────────────────────────── */}
      <Text style={[s.sectionTitle, { color: colors.text }]}>Goal Projection</Text>
      {!goalProj || goalProj.status === 'insufficient_data' ? (
        <EmptyCard colors={colors} icon="rocket-outline" message="Log at least 2 weights to see your goal projection." />
      ) : (
        <View style={[s.chartCard, { backgroundColor: colors.card }]}>
          <Ionicons
            name={
              goalProj.status === 'on_track' ? 'rocket-outline' :
              goalProj.status === 'behind' ? 'warning-outline' :
              goalProj.status === 'no_goal' ? 'help-circle-outline' : 'checkmark-circle-outline'
            }
            size={32}
            color={
              goalProj.status === 'on_track' ? '#7C3AED' :
              goalProj.status === 'behind' ? '#FF9800' : colors.textSecondary
            }
          />
          {goalProj.status === 'no_goal' ? (
            <Text style={[s.projText, { color: colors.textSecondary }]}>
              Set a target weight in your plan to see a projection.
            </Text>
          ) : goalProj.status === 'on_track' && goalProj.estimatedDate ? (
            <>
              <Text style={[s.projHeadline, { color: colors.text }]}>
                On track for {goalProj.goalLbs} lbs
              </Text>
              <Text style={[s.projDate, { color: '#7C3AED' }]}>
                ~{goalProj.estimatedDate}
              </Text>
              <Text style={[s.projDetail, { color: colors.textSecondary }]}>
                {goalProj.weeklyRateLbs > 0 ? '+' : ''}{goalProj.weeklyRateLbs} lbs/week · ~{goalProj.estimatedWeeks} weeks remaining
              </Text>
            </>
          ) : goalProj.status === 'behind' ? (
            <>
              <Text style={[s.projHeadline, { color: colors.text }]}>
                Not trending toward goal
              </Text>
              <Text style={[s.projDetail, { color: colors.textSecondary }]}>
                Current rate: {goalProj.weeklyRateLbs > 0 ? '+' : ''}{goalProj.weeklyRateLbs} lbs/week — needs to reverse to reach {goalProj.goalLbs} lbs
              </Text>
            </>
          ) : (
            <Text style={[s.projHeadline, { color: '#7C3AED' }]}>
              You've reached your goal weight!
            </Text>
          )}
          <View style={[s.confidencePill, { backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0' }]}>
            <Text style={[s.confidenceText, { color: colors.textSecondary }]}>
              Confidence: {goalProj.confidence}
            </Text>
          </View>
        </View>
      )}

      {/* ── Section 6: Day-of-Week Patterns ──────────────────────── */}
      <Text style={[s.sectionTitle, { color: colors.text }]}>Weekly Patterns</Text>
      {patterns.length > 0 && patterns.some(p => p.sampleSize > 0) ? (
        <View style={[s.chartCard, { backgroundColor: colors.card }]}>
          {patterns
            .filter(p => p.sampleSize > 0)
            .sort((a, b) => a.dayIndex - b.dayIndex)
            .map(p => {
              const adherence = p.calorieAdherenceRate;
              const barColor =
                adherence >= 70 ? '#7C3AED' :
                adherence >= 40 ? '#FF9800' : '#F44336';
              return (
                <View key={p.day} style={s.patternRow}>
                  <Text style={[s.patternDay, { color: colors.text }]}>{p.day.slice(0, 3)}</Text>
                  <View style={[s.patternBarTrack, { backgroundColor: isDark ? '#333' : '#eee' }]}>
                    <View style={[s.patternBarFill, { width: `${Math.min(adherence, 100)}%`, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[s.patternPct, { color: colors.textSecondary }]}>{adherence}%</Text>
                </View>
              );
            })}
          <Text style={[s.patternHint, { color: colors.textTertiary }]}>
            Calorie goal adherence by day of week
          </Text>
        </View>
      ) : (
        <EmptyCard colors={colors} icon="calendar-outline" message="Log meals for at least 7 days to see your weekly patterns." />
      )}

      {/* ── Section 7: Correlations ──────────────────────────────── */}
      <Text style={[s.sectionTitle, { color: colors.text }]}>Patterns &amp; Correlations</Text>
      {correlations.length > 0 ? (
        <>
          {correlations.map(c => (
            <View key={c.id} style={[s.corrCard, { backgroundColor: colors.card }]}>
              <Ionicons
                name={
                  c.type === 'positive' ? 'trending-up' :
                  c.type === 'negative' ? 'trending-down' : 'swap-horizontal'
                }
                size={20}
                color={
                  c.type === 'positive' ? '#7C3AED' :
                  c.type === 'negative' ? '#F44336' : '#2196F3'
                }
              />
              <View style={s.corrTextWrap}>
                <Text style={[s.corrDesc, { color: colors.text }]}>{c.description}</Text>
                <Text style={[s.corrStrength, { color: colors.textTertiary }]}>
                  {c.strength} correlation
                </Text>
              </View>
            </View>
          ))}
        </>
      ) : (
        <EmptyCard colors={colors} icon="git-compare-outline" message="Keep logging for 7+ days — we'll find patterns in your data." />
      )}

      <View style={{ height: 16 }} />
    </ScrollView>
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function StatCard({
  colors,
  icon,
  iconColor,
  label,
  value,
}: {
  colors: { card: string; text: string; textSecondary: string };
  icon: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <View style={[s.statCard, { backgroundColor: colors.card }]}>
      <Ionicons name={icon} size={24} color={iconColor} />
      <Text style={[s.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[s.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function WeightStatPill({
  colors,
  isDark,
  label,
  value,
}: {
  colors: { textSecondary: string };
  isDark: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={[s.wStatPill, { backgroundColor: isDark ? '#2d1f33' : '#f3e5f5' }]}>
      <Text style={[s.wStatLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={s.wStatValue}>{value}</Text>
    </View>
  );
}

function EmptyCard({
  colors,
  message,
  icon,
}: {
  colors: { card: string; textTertiary: string };
  message: string;
  icon?: string;
}) {
  return (
    <View style={[s.emptyCard, { backgroundColor: colors.card }]}>
      <Ionicons name={icon ?? 'analytics-outline'} size={28} color={colors.textTertiary} />
      <Text style={[s.emptyText, { color: colors.textTertiary }]}>{message}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f8f8' },
  scrollArea: { flex: 1 },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
  },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#eee',
  },
  filterPillActive: { backgroundColor: '#7C3AED' },
  filterText: { fontSize: 14, color: '#555', fontWeight: '500' },
  filterTextActive: { color: '#fff' },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    marginBottom: 10,
    marginTop: 8,
  },

  // Overview stat cards
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  statCard: {
    width: '48%' as any,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 6 },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  // Chart cards
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    alignItems: 'center',
  },
  chart: { borderRadius: 12 },
  goalLine: { fontSize: 13, color: '#555', marginTop: 8, textAlign: 'center' },
  chartSubtitle: { fontSize: 12, marginBottom: 4, textAlign: 'center' },

  // Macro pills
  macroPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  macroPill: {
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  macroPillText: { fontSize: 12, fontWeight: '600' },

  // Weight legend
  weightLegendRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    marginTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDash: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Weight stats
  weightStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  wStatPill: {
    alignItems: 'center',
    backgroundColor: '#f3e5f5',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  wStatLabel: { fontSize: 10, color: '#888' },
  wStatValue: { fontSize: 13, fontWeight: '700', color: '#9C27B0' },

  // Goal projection
  projHeadline: { fontSize: 17, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  projDate: { fontSize: 22, fontWeight: '800', marginTop: 4, textAlign: 'center' },
  projDetail: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  projText: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  confidencePill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  confidenceText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' as any },

  // Day-of-week patterns
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  patternDay: { width: 36, fontSize: 13, fontWeight: '600' },
  patternBarTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  patternBarFill: { height: '100%' as any, borderRadius: 7 },
  patternPct: { width: 36, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  patternHint: { fontSize: 11, marginTop: 8, textAlign: 'center' },

  // Correlations
  corrCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  corrTextWrap: { flex: 1 },
  corrDesc: { fontSize: 14, lineHeight: 20 },
  corrStrength: { fontSize: 11, marginTop: 3, textTransform: 'capitalize' as any },

  // Empty state
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyText: { fontSize: 14, color: '#aaa', marginTop: 8 },
});
