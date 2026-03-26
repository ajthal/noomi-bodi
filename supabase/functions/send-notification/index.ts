import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID')!;
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!;

interface NotificationPayload {
  type: 'friend_request' | 'friend_accepted' | 'shared_meal' | 'streak_milestone';
  recipientId?: string;
  userId?: string;
  data: Record<string, string>;
}

// Google OAuth2 token via service account JWT
async function getAccessToken(): Promise<string> {
  const sa = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);

  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${payload}`;

  // Import RSA private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const keyBuffer = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${header}.${payload}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const { access_token } = await resp.json();
  return access_token;
}

async function sendFCM(token: string, title: string, body: string, data: Record<string, string>) {
  const accessToken = await getAccessToken();

  await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          apns: {
            payload: {
              aps: { sound: 'default' },
            },
          },
        },
      }),
    },
  );
}

async function getTokensForUser(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('device_tokens')
    .select('fcm_token')
    .eq('user_id', userId);
  return (data ?? []).map((r: any) => r.fcm_token);
}

async function getSenderDisplayName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('public_profiles')
    .select('username, display_name')
    .eq('id', userId)
    .single();
  return data?.display_name || (data?.username ? `@${data.username}` : 'Someone');
}

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401 });
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.replace(/^Bearer\s+/, ''), {
      auth: { persistSession: false },
    });

    // Verify the caller's JWT to get sender user ID
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    }).auth.getUser();

    if (!caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
    }

    const { type, recipientId, userId, data } = (await req.json()) as NotificationPayload;
    const senderName = await getSenderDisplayName(supabaseAuth, caller.id);

    if (type === 'streak_milestone') {
      const milestoneUserId = userId || caller.id;
      const streakDays = data.streakDays || '0';
      const milestoneName = await getSenderDisplayName(supabaseAuth, milestoneUserId);

      // Get accepted friends who are not private
      const { data: friendships } = await supabaseAuth
        .from('friendships')
        .select('follower_id, following_id')
        .or(`follower_id.eq.${milestoneUserId},following_id.eq.${milestoneUserId}`)
        .eq('status', 'accepted');

      if (!friendships || friendships.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
      }

      const friendIds = friendships.map((f: any) =>
        f.follower_id === milestoneUserId ? f.following_id : f.follower_id,
      );

      // Filter out private users
      const { data: profiles } = await supabaseAuth
        .from('profiles')
        .select('id, is_private')
        .in('id', friendIds)
        .eq('is_private', false);

      const eligibleIds = (profiles ?? []).map((p: any) => p.id);
      if (eligibleIds.length === 0) {
        return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
      }

      let sent = 0;
      for (const friendId of eligibleIds) {
        const tokens = await getTokensForUser(supabaseAuth, friendId);
        for (const token of tokens) {
          await sendFCM(
            token,
            'Streak Milestone!',
            `${milestoneName} hit a ${streakDays}-day streak!`,
            { type: 'streak_milestone', userId: milestoneUserId, streakDays },
          );
          sent++;
        }
      }

      return new Response(JSON.stringify({ sent }), { status: 200 });
    }

    // Social notifications
    if (!recipientId) {
      return new Response(JSON.stringify({ error: 'recipientId required' }), { status: 400 });
    }

    // Don't notify yourself
    if (recipientId === caller.id) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const tokens = await getTokensForUser(supabaseAuth, recipientId);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    let title = '';
    let body = '';
    const notifData: Record<string, string> = { type, senderId: caller.id };

    switch (type) {
      case 'friend_request':
        title = 'New Friend Request';
        body = `${senderName} sent you a friend request`;
        break;
      case 'friend_accepted':
        title = 'Friend Request Accepted';
        body = `${senderName} accepted your friend request`;
        break;
      case 'shared_meal':
        title = 'New Shared Meal';
        body = data.mealName
          ? `${senderName} shared "${data.mealName}" with you`
          : `${senderName} shared a meal with you`;
        if (data.mealName) notifData.mealName = data.mealName;
        break;
      default:
        return new Response(JSON.stringify({ error: 'Unknown type' }), { status: 400 });
    }

    let sent = 0;
    for (const token of tokens) {
      await sendFCM(token, title, body, notifData);
      sent++;
    }

    return new Response(JSON.stringify({ sent }), { status: 200 });
  } catch (err) {
    console.error('send-notification error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
});
