import { supabase } from './supabase';
import { updateWidgetData, getTodayDate } from './widgetBridge';

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
};

export async function syncWidgetData(userId: string): Promise<void> {
  try {
    const today = getTodayDate();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    const [mealsResult, planResult] = await Promise.all([
      supabase
        .from('daily_logs')
        .select('calories, protein_g, carbs_g, fat_g')
        .eq('user_id', userId)
        .gte('logged_at', startOfDay)
        .lte('logged_at', endOfDay),
      supabase
        .from('user_plans')
        .select('daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const meals = mealsResult.data ?? [];
    const totals = meals.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories || 0),
        protein: acc.protein + (Number(m.protein_g) || 0),
        carbs: acc.carbs + (Number(m.carbs_g) || 0),
        fat: acc.fat + (Number(m.fat_g) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    const plan = planResult.data;
    const goals = plan
      ? {
          calories: plan.daily_calories ?? DEFAULT_GOALS.calories,
          protein: plan.daily_protein_g ?? DEFAULT_GOALS.protein,
          carbs: plan.daily_carbs_g ?? DEFAULT_GOALS.carbs,
          fat: plan.daily_fat_g ?? DEFAULT_GOALS.fat,
        }
      : DEFAULT_GOALS;

    await updateWidgetData({
      date: today,
      caloriesConsumed: Math.round(totals.calories),
      caloriesGoal: goals.calories,
      proteinConsumed: Math.round(totals.protein),
      proteinGoal: goals.protein,
      carbsConsumed: Math.round(totals.carbs),
      carbsGoal: goals.carbs,
      fatConsumed: Math.round(totals.fat),
      fatGoal: goals.fat,
    });
  } catch (error) {
    console.error('Failed to sync widget data:', error);
  }
}
