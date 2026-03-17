import { supabase } from './supabase';
import { enqueueWeightLog } from './offlineStore';

// ── Types ────────────────────────────────────────────────────────────

export interface DailySummary {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
}

export interface OverviewStats {
  streak: number;
  adherenceRate: number;
  adherenceDays: number;
  adherenceTotal: number;
  daysTracked: number;
}

export interface FriendStats {
  streak: number;
  daysTracked: number;
  adherencePct: number;
  goalType: string | null;
  goalCalories: number | null;
  goalProtein: number | null;
  goalCarbs: number | null;
  goalFat: number | null;
  startWeightKg: number | null;
  currentWeightKg: number | null;
  weightChangeKg: number | null;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgDays: number;
}

export interface WeightLog {
  id: string;
  weightKg: number;
  loggedAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** YYYY-MM-DD in local timezone. */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Queries ──────────────────────────────────────────────────────────

/**
 * Fetch daily macro totals for the last `days` days (or all time when 0).
 * Groups raw daily_logs rows client-side since Supabase JS doesn't support
 * GROUP BY directly.
 */
export async function getDailySummaries(days: number): Promise<DailySummary[]> {
  const userId = await getUserId();
  if (!userId) return [];

  let query = supabase
    .from('daily_logs')
    .select('logged_at, calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .order('logged_at', { ascending: true });

  if (days > 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    query = query.gte('logged_at', start.toISOString());
  }

  const { data: rows, error } = await query;
  if (error || !rows) return [];

  const map = new Map<string, DailySummary>();

  for (const r of rows) {
    const dateKey = toLocalDateString(new Date(r.logged_at));
    const existing = map.get(dateKey) ?? {
      date: dateKey,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      mealCount: 0,
    };
    existing.calories += r.calories || 0;
    existing.protein += Number(r.protein_g) || 0;
    existing.carbs += Number(r.carbs_g) || 0;
    existing.fat += Number(r.fat_g) || 0;
    existing.mealCount += 1;
    map.set(dateKey, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compute streak, adherence, and total days tracked.
 * Streak = consecutive calendar days (ending today) with at least 1 meal.
 * Adherence = days within ±10 % of `goalCalories` during the current week.
 */
export async function getOverviewStats(goalCalories: number): Promise<OverviewStats> {
  const summaries = await getDailySummaries(0);

  const dateSet = new Set(summaries.map(s => s.date));
  const daysTracked = dateSet.size;

  // Streak: walk backwards from today
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dateSet.has(toLocalDateString(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Adherence: current calendar week (Mon-Sun or last 7 days)
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);

  const lo = goalCalories * 0.9;
  const hi = goalCalories * 1.1;
  let adherenceDays = 0;
  let adherenceTotal = 0;

  for (let d = new Date(weekStart); d <= now; d.setDate(d.getDate() + 1)) {
    const key = toLocalDateString(d);
    const s = summaries.find(x => x.date === key);
    if (s && s.mealCount > 0) {
      adherenceTotal++;
      if (s.calories >= lo && s.calories <= hi) adherenceDays++;
    }
  }

  return {
    streak,
    adherenceRate: adherenceTotal > 0 ? adherenceDays / adherenceTotal : 0,
    adherenceDays,
    adherenceTotal,
    daysTracked,
  };
}

/** Fetch weight log entries for the last `days` days (0 = all time). */
export async function getWeightLogs(days?: number): Promise<WeightLog[]> {
  const userId = await getUserId();
  if (!userId) return [];

  let query = supabase
    .from('weight_logs')
    .select('id, weight_kg, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: true });

  if (days && days > 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    query = query.gte('logged_at', start.toISOString());
  }

  const { data: rows, error } = await query;
  if (error || !rows) return [];

  return rows.map(r => ({
    id: r.id,
    weightKg: Number(r.weight_kg),
    loggedAt: r.logged_at,
  }));
}

/** Insert or overwrite today's weight entry. Falls back to offline queue on network error. */
export async function logWeight(weightKg: number): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    await supabase
      .from('weight_logs')
      .delete()
      .eq('user_id', userId)
      .gte('logged_at', todayStart.toISOString())
      .lt('logged_at', tomorrowStart.toISOString());

    const { error } = await supabase
      .from('weight_logs')
      .insert({ user_id: userId, weight_kg: weightKg });

    if (error) throw error;
  } catch (err) {
    const msg = String((err as any)?.message ?? err).toLowerCase();
    const isNetwork =
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('failed to fetch');
    if (isNetwork) {
      await enqueueWeightLog(weightKg);
      return;
    }
    throw err;
  }
}

/** Fetch stats for an accepted, non-private friend via server-side RPC. */
export async function getFriendStats(friendId: string): Promise<FriendStats | null> {
  const { data, error } = await supabase.rpc('get_friend_stats', { p_friend_id: friendId });
  if (error || !data) return null;
  return {
    streak: data.streak ?? 0,
    daysTracked: data.days_tracked ?? 0,
    adherencePct: data.adherence_pct ?? 0,
    goalType: data.goal_type ?? null,
    goalCalories: data.goal_calories ?? null,
    goalProtein: data.goal_protein ?? null,
    goalCarbs: data.goal_carbs ?? null,
    goalFat: data.goal_fat ?? null,
    startWeightKg: data.start_weight_kg ?? null,
    currentWeightKg: data.current_weight_kg ?? null,
    weightChangeKg: data.weight_change_kg ?? null,
    avgCalories: data.avg_calories ?? 0,
    avgProtein: data.avg_protein ?? 0,
    avgCarbs: data.avg_carbs ?? 0,
    avgFat: data.avg_fat ?? 0,
    avgDays: data.avg_days ?? 0,
  };
}
