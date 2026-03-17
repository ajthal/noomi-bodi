import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { isNetworkError } from '../utils/errorMessages';
import { syncWidgetData } from './widgetDataSync';
import type { MealData, UserProfile } from './storage';
import type { MealEntry } from './mealLog';
import type { SavedMeal } from './savedMeals';

// ── Keys ─────────────────────────────────────────────────────────────

const QUEUE_KEY = '@noomibodi_offline_queue';
const CACHE_MEALS_KEY = '@noomibodi_cache_meals';
const CACHE_PROFILE_KEY = '@noomibodi_cache_profile';
const CACHE_SAVED_MEALS_KEY = '@noomibodi_cache_saved_meals';

// ── Queue types ──────────────────────────────────────────────────────

interface MealQueueItem {
  id: string;
  type: 'meal';
  payload: { data: MealData; imageBase64?: string };
  createdAt: number;
}

interface WeightQueueItem {
  id: string;
  type: 'weight';
  payload: { weightKg: number };
  createdAt: number;
}

export type QueueItem = MealQueueItem | WeightQueueItem;

// ── Helpers ──────────────────────────────────────────────────────────

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let pendingIdCounter = 0;
function nextPendingId(): string {
  return `pending-${Date.now()}-${++pendingIdCounter}`;
}

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Write Queue ──────────────────────────────────────────────────────

export async function getQueue(): Promise<QueueItem[]> {
  try {
    const json = await AsyncStorage.getItem(QUEUE_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Queue a meal log for later sync. Returns a temporary MealEntry
 * so the UI can display it immediately.
 */
export async function enqueueMealLog(
  data: MealData,
  imageBase64?: string,
): Promise<MealEntry> {
  const id = nextPendingId();
  const now = Date.now();

  const item: MealQueueItem = {
    id,
    type: 'meal',
    payload: { data, imageBase64 },
    createdAt: now,
  };

  const queue = await getQueue();
  queue.push(item);
  await saveQueue(queue);

  return {
    id,
    ...data,
    timestamp: now,
    imageBase64,
    imageUri: imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : undefined,
  };
}

/** Queue a weight log for later sync. */
export async function enqueueWeightLog(weightKg: number): Promise<void> {
  const item: WeightQueueItem = {
    id: nextPendingId(),
    type: 'weight',
    payload: { weightKg },
    createdAt: Date.now(),
  };
  const queue = await getQueue();
  queue.push(item);
  await saveQueue(queue);
}

/** Remove a single item from the queue (e.g. deleting a pending meal). */
export async function removePendingItem(id: string): Promise<void> {
  const queue = await getQueue();
  await saveQueue(queue.filter(q => q.id !== id));
}

/** Get pending meal entries for today, formatted as MealEntry[]. */
export async function getPendingMealsForToday(): Promise<MealEntry[]> {
  const queue = await getQueue();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStart = startOfDay.getTime();

  return queue
    .filter((q): q is MealQueueItem => q.type === 'meal' && q.createdAt >= dayStart)
    .map(q => ({
      id: q.id,
      ...q.payload.data,
      timestamp: q.createdAt,
      imageBase64: q.payload.imageBase64,
      imageUri: q.payload.imageBase64
        ? `data:image/jpeg;base64,${q.payload.imageBase64}`
        : undefined,
    }));
}

/**
 * Attempt to sync all queued items to Supabase.
 * Removes items that sync successfully; keeps items that fail
 * due to network issues. Auth errors cause the item to be dropped
 * (user needs to re-authenticate).
 */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const userId = await getUserId();
  if (!userId) return { synced: 0, failed: queue.length };

  const remaining: QueueItem[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      if (item.type === 'meal') {
        const { data, imageBase64 } = item.payload;
        const imageUrl = imageBase64
          ? `data:image/jpeg;base64,${imageBase64}`
          : null;

        const { error } = await supabase.from('daily_logs').insert({
          user_id: userId,
          meal_name: data.name,
          calories: data.calories,
          protein_g: data.protein,
          carbs_g: data.carbs,
          fat_g: data.fat,
          image_url: imageUrl,
          logged_at: new Date(item.createdAt).toISOString(),
        });
        if (error) throw error;
      } else if (item.type === 'weight') {
        const loggedAt = new Date(item.createdAt);
        const dayStart = new Date(loggedAt);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        await supabase
          .from('weight_logs')
          .delete()
          .eq('user_id', userId)
          .gte('logged_at', dayStart.toISOString())
          .lt('logged_at', dayEnd.toISOString());

        const { error } = await supabase.from('weight_logs').insert({
          user_id: userId,
          weight_kg: item.payload.weightKg,
          logged_at: loggedAt.toISOString(),
        });
        if (error) throw error;
      }
      synced++;
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(item);
      } else {
        console.error('Dropping queue item due to non-network error:', err);
        synced++;
      }
    }
  }

  await saveQueue(remaining);

  if (synced > 0 && userId) {
    syncWidgetData(userId).catch(() => {});
  }

  return { synced, failed: remaining.length };
}

// ── Read Cache ───────────────────────────────────────────────────────

interface CachedMeals {
  dateKey: string;
  meals: MealEntry[];
}

export async function cacheTodaysMeals(meals: MealEntry[]): Promise<void> {
  const payload: CachedMeals = { dateKey: todayKey(), meals };
  await AsyncStorage.setItem(CACHE_MEALS_KEY, JSON.stringify(payload));
}

export async function getCachedTodaysMeals(): Promise<MealEntry[] | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_MEALS_KEY);
    if (!json) return null;
    const cached: CachedMeals = JSON.parse(json);
    if (cached.dateKey !== todayKey()) return null;
    return cached.meals;
  } catch {
    return null;
  }
}

export async function cacheProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(CACHE_PROFILE_KEY, JSON.stringify(profile));
}

export async function getCachedProfile(): Promise<UserProfile | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_PROFILE_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function cacheSavedMeals(meals: SavedMeal[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_SAVED_MEALS_KEY, JSON.stringify(meals));
}

export async function getCachedSavedMeals(): Promise<SavedMeal[] | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_SAVED_MEALS_KEY);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export async function clearOfflineData(): Promise<void> {
  await AsyncStorage.multiRemove([
    QUEUE_KEY, CACHE_MEALS_KEY, CACHE_PROFILE_KEY, CACHE_SAVED_MEALS_KEY,
  ]);
}
