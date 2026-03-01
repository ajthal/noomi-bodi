import { supabase } from './supabase';
import { MealData } from './storage';
import {
  enqueueMealLog,
  removePendingItem,
  getPendingMealsForToday,
  cacheTodaysMeals,
  getCachedTodaysMeals,
} from './offlineStore';

export interface MealEntry extends MealData {
  id: string;
  timestamp: number;
  imageUri?: string;
  /** Base64 JPEG data — persisted in daily_logs.image_url as a data URI. */
  imageBase64?: string;
  /** True when the entry is queued locally and hasn't synced yet. */
  pending?: boolean;
}

export interface DailyMacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function rowToMealEntry(row: any): MealEntry {
  const imageUrl: string | null = row.image_url;
  let imageBase64: string | undefined;
  let imageUri: string | undefined;

  if (imageUrl?.startsWith('data:')) {
    imageBase64 = imageUrl.replace(/^data:image\/\w+;base64,/, '');
    imageUri = imageUrl;
  } else if (imageUrl) {
    imageUri = imageUrl;
  }

  return {
    id: row.id,
    name: row.meal_name,
    calories: row.calories || 0,
    protein: Number(row.protein_g) || 0,
    carbs: Number(row.carbs_g) || 0,
    fat: Number(row.fat_g) || 0,
    timestamp: new Date(row.logged_at).getTime(),
    imageUri,
    imageBase64,
  };
}

function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message ?? err).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('aborterror') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('failed to fetch')
  );
}

// ── CRUD operations ──────────────────────────────────────────────────

export async function logMeal(
  data: MealData,
  imageUri?: string,
  imageBase64?: string,
): Promise<MealEntry> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const imageUrl = imageBase64
    ? `data:image/jpeg;base64,${imageBase64}`
    : null;

  try {
    const { data: row, error } = await supabase
      .from('daily_logs')
      .insert({
        user_id: userId,
        meal_name: data.name,
        calories: data.calories,
        protein_g: data.protein,
        carbs_g: data.carbs,
        fat_g: data.fat,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (error) throw error;
    if (!row) throw new Error('Failed to log meal');

    const entry = rowToMealEntry(row);
    if (imageUri) entry.imageUri = imageUri;
    return entry;
  } catch (err) {
    if (isNetworkError(err)) {
      const entry = await enqueueMealLog(data, imageBase64);
      entry.pending = true;
      if (imageUri) entry.imageUri = imageUri;
      return entry;
    }
    throw err;
  }
}

export async function getTodaysMeals(): Promise<MealEntry[]> {
  const pendingMeals = (await getPendingMealsForToday()).map(m => ({
    ...m,
    pending: true,
  }));

  try {
    const userId = await getUserId();
    if (!userId) return pendingMeals;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: rows, error } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', startOfDay.toISOString())
      .order('logged_at', { ascending: false });

    if (error) throw error;

    const remoteMeals = (rows ?? []).map(rowToMealEntry);
    await cacheTodaysMeals(remoteMeals);
    return [...remoteMeals, ...pendingMeals];
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await getCachedTodaysMeals();
      return [...(cached ?? []), ...pendingMeals];
    }
    console.error('Error loading meals:', err);
    return pendingMeals;
  }
}

export async function getMealsForDate(date: Date): Promise<MealEntry[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const { data: rows, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', start.toISOString())
    .lte('logged_at', end.toISOString())
    .order('logged_at', { ascending: false });

  if (error || !rows) return [];
  return rows.map(rowToMealEntry);
}

export async function deleteMeal(id: string): Promise<void> {
  if (id.startsWith('pending-')) {
    await removePendingItem(id);
    return;
  }
  const { error } = await supabase.from('daily_logs').delete().eq('id', id);
  if (error) console.error('Error deleting meal:', error);
}

export async function getDailyTotals(date?: Date): Promise<DailyMacroTotals> {
  const meals = date ? await getMealsForDate(date) : await getTodaysMeals();
  return meals.reduce<DailyMacroTotals>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
      mealCount: acc.mealCount + 1,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 },
  );
}
