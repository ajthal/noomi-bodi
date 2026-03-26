import { supabase } from './supabase';
import { MealData } from './storage';
import { cacheSavedMeals, getCachedSavedMeals } from './offlineStore';

// ── Types ────────────────────────────────────────────────────────────

export interface SavedMeal extends MealData {
  id: string;
  notes?: string | null;
  imageUrl?: string | null;
  createdAt: number;
}

export interface SavedMealInput {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes?: string | null;
  imageBase64?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function rowToSavedMeal(row: any): SavedMeal {
  return {
    id: row.id,
    name: row.meal_name,
    calories: row.calories || 0,
    protein: Number(row.protein_g) || 0,
    carbs: Number(row.carbs_g) || 0,
    fat: Number(row.fat_g) || 0,
    notes: row.notes,
    imageUrl: row.image_url,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ── CRUD ─────────────────────────────────────────────────────────────

export async function getSavedMeals(): Promise<SavedMeal[]> {
  const userId = await getUserId();
  if (!userId) return [];

  try {
    const { data: rows, error } = await supabase
      .from('saved_meals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const meals = (rows ?? []).map(rowToSavedMeal);
    await cacheSavedMeals(meals);
    return meals;
  } catch (error) {
    console.error('Error loading saved meals:', error);
    const cached = await getCachedSavedMeals();
    return cached ?? [];
  }
}

export async function saveMeal(input: SavedMealInput): Promise<SavedMeal> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const imageUrl = input.imageBase64
    ? `data:image/jpeg;base64,${input.imageBase64}`
    : null;

  const { data: row, error } = await supabase
    .from('saved_meals')
    .insert({
      user_id: userId,
      meal_name: input.name,
      calories: input.calories,
      protein_g: input.protein,
      carbs_g: input.carbs,
      fat_g: input.fat,
      notes: input.notes || null,
      image_url: imageUrl,
    })
    .select()
    .single();

  if (error || !row) throw error || new Error('Failed to save meal');
  return rowToSavedMeal(row);
}

export async function updateSavedMeal(
  id: string,
  input: SavedMealInput,
): Promise<SavedMeal> {
  const imageUrl = input.imageBase64
    ? `data:image/jpeg;base64,${input.imageBase64}`
    : undefined;

  const updateObj: Record<string, unknown> = {
    meal_name: input.name,
    calories: input.calories,
    protein_g: input.protein,
    carbs_g: input.carbs,
    fat_g: input.fat,
    notes: input.notes || null,
  };
  if (imageUrl !== undefined) {
    updateObj.image_url = imageUrl;
  }

  const { data: row, error } = await supabase
    .from('saved_meals')
    .update(updateObj)
    .eq('id', id)
    .select()
    .single();

  if (error || !row) throw error || new Error('Failed to update saved meal');
  return rowToSavedMeal(row);
}

export async function deleteSavedMeal(id: string): Promise<void> {
  const { error } = await supabase.from('saved_meals').delete().eq('id', id);
  if (error) console.error('Error deleting saved meal:', error);
}

export async function clearAllSavedMeals(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const { error } = await supabase.from('saved_meals').delete().eq('user_id', userId);
  if (error) console.error('Error clearing saved meals:', error);
}
