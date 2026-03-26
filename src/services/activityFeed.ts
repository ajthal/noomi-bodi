import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────

export interface ActivityFeedItem {
  id: string;
  userId: string;
  activityType: string;
  activityData: Record<string, any>;
  createdAt: string;
  username: string | null;
  displayName: string | null;
  profilePictureUrl: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const MILESTONES = [3, 7, 14, 30, 60, 90, 120, 150, 180, 365];

function isMilestone(streakDays: number): boolean {
  if (MILESTONES.includes(streakDays)) return true;
  if (streakDays > 180 && streakDays % 30 === 0) return true;
  return false;
}

// ── Queries ──────────────────────────────────────────────────────────

export async function getFriendActivity(limit = 50): Promise<ActivityFeedItem[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    // RLS handles privacy filtering. We select activities from friends + self.
    const { data: rows, error } = await supabase
      .from('activity_feed')
      .select('id, user_id, activity_type, activity_data, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const userIds = [...new Set(rows.map(r => r.user_id))];
    const { data: profiles, error: profErr } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, profile_picture_url')
      .in('id', userIds);

    if (profErr) throw profErr;

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

    return rows.map(row => {
      const p = profileMap.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        activityType: row.activity_type,
        activityData: row.activity_data,
        createdAt: row.created_at,
        username: p?.username || null,
        displayName: p?.display_name || null,
        profilePictureUrl: p?.profile_picture_url || null,
      };
    });
  } catch (error) {
    console.error('Error fetching friend activity:', error);
    return [];
  }
}

// ── Streak milestones ────────────────────────────────────────────────

export async function insertStreakMilestone(streakDays: number): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase.from('activity_feed').insert({
    user_id: userId,
    activity_type: 'streak_milestone',
    activity_data: { streak_days: streakDays },
  });

  if (error) console.error('Error inserting streak milestone:', error);
}

export async function checkAndRecordMilestone(streakDays: number): Promise<void> {
  if (!isMilestone(streakDays)) return;

  const userId = await getUserId();
  if (!userId) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Avoid duplicate milestone for same day
  const { data: existing } = await supabase
    .from('activity_feed')
    .select('id')
    .eq('user_id', userId)
    .eq('activity_type', 'streak_milestone')
    .gte('created_at', todayStart.toISOString())
    .limit(1);

  if (existing && existing.length > 0) return;

  await insertStreakMilestone(streakDays);
}

export function getStreakEmoji(days: number): string {
  if (days >= 60) return '\uD83D\uDCAA';
  if (days >= 30) return '\uD83D\uDE80';
  if (days >= 14) return '\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25';
  if (days >= 7) return '\uD83D\uDD25\uD83D\uDD25';
  return '\uD83D\uDD25';
}

export function getStreakText(days: number): string {
  if (days >= 14 && days % 7 === 0) return `hit a ${Math.floor(days / 7)}-week streak!`;
  return `hit a ${days}-day streak!`;
}
