import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LineChart, PieChart } from 'react-native-chart-kit';
import CustomBarChart from '../components/CustomBarChart';
import { useTheme } from '../contexts/ThemeContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import ImpersonateModal from '../components/ImpersonateModal';
import { ErrorState } from '../components/ErrorState';
import { getUserFriendlyError } from '../utils/errorMessages';
import {
  getUsageOverview,
  getUsageByDay,
  getUserUsageStats,
  getRecentActivity,
  getToolUsageStats,
  getToolCostStats,
  getMonthlyAvgPerUser,
  getActiveUserCounts,
  getRoleDistribution,
  getRecentErrors,
  updateUserRole,
  type UsageOverview,
  type DailyUsage,
  type UserUsage,
  type RecentLogEntry,
  type ToolUsageStat,
  type ToolCostStat,
  type MonthlyUserCost,
  type ActiveUserCounts,
  type RoleCount,
} from '../services/adminAnalytics';
import s from './AdminDashboard.styles';

// ── Helpers ───────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCost(n: number): string {
  return `$${n.toFixed(n >= 1 ? 2 : 4)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#E91E63',
  beta: '#9C27B0',
  pro: '#FF9800',
  standard: '#2196F3',
  byok: '#607D8B',
};

const CHART_FILTER_DAYS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: 'All', value: 0 },
];

const PIE_COLORS = [
  '#7C3AED', '#2196F3', '#FF9800', '#9C27B0', '#E91E63',
  '#00BCD4', '#FF5722', '#3F51B5', '#8BC34A', '#FFC107',
  '#795548', '#009688', '#F44336', '#673AB7',
];

const ROLES = ['admin', 'beta', 'pro', 'standard', 'byok'];

// ── Component ─────────────────────────────────────────────────────────

export default function AdminDashboard(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const { isImpersonating } = useImpersonation();
  const chartWidth = screenWidth - 40;

  const [loading, setLoading] = useState(true);
  const [impersonateVisible, setImpersonateVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<UsageOverview | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [users, setUsers] = useState<UserUsage[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLogEntry[]>([]);
  const [toolStats, setToolStats] = useState<ToolUsageStat[]>([]);
  const [toolCostStats, setToolCostStats] = useState<ToolCostStat[]>([]);
  const [monthlyUserCost, setMonthlyUserCost] = useState<MonthlyUserCost[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUserCounts | null>(null);
  const [roleDistribution, setRoleDistribution] = useState<RoleCount[]>([]);
  const [recentErrors, setRecentErrors] = useState<RecentLogEntry[]>([]);

  const [chartDays, setChartDays] = useState(30);
  const [rolePickerUser, setRolePickerUser] = useState<UserUsage | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [ov, daily, userList, recent, tools, toolCosts, monthly, active, roles, errors] = await Promise.all([
        getUsageOverview(),
        getUsageByDay(chartDays || 365),
        getUserUsageStats(),
        getRecentActivity(20),
        getToolUsageStats(),
        getToolCostStats(),
        getMonthlyAvgPerUser(),
        getActiveUserCounts(),
        getRoleDistribution(),
        getRecentErrors(10),
      ]);
      setOverview(ov);
      setDailyUsage(daily);
      setUsers(userList);
      setRecentLogs(recent);
      setToolStats(tools);
      setToolCostStats(toolCosts);
      setMonthlyUserCost(monthly);
      setActiveUsers(active);
      setRoleDistribution(roles);
      setRecentErrors(errors);
    } catch (e) {
      setError(getUserFriendlyError(e));
    }
  }, [chartDays]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // ── Chart configs ─────────────────────────────────────────────────

  const chartConfig = useMemo(() => ({
    backgroundGradientFrom: isDark ? '#1e1e1e' : '#ffffff',
    backgroundGradientTo: isDark ? '#1e1e1e' : '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => isDark ? `rgba(76, 175, 80, ${opacity})` : `rgba(76, 175, 80, ${opacity})`,
    labelColor: () => colors.textSecondary,
    propsForBackgroundLines: {
      strokeDasharray: '4 4',
      stroke: colors.border,
    },
    propsForLabels: {
      fontSize: 10,
    },
    barPercentage: 0.5,
  }), [isDark, colors]);

  const callsLineData = useMemo(() => {
    if (dailyUsage.length === 0) return null;
    const maxLabels = 7;
    const step = Math.max(1, Math.floor(dailyUsage.length / maxLabels));
    return {
      labels: dailyUsage.map((d, i) => (i % step === 0 ? shortDate(d.date) : '')),
      datasets: [{ data: dailyUsage.map(d => d.calls), strokeWidth: 2 }],
    };
  }, [dailyUsage]);

  const tokensBarData = useMemo(() => {
    if (dailyUsage.length === 0) return null;
    const recent = dailyUsage.slice(-14);
    return {
      labels: recent.map(d => shortDate(d.date)),
      datasets: [{ data: recent.map(d => d.tokens) }],
    };
  }, [dailyUsage]);

  const toolPieData = useMemo(() => {
    if (toolStats.length === 0) return [];
    return toolStats.slice(0, 10).map((t, i) => ({
      name: t.tool.replace(/_/g, ' '),
      count: t.count,
      color: PIE_COLORS[i % PIE_COLORS.length],
      legendFontColor: colors.textSecondary,
      legendFontSize: 10,
    }));
  }, [toolStats, colors]);

  // ── Role change handler ───────────────────────────────────────────

  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      setUsers(prev => prev.map(u =>
        u.userId === userId ? { ...u, role: newRole } : u
      ));
      setRolePickerUser(null);
    } catch (e) {
      Alert.alert('Role update failed', getUserFriendlyError(e));
    }
  }, []);

  // ── Render states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.text }]}>Admin</Text>
        </View>
        <View style={s.centerState}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Text style={[s.headerTitle, { color: colors.text }]}>Admin</Text>
        </View>
        <View style={s.centerState}>
          <ErrorState message={error} onRetry={onRefresh} />
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.text }]}>Admin</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!isImpersonating && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#EF4444',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                gap: 5,
              }}
              onPress={() => setImpersonateVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-horizontal" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Impersonate</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Section 1: Overview Cards ─────────────────────────────── */}
        {overview && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Usage Overview</Text>
            <View style={s.overviewGrid}>
              <OverviewCard
                label="Today"
                value={fmtNum(overview.todayCalls)}
                sub={`${fmtCost(overview.todayCost)} spent`}
                color="#7C3AED"
                bgColor={isDark ? '#1a1033' : '#EDE9FE'}
              />
              <OverviewCard
                label="This Week"
                value={fmtNum(overview.weekCalls)}
                sub={`${fmtCost(overview.weekCost)} spent`}
                color="#2196F3"
                bgColor={isDark ? '#1a2a3e' : '#E3F2FD'}
              />
              <OverviewCard
                label="This Month"
                value={fmtNum(overview.monthCalls)}
                sub={`${fmtCost(overview.monthCost)} spent`}
                color="#FF9800"
                bgColor={isDark ? '#2e2a1a' : '#FFF3E0'}
              />
              <OverviewCard
                label="All Time"
                value={fmtNum(overview.totalCalls)}
                sub={`${fmtNum(overview.totalTokens)} tokens`}
                color="#9C27B0"
                bgColor={isDark ? '#2a1a2e' : '#F3E5F5'}
              />
              <OverviewCard
                label="Total Cost"
                value={fmtCost(overview.totalCostUsd)}
                sub={`${overview.uniqueUsers} user${overview.uniqueUsers !== 1 ? 's' : ''}`}
                color="#E91E63"
                bgColor={isDark ? '#2e1a22' : '#FCE4EC'}
              />
              <OverviewCard
                label="Avg / User"
                value={fmtCost(overview.avgCostPerUser)}
                sub="all-time average"
                color="#00BCD4"
                bgColor={isDark ? '#1a2a2e' : '#E0F7FA'}
              />
              <OverviewCard
                label="Avg Latency"
                value={`${fmtNum(overview.avgLatencyMs)}ms`}
                sub={`${overview.errorRate.toFixed(1)}% error rate`}
                color={overview.errorRate > 5 ? '#d32f2f' : '#7C3AED'}
                bgColor={isDark ? '#1e1e1e' : '#FAFAFA'}
              />
            </View>
          </View>
        )}

        {/* ─── Active Users ────────────────────────────────────────────── */}
        {activeUsers && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Active Users</Text>
            <View style={s.overviewGrid}>
              <OverviewCard
                label="Today"
                value={fmtNum(activeUsers.daily)}
                sub="active today"
                color="#7C3AED"
                bgColor={isDark ? '#1a1033' : '#EDE9FE'}
              />
              <OverviewCard
                label="This Week"
                value={fmtNum(activeUsers.weekly)}
                sub="last 7 days"
                color="#2196F3"
                bgColor={isDark ? '#1a2a3e' : '#E3F2FD'}
              />
              <OverviewCard
                label="This Month"
                value={fmtNum(activeUsers.monthly)}
                sub="last 30 days"
                color="#FF9800"
                bgColor={isDark ? '#2e2a1a' : '#FFF3E0'}
              />
              <OverviewCard
                label="All Time"
                value={fmtNum(activeUsers.total)}
                sub="ever active"
                color="#9C27B0"
                bgColor={isDark ? '#2a1a2e' : '#F3E5F5'}
              />
            </View>
          </View>
        )}

        {/* ─── Users by Role ─────────────────────────────────────────── */}
        {roleDistribution.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Users by Role</Text>
            <View style={[s.costCard, { backgroundColor: colors.surface }]}>
              {(() => {
                const maxCount = Math.max(...roleDistribution.map(r => r.count), 1);
                const totalUsers = roleDistribution.reduce((sum, r) => sum + r.count, 0);
                return roleDistribution.map((r, i) => (
                  <View key={r.role}>
                    <View style={s.costRow}>
                      <View style={[s.costLabel, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ROLE_COLORS[r.role] ?? '#607D8B' }} />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{r.role}</Text>
                      </View>
                      <View style={s.costBarArea}>
                        <View
                          style={[
                            s.costBarFill,
                            {
                              backgroundColor: ROLE_COLORS[r.role] ?? '#607D8B',
                              width: `${Math.max((r.count / maxCount) * 100, 6)}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[s.costAmount, { color: ROLE_COLORS[r.role] ?? '#607D8B' }]}>
                        {fmtNum(r.count)}
                      </Text>
                    </View>
                    <View style={s.costMeta}>
                      <Text style={[s.costMetaText, { color: colors.textTertiary }]}>
                        {totalUsers > 0 ? `${Math.round((r.count / totalUsers) * 100)}%` : '0%'} of all users
                      </Text>
                    </View>
                    {i < roleDistribution.length - 1 && (
                      <View style={[s.costDivider, { backgroundColor: colors.borderLight }]} />
                    )}
                  </View>
                ));
              })()}
            </View>
          </View>
        )}

        {/* ─── Monthly Avg Cost / User (subscription pricing) ────────── */}
        {monthlyUserCost.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Avg Cost / User / Month</Text>
            <View style={[s.costCard, { backgroundColor: colors.surface }]}>
              {(() => {
                const maxCost = Math.max(...monthlyUserCost.map(m => m.avgCostPerUser), 0.01);
                return monthlyUserCost.map((m, i) => (
                  <View key={m.month}>
                    <View style={s.costRow}>
                      <Text style={[s.costLabel, { color: colors.text }]}>{m.monthLabel}</Text>
                      <View style={s.costBarArea}>
                        <View
                          style={[
                            s.costBarFill,
                            {
                              backgroundColor: '#E91E63',
                              width: `${Math.max((m.avgCostPerUser / maxCost) * 100, 4)}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[s.costAmount, { color: '#E91E63' }]}>{fmtCost(m.avgCostPerUser)}</Text>
                    </View>
                    <View style={s.costMeta}>
                      <Text style={[s.costMetaText, { color: colors.textTertiary }]}>
                        {fmtCost(m.totalCost)} total · {m.uniqueUsers} user{m.uniqueUsers !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {i < monthlyUserCost.length - 1 && (
                      <View style={[s.costDivider, { backgroundColor: colors.borderLight }]} />
                    )}
                  </View>
                ));
              })()}
            </View>
          </View>
        )}

        {/* ─── Section 2: Usage Charts ───────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Usage Over Time</Text>
          <View style={s.filterRow}>
            {CHART_FILTER_DAYS.map(f => {
              const active = f.value === chartDays;
              return (
                <TouchableOpacity
                  key={f.label}
                  style={[
                    s.filterBtn,
                    { borderColor: colors.border },
                    active && s.filterBtnActive,
                  ]}
                  onPress={() => setChartDays(f.value)}
                >
                  <Text style={[s.filterText, { color: colors.text }, active && s.filterTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {callsLineData ? (
            <View style={[s.chartContainer, { backgroundColor: colors.surface }]}>
              <Text style={[s.overviewLabel, { color: colors.textSecondary, padding: 12, paddingBottom: 0 }]}>
                API Calls / Day
              </Text>
              <LineChart
                data={callsLineData}
                width={chartWidth}
                height={180}
                chartConfig={chartConfig}
                bezier
                withDots={false}
                withInnerLines
                withOuterLines={false}
                fromZero
                style={{ borderRadius: 12 }}
              />
            </View>
          ) : (
            <Text style={[s.emptyText, { color: colors.textTertiary }]}>No usage data yet</Text>
          )}

          {tokensBarData && (
            <View style={[s.chartContainer, { backgroundColor: colors.surface, marginTop: 12 }]}>
              <Text style={[s.overviewLabel, { color: colors.textSecondary, padding: 12, paddingBottom: 0 }]}>
                Tokens / Day (last 14d)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <CustomBarChart
                  labels={tokensBarData.labels}
                  data={tokensBarData.datasets[0].data}
                  width={Math.max(chartWidth, tokensBarData.labels.length * 50)}
                  height={180}
                  barColor={colors.accent}
                  labelColor={colors.textSecondary}
                  gridColor={colors.border}
                />
              </ScrollView>
            </View>
          )}
        </View>

        {/* ─── Section 2b: Tool Usage ────────────────────────────────── */}
        {toolPieData.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Tool Usage Breakdown</Text>
            <View style={[s.chartContainer, { backgroundColor: colors.surface }]}>
              <PieChart
                data={toolPieData}
                width={chartWidth}
                height={200}
                chartConfig={chartConfig}
                accessor="count"
                backgroundColor="transparent"
                paddingLeft="15"
                absolute
              />
            </View>
          </View>
        )}

        {/* ─── Avg Cost Per Tool ──────────────────────────────────────── */}
        {toolCostStats.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Avg Cost Per Tool Call</Text>
            <View style={[s.costCard, { backgroundColor: colors.surface }]}>
              {(() => {
                const top = toolCostStats.slice(0, 10);
                const maxCost = Math.max(...top.map(t => t.avgCost), 0.001);
                return top.map((t, i) => (
                  <View key={t.tool}>
                    <View style={s.costRow}>
                      <Text style={[s.costLabel, { color: colors.text }]} numberOfLines={1}>
                        {t.tool.replace(/_/g, ' ')}
                      </Text>
                      <View style={s.costBarArea}>
                        <View
                          style={[
                            s.costBarFill,
                            {
                              backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                              width: `${Math.max((t.avgCost / maxCost) * 100, 4)}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[s.costAmount, { color: PIE_COLORS[i % PIE_COLORS.length] }]}>
                        {fmtCost(t.avgCost)}
                      </Text>
                    </View>
                    <View style={s.costMeta}>
                      <Text style={[s.costMetaText, { color: colors.textTertiary }]}>
                        {t.count}× used · {fmtCost(t.totalCost)} total
                      </Text>
                    </View>
                    {i < top.length - 1 && (
                      <View style={[s.costDivider, { backgroundColor: colors.borderLight }]} />
                    )}
                  </View>
                ));
              })()}
            </View>
          </View>
        )}

        {/* ─── Section 3: User Breakdown ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>User Breakdown</Text>
          {users.length > 0 ? (
            <>
              <View style={[s.tableHeader, { borderBottomColor: colors.border }]}>
                <View style={s.cellEmail}>
                  <Text style={[s.tableHeaderText, { color: colors.textSecondary }]}>Email</Text>
                </View>
                <View style={s.cellRole}>
                  <Text style={[s.tableHeaderText, { color: colors.textSecondary }]}>Role</Text>
                </View>
                <View style={s.cellCalls}>
                  <Text style={[s.tableHeaderText, { color: colors.textSecondary }]}>Calls</Text>
                </View>
                <View style={s.cellCost}>
                  <Text style={[s.tableHeaderText, { color: colors.textSecondary }]}>Cost</Text>
                </View>
              </View>
              {users.map(u => (
                <TouchableOpacity
                  key={u.userId}
                  style={[s.tableRow, { borderBottomColor: colors.borderLight }]}
                  onPress={() => setRolePickerUser(u)}
                  activeOpacity={0.6}
                >
                  <View style={s.cellEmail}>
                    <Text style={[s.cellText, { color: colors.text }]} numberOfLines={1}>
                      {u.email}
                    </Text>
                  </View>
                  <View style={s.cellRole}>
                    <View style={[s.roleBadge, { backgroundColor: (ROLE_COLORS[u.role] ?? '#607D8B') + '20' }]}>
                      <Text style={[s.roleBadgeText, { color: ROLE_COLORS[u.role] ?? '#607D8B' }]}>
                        {u.role}
                      </Text>
                    </View>
                  </View>
                  <View style={s.cellCalls}>
                    <Text style={[s.cellText, { color: colors.text }]}>{fmtNum(u.totalCalls)}</Text>
                  </View>
                  <View style={s.cellCost}>
                    <Text style={[s.cellText, { color: colors.text }]}>{fmtCost(u.totalCost)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <Text style={[s.emptyText, { color: colors.textTertiary }]}>No users with API usage yet</Text>
          )}
        </View>

        {/* ─── Section 4: Recent Activity ────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
          {recentLogs.length > 0 ? (
            recentLogs.map(log => (
              <View key={log.id} style={[s.activityCard, { backgroundColor: colors.surface }]}>
                <View style={s.activityTop}>
                  <Text style={[s.activityEmail, { color: colors.text }]} numberOfLines={1}>
                    {log.userEmail}
                  </Text>
                  <View style={[s.activityStatus, { backgroundColor: log.success ? '#7C3AED' : '#d32f2f' }]} />
                </View>
                <View style={s.activityMeta}>
                  <Text style={[s.activityMetaItem, { color: colors.textSecondary }]}>
                    {timeAgo(log.createdAt)}
                  </Text>
                  <Text style={[s.activityMetaItem, { color: colors.textSecondary }]}>
                    {fmtNum(log.totalTokens)} tok
                  </Text>
                  <Text style={[s.activityMetaItem, { color: colors.textSecondary }]}>
                    {fmtCost(log.estimatedCostUsd)}
                  </Text>
                  <Text style={[s.activityMetaItem, { color: colors.textSecondary }]}>
                    {fmtNum(log.latencyMs)}ms
                  </Text>
                </View>
                {log.toolsUsed && log.toolsUsed.length > 0 && (
                  <Text style={[s.activityMetaItem, { color: colors.textTertiary, marginTop: 4 }]}>
                    Tools: {log.toolsUsed.join(', ')}
                  </Text>
                )}
                {log.errorMessage && (
                  <Text style={[s.activityError, { color: colors.error }]} numberOfLines={2}>
                    {log.errorMessage}
                  </Text>
                )}
              </View>
            ))
          ) : (
            <Text style={[s.emptyText, { color: colors.textTertiary }]}>No recent activity</Text>
          )}
        </View>

        {/* ─── Section 5: Error Analysis ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Recent Errors</Text>
          {recentErrors.length > 0 ? (
            recentErrors.map(log => (
              <View key={log.id} style={[s.activityCard, { backgroundColor: isDark ? '#2e1a1a' : '#FFEBEE' }]}>
                <View style={s.activityTop}>
                  <Text style={[s.activityEmail, { color: colors.text }]} numberOfLines={1}>
                    {log.userEmail}
                  </Text>
                  <Text style={[s.activityMetaItem, { color: colors.textSecondary }]}>
                    {timeAgo(log.createdAt)}
                  </Text>
                </View>
                <Text style={[s.activityError, { color: colors.error }]} numberOfLines={3}>
                  {log.errorMessage || 'Unknown error'}
                </Text>
                <View style={s.activityMeta}>
                  <Text style={[s.activityMetaItem, { color: colors.textSecondary }]}>
                    {fmtNum(log.latencyMs)}ms
                  </Text>
                  <Text style={[s.activityMetaItem, { color: colors.textSecondary }]}>
                    {log.model}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[s.emptyText, { color: '#7C3AED' }]}>No errors — looking good!</Text>
          )}
        </View>
      </ScrollView>

      {/* ─── Role Picker Modal ─────────────────────────────────────── */}
      <Modal
        visible={!!rolePickerUser}
        transparent
        animationType="fade"
        onRequestClose={() => setRolePickerUser(null)}
      >
        <TouchableOpacity
          style={s.rolePickerOverlay}
          activeOpacity={1}
          onPress={() => setRolePickerUser(null)}
        >
          <View style={[s.rolePickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[s.rolePickerTitle, { color: colors.text }]}>
              Change Role
            </Text>
            <Text style={[s.cellText, { color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }]}>
              {rolePickerUser?.email}
            </Text>
            {ROLES.map(role => (
              <TouchableOpacity
                key={role}
                style={[
                  s.roleOption,
                  rolePickerUser?.role === role && s.roleOptionActive,
                ]}
                onPress={() => rolePickerUser && handleRoleChange(rolePickerUser.userId, role)}
              >
                <Text style={[s.roleOptionText, { color: ROLE_COLORS[role] ?? colors.text }]}>
                  {role}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.rolePickerCancel} onPress={() => setRolePickerUser(null)}>
              <Text style={[s.rolePickerCancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ImpersonateModal visible={impersonateVisible} onClose={() => setImpersonateVisible(false)} />
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  sub,
  color,
  bgColor,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={[s.overviewCard, { backgroundColor: bgColor }]}>
      <Text style={[s.overviewLabel, { color }]}>{label}</Text>
      <Text style={[s.overviewValue, { color }]}>{value}</Text>
      <Text style={[s.overviewSub, { color: color + '99' }]}>{sub}</Text>
    </View>
  );
}
