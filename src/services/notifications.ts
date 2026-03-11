import {
  getMessaging,
  getToken,
  onTokenRefresh as firebaseOnTokenRefresh,
  AuthorizationStatus,
  requestPermission,
} from '@react-native-firebase/messaging';
import { supabase } from './supabase';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'shared_meal'
  | 'streak_milestone';

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function registerForPushNotifications(): Promise<string | null> {
  const messaging = getMessaging();
  const authStatus = await requestPermission(messaging);
  const enabled =
    authStatus === AuthorizationStatus.AUTHORIZED ||
    authStatus === AuthorizationStatus.PROVISIONAL;

  if (!enabled) return null;

  const fcmToken = await getToken(messaging);
  if (!fcmToken) return null;

  const userId = await getUserId();
  if (!userId) return null;

  // Remove stale tokens: if this device's token was registered under a
  // different user (e.g. after sign-out / sign-in with another account),
  // delete the old entry so the previous user stops receiving pushes here.
  await supabase.rpc('claim_device_token', { p_fcm_token: fcmToken });

  await supabase.from('device_tokens').upsert(
    { user_id: userId, fcm_token: fcmToken, platform: 'ios', updated_at: new Date().toISOString() },
    { onConflict: 'user_id,fcm_token' },
  );

  return fcmToken;
}

export async function unregisterPushToken(): Promise<void> {
  try {
    const fcmToken = await getToken(getMessaging());
    if (!fcmToken) return;

    const userId = await getUserId();
    if (!userId) return;

    await supabase
      .from('device_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('fcm_token', fcmToken);
  } catch {
    // Best-effort cleanup
  }
}

export function onTokenRefresh(callback: (token: string) => void): () => void {
  return firebaseOnTokenRefresh(getMessaging(), callback);
}

export async function upsertToken(fcmToken: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await supabase.from('device_tokens').upsert(
    { user_id: userId, fcm_token: fcmToken, platform: 'ios', updated_at: new Date().toISOString() },
    { onConflict: 'user_id,fcm_token' },
  );
}

export async function sendNotification(
  type: NotificationType,
  recipientId: string,
  data: Record<string, string>,
): Promise<void> {
  await supabase.functions.invoke('send-notification', {
    body: { type, recipientId, data },
  });
}

export async function sendMilestoneNotifications(
  userId: string,
  streakDays: number,
): Promise<void> {
  await supabase.functions.invoke('send-notification', {
    body: { type: 'streak_milestone', userId, data: { streakDays: String(streakDays) } },
  });
}
