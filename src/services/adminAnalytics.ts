import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────

export interface UsageOverview {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  errorRate: number;
  todayCalls: number;
  weekCalls: number;
  monthCalls: number;
  todayCost: number;
  weekCost: number;
  monthCost: number;
  uniqueUsers: number;
  avgCostPerUser: number;
}

export interface DailyUsage {
  date: string;
  calls: number;
  tokens: number;
  cost: number;
  errors: number;
}

export interface UserUsage {
  userId: string;
  email: string;
  role: string;
  totalCalls: number;
  totalCost: number;
  totalTokens: number;
}

export interface RecentLogEntry {
  id: string;
  createdAt: string;
  userEmail: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  success: boolean;
  errorMessage: string | null;
  toolsUsed: string[] | null;
}

export interface ToolUsageStat {
  tool: string;
  count: number;
}

export interface ToolCostStat {
  tool: string;
  totalCost: number;
  avgCost: number;
  count: number;
}

export interface ActiveUserCounts {
  daily: number;
  weekly: number;
  monthly: number;
  total: number;
}

export interface RoleCount {
  role: string;
  count: number;
}

export interface MonthlyUserCost {
  month: string;        // YYYY-MM
  monthLabel: string;   // e.g. "Feb '26"
  totalCost: number;
  uniqueUsers: number;
  avgCostPerUser: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayStartISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Queries ───────────────────────────────────────────────────────────

/** Aggregate overview stats for the admin dashboard header cards. */
export async function getUsageOverview(): Promise<UsageOverview> {
  const { data: all, error } = await supabase
    .from('ai_usage_logs')
    .select('user_id, estimated_cost_usd, total_tokens, latency_ms, success, created_at');

  if (error) throw error;
  const rows = all ?? [];

  const now = new Date();
  const todayStart = todayStartISO();
  const weekStart = daysAgoISO(7);
  const monthStart = daysAgoISO(30);

  let totalCost = 0;
  let totalTokens = 0;
  let totalLatency = 0;
  let errorCount = 0;
  let todayCalls = 0;
  let weekCalls = 0;
  let monthCalls = 0;
  let todayCost = 0;
  let weekCost = 0;
  let monthCost = 0;
  const userIds = new Set<string>();

  for (const r of rows) {
    const cost = Number(r.estimated_cost_usd ?? 0);
    totalCost += cost;
    totalTokens += Number(r.total_tokens ?? 0);
    totalLatency += Number(r.latency_ms ?? 0);
    if (!r.success) errorCount++;
    if (r.created_at >= todayStart) { todayCalls++; todayCost += cost; }
    if (r.created_at >= weekStart) { weekCalls++; weekCost += cost; }
    if (r.created_at >= monthStart) { monthCalls++; monthCost += cost; }
    if (r.user_id) userIds.add(r.user_id);
  }

  const uniqueUsers = userIds.size;

  return {
    totalCalls: rows.length,
    totalTokens,
    totalCostUsd: totalCost,
    avgLatencyMs: rows.length ? Math.round(totalLatency / rows.length) : 0,
    errorRate: rows.length ? (errorCount / rows.length) * 100 : 0,
    todayCalls,
    weekCalls,
    monthCalls,
    todayCost,
    weekCost,
    monthCost,
    uniqueUsers,
    avgCostPerUser: uniqueUsers > 0 ? totalCost / uniqueUsers : 0,
  };
}

/** Daily breakdown for charts. Returns last N days of usage data. */
export async function getUsageByDay(days: number = 30): Promise<DailyUsage[]> {
  const since = daysAgoISO(days);

  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('created_at, total_tokens, estimated_cost_usd, success')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const byDay = new Map<string, DailyUsage>();

  for (const r of data ?? []) {
    const date = r.created_at.slice(0, 10);
    const existing = byDay.get(date) ?? { date, calls: 0, tokens: 0, cost: 0, errors: 0 };
    existing.calls++;
    existing.tokens += Number(r.total_tokens ?? 0);
    existing.cost += Number(r.estimated_cost_usd ?? 0);
    if (!r.success) existing.errors++;
    byDay.set(date, existing);
  }

  return Array.from(byDay.values());
}

/** Per-user usage breakdown, joined with profile for email/role. */
export async function getUserUsageStats(): Promise<UserUsage[]> {
  const { data: logs, error: logsErr } = await supabase
    .from('ai_usage_logs')
    .select('user_id, total_tokens, estimated_cost_usd');

  if (logsErr) throw logsErr;

  const byUser = new Map<string, { calls: number; tokens: number; cost: number }>();
  for (const r of logs ?? []) {
    const uid = r.user_id;
    const existing = byUser.get(uid) ?? { calls: 0, tokens: 0, cost: 0 };
    existing.calls++;
    existing.tokens += Number(r.total_tokens ?? 0);
    existing.cost += Number(r.estimated_cost_usd ?? 0);
    byUser.set(uid, existing);
  }

  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, role');

  if (profErr) throw profErr;

  const profileMap = new Map<string, { email: string; role: string }>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, { email: p.email ?? 'unknown', role: p.role ?? 'byok' });
  }

  const result: UserUsage[] = [];
  for (const [userId, stats] of byUser) {
    const profile = profileMap.get(userId);
    result.push({
      userId,
      email: profile?.email ?? 'unknown',
      role: profile?.role ?? 'byok',
      totalCalls: stats.calls,
      totalCost: stats.cost,
      totalTokens: stats.tokens,
    });
  }

  result.sort((a, b) => b.totalCost - a.totalCost);
  return result;
}

/** Most recent API calls across all users. */
export async function getRecentActivity(limit: number = 20): Promise<RecentLogEntry[]> {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const userIds = [...new Set((data ?? []).map(r => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds);

  const emailMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    emailMap.set(p.id, p.email ?? 'unknown');
  }

  return (data ?? []).map(r => ({
    id: r.id,
    createdAt: r.created_at,
    userEmail: emailMap.get(r.user_id) ?? 'unknown',
    model: r.model,
    tokensInput: r.tokens_input,
    tokensOutput: r.tokens_output,
    totalTokens: r.total_tokens,
    estimatedCostUsd: Number(r.estimated_cost_usd ?? 0),
    latencyMs: r.latency_ms,
    success: r.success,
    errorMessage: r.error_message,
    toolsUsed: r.tools_used,
  }));
}

/** Aggregate tool usage counts from the tools_used JSONB field. */
export async function getToolUsageStats(): Promise<ToolUsageStat[]> {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('tools_used')
    .not('tools_used', 'is', null);

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const tools: string[] = Array.isArray(r.tools_used) ? r.tools_used : [];
    for (const t of tools) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);
}

/** Recent errors only. */
export async function getRecentErrors(limit: number = 20): Promise<RecentLogEntry[]> {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('*')
    .eq('success', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const userIds = [...new Set((data ?? []).map(r => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds);

  const emailMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    emailMap.set(p.id, p.email ?? 'unknown');
  }

  return (data ?? []).map(r => ({
    id: r.id,
    createdAt: r.created_at,
    userEmail: emailMap.get(r.user_id) ?? 'unknown',
    model: r.model,
    tokensInput: r.tokens_input,
    tokensOutput: r.tokens_output,
    totalTokens: r.total_tokens,
    estimatedCostUsd: Number(r.estimated_cost_usd ?? 0),
    latencyMs: r.latency_ms,
    success: false,
    errorMessage: r.error_message,
    toolsUsed: r.tools_used,
  }));
}

/** Average cost per tool invocation. Uses logs that have tools_used populated. */
export async function getToolCostStats(): Promise<ToolCostStat[]> {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('tools_used, estimated_cost_usd')
    .not('tools_used', 'is', null);

  if (error) throw error;

  const map = new Map<string, { totalCost: number; count: number }>();

  for (const r of data ?? []) {
    const tools: string[] = Array.isArray(r.tools_used) ? r.tools_used : [];
    if (tools.length === 0) continue;
    const costPerTool = Number(r.estimated_cost_usd ?? 0) / tools.length;
    for (const t of tools) {
      const existing = map.get(t) ?? { totalCost: 0, count: 0 };
      existing.totalCost += costPerTool;
      existing.count++;
      map.set(t, existing);
    }
  }

  return Array.from(map.entries())
    .map(([tool, { totalCost, count }]) => ({
      tool,
      totalCost,
      avgCost: count > 0 ? totalCost / count : 0,
      count,
    }))
    .sort((a, b) => b.avgCost - a.avgCost);
}

/** Monthly breakdown of average cost per active user — the key subscription pricing metric. */
export async function getMonthlyAvgPerUser(): Promise<MonthlyUserCost[]> {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('user_id, estimated_cost_usd, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const byMonth = new Map<string, { cost: number; users: Set<string> }>();

  for (const r of data ?? []) {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const existing = byMonth.get(key) ?? { cost: 0, users: new Set<string>() };
    existing.cost += Number(r.estimated_cost_usd ?? 0);
    if (r.user_id) existing.users.add(r.user_id);
    byMonth.set(key, existing);
  }

  return Array.from(byMonth.entries()).map(([month, { cost, users }]) => {
    const [y, m] = month.split('-');
    const monthIdx = parseInt(m, 10) - 1;
    return {
      month,
      monthLabel: `${MONTH_LABELS[monthIdx]} '${y.slice(2)}`,
      totalCost: cost,
      uniqueUsers: users.size,
      avgCostPerUser: users.size > 0 ? cost / users.size : 0,
    };
  });
}

/** Count active users by time period (based on API calls). */
export async function getActiveUserCounts(): Promise<ActiveUserCounts> {
  const { data, error } = await supabase
    .from('ai_usage_logs')
    .select('user_id, created_at');

  if (error) throw error;

  const todayStart = todayStartISO();
  const weekStart = daysAgoISO(7);
  const monthStart = daysAgoISO(30);

  const dailyUsers = new Set<string>();
  const weeklyUsers = new Set<string>();
  const monthlyUsers = new Set<string>();
  const allUsers = new Set<string>();

  for (const r of data ?? []) {
    if (!r.user_id) continue;
    allUsers.add(r.user_id);
    if (r.created_at >= todayStart) dailyUsers.add(r.user_id);
    if (r.created_at >= weekStart) weeklyUsers.add(r.user_id);
    if (r.created_at >= monthStart) monthlyUsers.add(r.user_id);
  }

  return {
    daily: dailyUsers.size,
    weekly: weeklyUsers.size,
    monthly: monthlyUsers.size,
    total: allUsers.size,
  };
}

/** Count users per role from the profiles table. */
export async function getRoleDistribution(): Promise<RoleCount[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role');

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const role = r.role ?? 'byok';
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);
}

/** Update a user's role. Admin-only operation. */
export async function updateUserRole(
  userId: string,
  newRole: string,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}
