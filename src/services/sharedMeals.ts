import { supabase } from './supabase';

// ── Types ────────────────────────────────────────────────────────────

export interface SharedMeal {
  id: string;
  mealId: string;
  sharedBy: string;
  sharedWith: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
  mealName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sharedByUsername: string | null;
  sharedByDisplayName: string | null;
  sharedByProfilePicture: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── CRUD ─────────────────────────────────────────────────────────────

export async function shareMeal(
  mealId: string,
  sharedWithId: string,
  message?: string,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { error } = await supabase.from('shared_meals').insert({
    meal_id: mealId,
    shared_by: userId,
    shared_with: sharedWithId,
    message: message || null,
  });

  if (error) throw error;
}

export async function shareMealWithMultiple(
  mealId: string,
  userIds: string[],
  message?: string,
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const rows = userIds.map(sharedWith => ({
    meal_id: mealId,
    shared_by: userId,
    shared_with: sharedWith,
    message: message || null,
  }));

  const { error } = await supabase.from('shared_meals').insert(rows);
  if (error) throw error;
}

export async function getSharedWithMe(): Promise<SharedMeal[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    const { data: rows, error } = await supabase
      .from('shared_meals')
      .select('id, meal_id, shared_by, shared_with, message, is_read, created_at')
      .eq('shared_with', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const mealIds = [...new Set(rows.map(r => r.meal_id))];
    const senderIds = [...new Set(rows.map(r => r.shared_by))];

    const [mealsRes, sendersRes] = await Promise.all([
      supabase
        .from('saved_meals')
        .select('id, meal_name, calories, protein_g, carbs_g, fat_g')
        .in('id', mealIds),
      supabase
        .from('public_profiles')
        .select('id, username, display_name, profile_picture_url')
        .in('id', senderIds),
    ]);

    if (mealsRes.error) throw mealsRes.error;
    if (sendersRes.error) throw sendersRes.error;

    const mealMap = new Map((mealsRes.data ?? []).map(m => [m.id, m]));
    const senderMap = new Map((sendersRes.data ?? []).map(p => [p.id, p]));

    return rows.map(row => {
      const meal = mealMap.get(row.meal_id);
      const sender = senderMap.get(row.shared_by);
      return {
        id: row.id,
        mealId: row.meal_id,
        sharedBy: row.shared_by,
        sharedWith: row.shared_with,
        message: row.message,
        isRead: row.is_read,
        createdAt: row.created_at,
        mealName: meal?.meal_name || 'Unknown meal',
        calories: meal?.calories || 0,
        protein: Number(meal?.protein_g) || 0,
        carbs: Number(meal?.carbs_g) || 0,
        fat: Number(meal?.fat_g) || 0,
        sharedByUsername: sender?.username || null,
        sharedByDisplayName: sender?.display_name || null,
        sharedByProfilePicture: sender?.profile_picture_url || null,
      };
    });
  } catch (error) {
    console.error('Error fetching shared meals:', error);
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  const userId = await getUserId();
  if (!userId) return 0;

  try {
    const { count, error } = await supabase
      .from('shared_meals')
      .select('id', { count: 'exact', head: true })
      .eq('shared_with', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return 0;
  }
}

export async function markAsRead(sharedMealId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('shared_meals')
    .update({ is_read: true })
    .eq('id', sharedMealId)
    .eq('shared_with', userId);

  if (error) console.error('Error marking shared meal as read:', error);
}

export async function deleteSharedMeal(sharedMealId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('shared_meals')
    .delete()
    .eq('id', sharedMealId)
    .eq('shared_with', userId);

  if (error) console.error('Error deleting shared meal:', error);
}

export interface SentSharedMeal {
  id: string;
  mealId: string;
  mealName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sharedWithUsername: string | null;
  sharedWithDisplayName: string | null;
  sharedWithProfilePicture: string | null;
  message: string | null;
  createdAt: string;
}

export async function getSharedByMe(): Promise<SentSharedMeal[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    const { data: rows, error } = await supabase
      .from('shared_meals')
      .select('id, meal_id, shared_by, shared_with, message, created_at')
      .eq('shared_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!rows || rows.length === 0) return [];

    const mealIds = [...new Set(rows.map(r => r.meal_id))];
    const recipientIds = [...new Set(rows.map(r => r.shared_with))];

    const [mealsRes, recipientsRes] = await Promise.all([
      supabase
        .from('saved_meals')
        .select('id, meal_name, calories, protein_g, carbs_g, fat_g')
        .in('id', mealIds),
      supabase
        .from('public_profiles')
        .select('id, username, display_name, profile_picture_url')
        .in('id', recipientIds),
    ]);

    if (mealsRes.error) throw mealsRes.error;
    if (recipientsRes.error) throw recipientsRes.error;

    const mealMap = new Map((mealsRes.data ?? []).map(m => [m.id, m]));
    const recipientMap = new Map((recipientsRes.data ?? []).map(p => [p.id, p]));

    return rows.map(row => {
      const meal = mealMap.get(row.meal_id);
      const recipient = recipientMap.get(row.shared_with);
      return {
        id: row.id,
        mealId: row.meal_id,
        mealName: meal?.meal_name || 'Unknown meal',
        calories: meal?.calories || 0,
        protein: Number(meal?.protein_g) || 0,
        carbs: Number(meal?.carbs_g) || 0,
        fat: Number(meal?.fat_g) || 0,
        sharedWithUsername: recipient?.username || null,
        sharedWithDisplayName: recipient?.display_name || null,
        sharedWithProfilePicture: recipient?.profile_picture_url || null,
        message: row.message,
        createdAt: row.created_at,
      };
    });
  } catch (error) {
    console.error('Error fetching sent shared meals:', error);
    return [];
  }
}

export async function copyToSavedMeals(sharedMeal: SharedMeal): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { error: insertError } = await supabase.from('saved_meals').insert({
    user_id: userId,
    meal_name: sharedMeal.mealName,
    calories: sharedMeal.calories,
    protein_g: sharedMeal.protein,
    carbs_g: sharedMeal.carbs,
    fat_g: sharedMeal.fat,
    notes: `Shared by @${sharedMeal.sharedByUsername || 'friend'}`,
  });

  if (insertError) throw insertError;

  await markAsRead(sharedMeal.id);
}
