import { supabase } from './supabase';
import { containsProhibitedWord } from '../utils/profanityFilter';

// ── Types ────────────────────────────────────────────────────────────

export interface PublicProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  profilePictureUrl: string | null;
  bio: string | null;
  isPrivate: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Username validation ──────────────────────────────────────────────

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export function validateUsername(username: string, skipProfanity = false): string | null {
  if (!username) return 'Username is required';
  if (username.length < 3) return 'Username must be at least 3 characters';
  if (username.length > 20) return 'Username must be 20 characters or fewer';
  if (!USERNAME_REGEX.test(username)) {
    return 'Only letters, numbers, and underscores allowed';
  }
  if (/^[_0-9]/.test(username)) return 'Username must start with a letter';
  if (!skipProfanity && containsProhibitedWord(username)) return 'This username is not available';
  return null;
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id')
    .ilike('username', username)
    .limit(1)
    .single();

  if (error && error.code === 'PGRST116') return true; // no rows
  if (error) {
    console.error('Error checking username:', error);
    return false;
  }
  return data?.id === userId;
}

// ── User search ──────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<PublicProfile[]> {
  const userId = await getUserId();
  if (!userId || query.length < 2) return [];

  try {
    const { data, error } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, profile_picture_url, bio, is_private')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .neq('id', userId)
      .limit(10);

    if (error) throw error;
    return (data ?? []).map(rowToPublicProfile);
  } catch (error) {
    console.error('Error searching users:', error);
    return [];
  }
}

// ── Admin search (includes email, no self-exclusion) ────────────────

export interface AdminProfile extends PublicProfile {
  email: string | null;
  role: string | null;
}

export async function adminSearchUsers(
  query: string,
): Promise<{ data: AdminProfile[]; error: string | null }> {
  if (query.length < 2) return { data: [], error: null };

  // Ensure auth session is fresh (mirrors searchUsers behaviour)
  const userId = await getUserId();
  if (!userId) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, profile_picture_url, bio, is_private, email, role')
    .or(`username.ilike.%${query}%,email.ilike.%${query}%,display_name.ilike.%${query}%`)
    .neq('id', userId)
    .limit(15);

  if (error) {
    console.error('adminSearchUsers error:', error);
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map(row => ({
      ...rowToPublicProfile(row),
      email: row.email || null,
      role: row.role || null,
    })),
    error: null,
  };
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  try {
    const { data, error } = await supabase
      .from('public_profiles')
      .select('id, username, display_name, profile_picture_url, bio, is_private')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return rowToPublicProfile(data);
  } catch (error) {
    console.error('Error fetching public profile:', error);
    return null;
  }
}

function rowToPublicProfile(row: any): PublicProfile {
  return {
    id: row.id,
    username: row.username || null,
    displayName: row.display_name || null,
    profilePictureUrl: row.profile_picture_url || null,
    bio: row.bio || null,
    isPrivate: row.is_private ?? false,
  };
}

// ── Profile picture upload ───────────────────────────────────────────

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function uploadProfilePicture(base64Data: string): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const timestamp = Date.now();
  const filePath = `${userId}/${timestamp}.jpg`;

  const arrayBuffer = base64ToArrayBuffer(base64Data);

  const { error: uploadError } = await supabase.storage
    .from('profile-pictures')
    .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('profile-pictures')
    .getPublicUrl(filePath);

  const publicUrl = urlData.publicUrl;

  await supabase.from('profiles').update({
    profile_picture_url: publicUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', userId);

  // Clean up old pictures
  try {
    const { data: files } = await supabase.storage
      .from('profile-pictures')
      .list(userId);
    if (files && files.length > 1) {
      const oldFiles = files
        .filter(f => f.name !== `${timestamp}.jpg`)
        .map(f => `${userId}/${f.name}`);
      if (oldFiles.length > 0) {
        await supabase.storage.from('profile-pictures').remove(oldFiles);
      }
    }
  } catch {
    // Non-critical: old files remain
  }

  return publicUrl;
}

// ── Profile field updates ────────────────────────────────────────────

export async function updateProfileFields(
  fields: Partial<{
    username: string;
    display_name: string | null;
    profile_picture_url: string | null;
    bio: string | null;
    is_private: boolean;
  }>,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

export function suggestUsernameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return local.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20).toLowerCase();
}
