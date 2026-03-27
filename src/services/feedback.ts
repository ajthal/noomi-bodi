import { Platform, Dimensions } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────

export type FeedbackCategory = 'bug' | 'feature' | 'other';
export type FeedbackStatus = 'new' | 'reviewed' | 'resolved' | 'closed';

export interface DeviceContext {
  os: string;
  osVersion: string | number;
  model: string;
  appVersion: string;
  buildNumber: string;
  screenWidth: number;
  screenHeight: number;
}

export interface FeedbackItem {
  id: string;
  userId: string;
  category: FeedbackCategory;
  title: string;
  description: string | null;
  screenshotUrls: string[];
  deviceInfo: DeviceContext;
  currentScreen: string | null;
  status: FeedbackStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated by admin query join
  username?: string | null;
  displayName?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Device Context ────────────────────────────────────────────────────

export function getDeviceContext(): DeviceContext {
  const { width, height } = Dimensions.get('window');
  return {
    os: Platform.OS,
    osVersion: Platform.Version,
    model: DeviceInfo.getModel(),
    appVersion: DeviceInfo.getVersion(),
    buildNumber: DeviceInfo.getBuildNumber(),
    screenWidth: Math.round(width),
    screenHeight: Math.round(height),
  };
}

// ── Screenshot Upload ─────────────────────────────────────────────────

export async function uploadFeedbackScreenshot(base64Data: string): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const timestamp = Date.now();
  const filePath = `${userId}/${timestamp}.jpg`;
  const arrayBuffer = base64ToArrayBuffer(base64Data);

  const { error: uploadError } = await supabase.storage
    .from('feedback-screenshots')
    .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('feedback-screenshots')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

// ── Submit Feedback ───────────────────────────────────────────────────

export async function submitFeedback(data: {
  category: FeedbackCategory;
  title: string;
  description?: string;
  screenshotUrls?: string[];
  currentScreen?: string;
}): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const deviceInfo = getDeviceContext();

  const { error } = await supabase.from('feedback').insert({
    user_id: userId,
    category: data.category,
    title: data.title,
    description: data.description ?? null,
    screenshot_urls: data.screenshotUrls ?? [],
    device_info: deviceInfo,
    current_screen: data.currentScreen ?? null,
  });

  if (error) throw error;
}

// ── Admin Queries ─────────────────────────────────────────────────────

export async function getAdminFeedback(): Promise<FeedbackItem[]> {
  const { data, error } = await supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r: any) => r.user_id))];
  const { data: profiles } = await supabase
    .from('public_profiles')
    .select('id, username, display_name')
    .in('id', userIds);

  const profileMap = new Map<string, { username: string | null; displayName: string | null }>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, {
      username: p.username || null,
      displayName: p.display_name || null,
    });
  }

  return rows.map((r: any) => {
    const profile = profileMap.get(r.user_id);
    return {
      id: r.id,
      userId: r.user_id,
      category: r.category,
      title: r.title,
      description: r.description,
      screenshotUrls: r.screenshot_urls ?? [],
      deviceInfo: r.device_info ?? {},
      currentScreen: r.current_screen,
      status: r.status,
      adminNotes: r.admin_notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      username: profile?.username ?? null,
      displayName: profile?.displayName ?? null,
    };
  });
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  adminNotes?: string,
): Promise<void> {
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (adminNotes !== undefined) {
    updates.admin_notes = adminNotes;
  }

  const { error } = await supabase
    .from('feedback')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}
