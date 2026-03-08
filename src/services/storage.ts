import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { cacheProfile, getCachedProfile } from './offlineStore';

// ── AsyncStorage keys (local-only data) ──────────────────────────────

const MESSAGES_KEY = '@noomibodi_messages';
const API_KEY_KEY = '@noomibodi_api_key';
const LEGACY_API_KEY = 'claude_api_key';

// ── Domain types ──────────────────────────────────────────────────────

export interface MealData {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Message {
  text: string;
  role: 'user' | 'assistant';
  timestamp: number;
  imageUri?: string;
  mealData?: MealData;
  mealLogged?: boolean;
  /** Claude detected a repeat meal and suggests saving it to the library. */
  saveMealSuggestion?: MealData;
  mealSaved?: boolean;
}

export type Gender = 'male' | 'female' | 'other';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export interface MacroGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface UserProfile {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  targetWeightKg?: number | null;
  activityLevel: ActivityLevel;
  plan?: string | null;
  dailyGoals?: MacroGoals | null;
  username?: string | null;
  displayName?: string | null;
  profilePictureUrl?: string | null;
  bio?: string | null;
  isPrivate?: boolean;
}

// ── Goal estimation (Mifflin-St Jeor) ─────────────────────────────────

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/**
 * Estimate daily calorie and macro targets from the user's profile.
 * Uses the Mifflin-St Jeor equation for BMR, then adjusts for activity
 * level and goal (−500 kcal for weight loss, +300 kcal for gain).
 * Macro split: 30 % protein, 40 % carbs, 30 % fat.
 */
export function estimateDailyGoals(profile: UserProfile): MacroGoals {
  if (profile.dailyGoals) return profile.dailyGoals;

  const { gender, age, heightCm, weightKg, goal, activityLevel } = profile;

  const bmr =
    gender === 'female'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5;

  let tdee = bmr * ACTIVITY_MULTIPLIERS[activityLevel];
  if (goal === 'lose') tdee -= 500;
  else if (goal === 'gain') tdee += 300;

  const calories = Math.round(tdee);
  return {
    calories,
    protein: Math.round((calories * 0.3) / 4),
    carbs: Math.round((calories * 0.4) / 4),
    fat: Math.round((calories * 0.3) / 9),
  };
}

// ── Supabase helpers ──────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Chat messages (AsyncStorage — ephemeral, device-local) ────────────

export async function saveMessages(messages: Message[]): Promise<void> {
  try {
    await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving messages:', error);
  }
}

export async function loadMessages(): Promise<Message[]> {
  try {
    const json = await AsyncStorage.getItem(MESSAGES_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error loading messages:', error);
    return [];
  }
}

export async function clearMessages(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MESSAGES_KEY);
  } catch (error) {
    console.error('Error clearing messages:', error);
  }
}

// ── Claude API key (AsyncStorage — client secret, never sent to backend) ──

export async function saveApiKey(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(API_KEY_KEY, key);
    await AsyncStorage.removeItem(LEGACY_API_KEY).catch(() => {});
  } catch (error) {
    console.error('Error saving API key:', error);
  }
}

export async function getApiKey(): Promise<string | null> {
  try {
    let key = await AsyncStorage.getItem(API_KEY_KEY);
    if (!key) {
      key = await AsyncStorage.getItem(LEGACY_API_KEY);
      if (key) await saveApiKey(key);
    }
    return key;
  } catch (error) {
    console.error('Error loading API key:', error);
    return null;
  }
}

export async function clearApiKey(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([API_KEY_KEY, LEGACY_API_KEY]);
  } catch (error) {
    console.error('Error clearing API key:', error);
  }
}

// ── User profile (Supabase: profiles + user_plans tables) ─────────────

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error('Not authenticated');

  const { data: { user } } = await supabase.auth.getUser();

  const upsertData: Record<string, unknown> = {
    id: userId,
    email: user?.email,
    gender: profile.gender,
    age: profile.age,
    height_cm: profile.heightCm,
    current_weight_kg: profile.weightKg,
    activity_level: profile.activityLevel,
    updated_at: new Date().toISOString(),
  };
  if (profile.username !== undefined) upsertData.username = profile.username;
  if (profile.displayName !== undefined) upsertData.display_name = profile.displayName;
  if (profile.profilePictureUrl !== undefined) upsertData.profile_picture_url = profile.profilePictureUrl;
  if (profile.bio !== undefined) upsertData.bio = profile.bio;
  if (profile.isPrivate !== undefined) upsertData.is_private = profile.isPrivate;

  const { error: profileError } = await supabase.from('profiles').upsert(upsertData);

  if (profileError) {
    console.error('Error saving profile:', profileError);
    throw profileError;
  }

  // Deactivate any existing active plans
  await supabase
    .from('user_plans')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true);

  const goals = profile.dailyGoals || estimateDailyGoals(profile);

  const { error: planError } = await supabase.from('user_plans').insert({
    user_id: userId,
    goal_type: profile.goal,
    target_weight_kg: profile.targetWeightKg,
    daily_calories: goals.calories,
    daily_protein_g: goals.protein,
    daily_carbs_g: goals.carbs,
    daily_fat_g: goals.fat,
    plan_details: profile.plan,
    is_active: true,
  });

  if (planError) {
    console.error('Error saving plan:', planError);
    throw planError;
  }
}

export async function loadUserProfile(): Promise<UserProfile | null> {
  const userId = await getUserId();
  if (!userId) return null;

  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profileData) {
      return await getCachedProfile();
    }

    const { data: planData } = await supabase
      .from('user_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const profile: UserProfile = {
      gender: profileData.gender as Gender,
      age: profileData.age,
      heightCm: Number(profileData.height_cm),
      weightKg: Number(profileData.current_weight_kg),
      goal: (planData?.goal_type as Goal) || 'maintain',
      targetWeightKg: planData?.target_weight_kg
        ? Number(planData.target_weight_kg)
        : null,
      activityLevel: profileData.activity_level as ActivityLevel,
      plan: planData?.plan_details || null,
      dailyGoals: planData
        ? {
            calories: planData.daily_calories,
            protein: Number(planData.daily_protein_g),
            carbs: Number(planData.daily_carbs_g),
            fat: Number(planData.daily_fat_g),
          }
        : null,
      username: profileData.username || null,
      displayName: profileData.display_name || null,
      profilePictureUrl: profileData.profile_picture_url || null,
      bio: profileData.bio || null,
      isPrivate: profileData.is_private ?? false,
    };

    await cacheProfile(profile);
    return profile;
  } catch (error) {
    console.error('Error loading user profile:', error);
    return await getCachedProfile();
  }
}

export async function clearUserProfile(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  try {
    await supabase.from('user_plans').delete().eq('user_id', userId);
    await supabase.from('daily_logs').delete().eq('user_id', userId);
    await supabase.from('weight_logs').delete().eq('user_id', userId);
    await supabase.from('user_insights').delete().eq('user_id', userId);
    await supabase.from('profiles').delete().eq('id', userId);
  } catch (error) {
    console.error('Error clearing user profile:', error);
  }
}
