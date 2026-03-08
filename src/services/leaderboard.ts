import { supabase } from './supabase';
import { getAcceptedFriends, FriendWithProfile } from './friendships';

// ── Types ────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  displayName: string | null;
  profilePictureUrl: string | null;
  daysHit: number;
  daysTotal: number;
  percentage: number;
  rank: number;
  isCurrentUser: boolean;
}

export interface WeekRange {
  start: Date;
  end: Date;
  label: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function getCurrentWeekRange(): WeekRange {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return { start, end, label: `${fmt(start)} - ${fmt(end)}` };
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Leaderboard calculation ──────────────────────────────────────────

async function getUserAdherence(
  userId: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<{ daysHit: number; daysTotal: number }> {
  // Fetch this user's goal
  const { data: planData } = await supabase
    .from('user_plans')
    .select('daily_calories')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const goalCalories = planData?.daily_calories ?? 0;
  if (!goalCalories) return { daysHit: 0, daysTotal: 7 };

  const { data: logs } = await supabase
    .from('daily_logs')
    .select('logged_at, calories')
    .eq('user_id', userId)
    .gte('logged_at', weekStart.toISOString())
    .lte('logged_at', weekEnd.toISOString());

  // Group by day
  const dayTotals = new Map<string, number>();
  for (const row of (logs ?? [])) {
    const key = toLocalDateString(new Date(row.logged_at));
    dayTotals.set(key, (dayTotals.get(key) ?? 0) + (row.calories || 0));
  }

  let daysHit = 0;
  for (const [, total] of dayTotals) {
    if (total >= goalCalories) daysHit++;
  }

  return { daysHit, daysTotal: 7 };
}

export async function getWeeklyLeaderboard(): Promise<{
  entries: LeaderboardEntry[];
  weekRange: WeekRange;
}> {
  const userId = await getUserId();
  if (!userId) return { entries: [], weekRange: getCurrentWeekRange() };

  const weekRange = getCurrentWeekRange();
  const friends = await getAcceptedFriends();

  // Filter out private users
  const visibleFriends = friends.filter(f => !f.isPrivate);

  // Fetch current user's profile
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('username, display_name, profile_picture_url, is_private')
    .eq('id', userId)
    .single();

  // Calculate adherence for all participants
  const allUsers: { userId: string; username: string | null; displayName: string | null; profilePictureUrl: string | null }[] = [
    {
      userId,
      username: myProfile?.username || null,
      displayName: myProfile?.display_name || null,
      profilePictureUrl: myProfile?.profile_picture_url || null,
    },
    ...visibleFriends.map(f => ({
      userId: f.id,
      username: f.username,
      displayName: f.displayName,
      profilePictureUrl: f.profilePictureUrl,
    })),
  ];

  const results = await Promise.all(
    allUsers.map(async u => {
      const { daysHit, daysTotal } = await getUserAdherence(u.userId, weekRange.start, weekRange.end);
      return {
        ...u,
        daysHit,
        daysTotal,
        percentage: Math.round((daysHit / daysTotal) * 100),
        isCurrentUser: u.userId === userId,
      };
    }),
  );

  // Sort by percentage DESC, then daysHit DESC
  results.sort((a, b) => b.percentage - a.percentage || b.daysHit - a.daysHit);

  const entries: LeaderboardEntry[] = results.map((r, i) => ({
    ...r,
    rank: i + 1,
  }));

  return { entries, weekRange };
}
