import { supabase } from './supabase';
import { PublicProfile } from './profileService';

// ── Types ────────────────────────────────────────────────────────────

export type FriendshipStatus = 'pending' | 'accepted' | 'declined';

export interface Friendship {
  id: string;
  followerId: string;
  followingId: string;
  status: FriendshipStatus;
  createdAt: string;
  acceptedAt: string | null;
}

export interface FriendWithProfile extends PublicProfile {
  friendshipId: string;
  currentStreak?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function rowToFriendship(row: any): Friendship {
  return {
    id: row.id,
    followerId: row.follower_id,
    followingId: row.following_id,
    status: row.status,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
  };
}

// ── Friend requests ──────────────────────────────────────────────────

export async function sendFriendRequest(followingId: string): Promise<Friendship> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('friendships')
    .insert({ follower_id: userId, following_id: followingId, status: 'pending' })
    .select()
    .single();

  if (error) throw error;
  return rowToFriendship(data);
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', friendshipId)
    .eq('following_id', userId);

  if (error) throw error;
}

export async function declineFriendRequest(friendshipId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('following_id', userId);

  if (error) throw error;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId);

  if (error) throw error;
}

// ── Queries ──────────────────────────────────────────────────────────

export async function getAcceptedFriends(): Promise<FriendWithProfile[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, follower_id, following_id, status')
      .or(`follower_id.eq.${userId},following_id.eq.${userId}`);

    if (error) throw error;

    const accepted = (rows ?? []).filter(r => r.status === 'accepted');
    if (accepted.length === 0) return [];

    const friendIds = accepted.map(r =>
      r.follower_id === userId ? r.following_id : r.follower_id,
    );

    const { data: profiles, error: profErr } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, profile_picture_url, bio, is_private')
      .in('id', friendIds);

    if (profErr) throw profErr;

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

    return accepted
      .map(row => {
        const friendId = row.follower_id === userId ? row.following_id : row.follower_id;
        const p = profileMap.get(friendId);
        if (!p) return null;
        return {
          id: p.id,
          friendshipId: row.id,
          username: p.username || null,
          displayName: p.display_name || null,
          profilePictureUrl: p.profile_picture_url || null,
          bio: p.bio || null,
          isPrivate: p.is_private ?? false,
        };
      })
      .filter((x): x is FriendWithProfile => x !== null);
  } catch (error) {
    console.error('Error fetching accepted friends:', error);
    return [];
  }
}

export async function getPendingReceived(): Promise<{ friendship: Friendship; profile: PublicProfile }[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, follower_id, following_id, status, created_at, accepted_at')
      .eq('following_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const senderIds = rows.map(r => r.follower_id);

    const { data: profiles, error: profErr } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, profile_picture_url, bio, is_private')
      .in('id', senderIds);

    if (profErr) throw profErr;

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

    return rows
      .map(row => {
        const p = profileMap.get(row.follower_id);
        if (!p) return null;
        return {
          friendship: rowToFriendship(row),
          profile: {
            id: p.id,
            username: p.username || null,
            displayName: p.display_name || null,
            profilePictureUrl: p.profile_picture_url || null,
            bio: p.bio || null,
            isPrivate: p.is_private ?? false,
          },
        };
      })
      .filter((x): x is { friendship: Friendship; profile: PublicProfile } => x !== null);
  } catch (error) {
    console.error('Error fetching pending received:', error);
    return [];
  }
}

export async function getPendingSent(): Promise<{ friendship: Friendship; profile: PublicProfile }[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, follower_id, following_id, status, created_at, accepted_at')
      .eq('follower_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const recipientIds = rows.map(r => r.following_id);

    const { data: profiles, error: profErr } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, profile_picture_url, bio, is_private')
      .in('id', recipientIds);

    if (profErr) throw profErr;

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

    return rows
      .map(row => {
        const p = profileMap.get(row.following_id);
        if (!p) return null;
        return {
          friendship: rowToFriendship(row),
          profile: {
            id: p.id,
            username: p.username || null,
            displayName: p.display_name || null,
            profilePictureUrl: p.profile_picture_url || null,
            bio: p.bio || null,
            isPrivate: p.is_private ?? false,
          },
        };
      })
      .filter((x): x is { friendship: Friendship; profile: PublicProfile } => x !== null);
  } catch (error) {
    console.error('Error fetching pending sent:', error);
    return [];
  }
}

export type RelationshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export async function getFriendshipStatus(
  otherUserId: string,
): Promise<{ status: RelationshipStatus; friendshipId: string | null }> {
  const userId = await getUserId();
  if (!userId) return { status: 'none', friendshipId: null };

  try {
    const { data, error } = await supabase
      .from('friendships')
      .select('id, follower_id, following_id, status')
      .or(
        `and(follower_id.eq.${userId},following_id.eq.${otherUserId}),and(follower_id.eq.${otherUserId},following_id.eq.${userId})`,
      )
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') return { status: 'none', friendshipId: null };
    if (error) throw error;

    if (data.status === 'accepted') return { status: 'accepted', friendshipId: data.id };
    if (data.follower_id === userId) return { status: 'pending_sent', friendshipId: data.id };
    return { status: 'pending_received', friendshipId: data.id };
  } catch (error) {
    console.error('Error checking friendship status:', error);
    return { status: 'none', friendshipId: null };
  }
}
