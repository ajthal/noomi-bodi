import { supabase } from './supabase';
import { kgToLbs } from '../utils/units';
import { getAnalytics } from './analytics';
import { loadUserProfile, estimateDailyGoals } from './storage';

// ── Helpers ─────────────────────────────────────────────────────────

async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr(): string {
  return toLocalDateString(new Date());
}

/** Local-midnight Date for `n` days in the past. 0 = today at 00:00. */
function localMidnightDaysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/** Build a date range filter. Omits the `.gte` when allTime is true. */
function applyDateFilter(
  query: any,
  column: string,
  days: number,
): any {
  if (days > 0) {
    const start = localMidnightDaysAgo(days - 1);
    return query.gte(column, start.toISOString());
  }
  return query; // 0 = all time, no filter
}

// ── Tool Definitions (Anthropic tool schema format) ──────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'get_daily_totals',
    description:
      'Get calorie and macro totals for a specific date. Returns total calories, protein, carbs, fat, and meal count for that single day.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description:
            'The date to query in YYYY-MM-DD format. Must use today_date from the system prompt when asking about today.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_meals_by_date_range',
    description:
      'List every individual meal logged between two dates (inclusive). Returns meal name, calories, macros, and the local date it was logged on. Use this when the user asks "what did I eat" on a day or range.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (inclusive). Use today_date from the system prompt when appropriate.',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format (inclusive). Use today_date from the system prompt when appropriate.',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'get_period_summary',
    description:
      'Get aggregated nutrition data over a period: per-day breakdown, overall totals, and daily averages for calories, protein, carbs, fat. Use for weekly/monthly/all-time summaries.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description:
            'Number of days to look back from and including today. 7 = last 7 days, 30 = last 30 days, 0 = ALL TIME (every record in the database).',
        },
      },
      required: ['days'],
    },
  },
  {
    name: 'calculate_adherence_rate',
    description:
      'Calculate the percentage of tracked days the user hit their calorie goal (within ±10%). Returns hit count, total tracked days, and adherence rate.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description:
            'Number of days to look back from today. 7 = this week, 30 = this month, 0 = ALL TIME.',
        },
        calorie_goal: {
          type: 'number',
          description: "The user's daily calorie goal. Get this from the plan in the system prompt.",
        },
      },
      required: ['days', 'calorie_goal'],
    },
  },
  {
    name: 'get_weight_trend',
    description:
      'Get weight log entries over time. Returns dates and weights in lbs with change stats. Use when the user asks about weight progress or history.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back. 0 = ALL TIME.',
        },
      },
      required: ['days'],
    },
  },
  {
    name: 'search_saved_meals',
    description:
      "Search the user's saved meals library by name (case-insensitive partial match). Returns matching meals with nutrition info.",
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term to match against meal names. Empty string returns all saved meals.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_analytics',
    description:
      'Get predictive analytics: weight goal projection (estimated date to reach goal weight), day-of-week adherence patterns, and data correlations. Use when the user asks about predictions, patterns, trends, or when they will reach their goal.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_frequent_meals',
    description:
      'Get the most frequently logged meals, ranked by how often they appear in daily_logs. Use when the user asks about their favourite meals, most common meals, or what they eat often.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max number of meals to return. Default 10.',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_meals_by_macro',
    description:
      'Find logged meals that are high (or low) in a specific macro. Use when the user asks "what are my high-protein meals" or "find meals under 400 calories". Searches all-time daily_logs.',
    input_schema: {
      type: 'object',
      properties: {
        macro: {
          type: 'string',
          description: 'Which nutrient to filter by: "calories", "protein", "carbs", or "fat".',
        },
        min_amount: {
          type: 'number',
          description: 'Minimum value for the macro (inclusive). Omit or use 0 for no minimum.',
        },
        max_amount: {
          type: 'number',
          description: 'Maximum value for the macro (inclusive). Omit for no maximum.',
        },
        limit: {
          type: 'number',
          description: 'Max results to return. Default 10.',
        },
      },
      required: ['macro'],
    },
  },
  {
    name: 'get_best_adherence_days',
    description:
      'Find the days when the user best hit their calorie goal (within ±10%). Returns the top N days with their meals listed. Use when the user asks about their best days or what they ate when they were on track.',
    input_schema: {
      type: 'object',
      properties: {
        calorie_goal: {
          type: 'number',
          description: "The user's daily calorie goal from the system prompt.",
        },
        limit: {
          type: 'number',
          description: 'Number of top days to return. Default 5.',
        },
      },
      required: ['calorie_goal'],
    },
  },
  {
    name: 'get_meal_history',
    description:
      'Find every time a specific meal (or similar name) was logged. Use when the user asks "show me all the times I ate X" or wants to see how often they eat something.',
    input_schema: {
      type: 'object',
      properties: {
        meal_name: {
          type: 'string',
          description: 'Meal name to search for (case-insensitive partial match).',
        },
      },
      required: ['meal_name'],
    },
  },
  {
    name: 'get_remaining_macros',
    description:
      'Get the remaining calories and macros the user needs to hit their daily goals. Returns both the goals and how much is left. Use for meal/recipe suggestions, "what should I eat" questions, or planning remaining meals for the day.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Tool Implementations ────────────────────────────────────────────

async function getDailyTotals(input: { date: string }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  const start = new Date(input.date + 'T00:00:00');
  const end = new Date(input.date + 'T23:59:59.999');

  const { data: rows, error } = await supabase
    .from('daily_logs')
    .select('calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .gte('logged_at', start.toISOString())
    .lte('logged_at', end.toISOString());

  if (error) return JSON.stringify({ error: error.message });

  const today = todayStr();

  if (!rows || rows.length === 0) {
    return JSON.stringify({
      today_is: today,
      queried_date: input.date,
      is_today: input.date === today,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      meal_count: 0,
      note: 'No meals logged on this date.',
    });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      calories: acc.calories + (r.calories || 0),
      protein_g: acc.protein_g + (Number(r.protein_g) || 0),
      carbs_g: acc.carbs_g + (Number(r.carbs_g) || 0),
      fat_g: acc.fat_g + (Number(r.fat_g) || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  return JSON.stringify({
    today_is: today,
    queried_date: input.date,
    is_today: input.date === today,
    ...totals,
    meal_count: rows.length,
  });
}

async function getMealsByDateRange(input: { start_date: string; end_date: string }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  const start = new Date(input.start_date + 'T00:00:00');
  const end = new Date(input.end_date + 'T23:59:59.999');

  const { data: rows, error } = await supabase
    .from('daily_logs')
    .select('meal_name, calories, protein_g, carbs_g, fat_g, logged_at')
    .eq('user_id', userId)
    .gte('logged_at', start.toISOString())
    .lte('logged_at', end.toISOString())
    .order('logged_at', { ascending: true });

  if (error) return JSON.stringify({ error: error.message });

  const today = todayStr();

  const meals = (rows ?? []).map(r => {
    const date = toLocalDateString(new Date(r.logged_at));
    return {
      date,
      is_today: date === today,
      name: r.meal_name,
      calories: r.calories || 0,
      protein_g: Number(r.protein_g) || 0,
      carbs_g: Number(r.carbs_g) || 0,
      fat_g: Number(r.fat_g) || 0,
    };
  });

  return JSON.stringify({
    today_is: today,
    start_date: input.start_date,
    end_date: input.end_date,
    meal_count: meals.length,
    meals,
  });
}

async function getPeriodSummary(input: { days: number }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  let query = supabase
    .from('daily_logs')
    .select('calories, protein_g, carbs_g, fat_g, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: true });

  query = applyDateFilter(query, 'logged_at', input.days);

  const { data: rows, error } = await query;
  if (error) return JSON.stringify({ error: error.message });

  const today = todayStr();

  if (!rows || rows.length === 0) {
    return JSON.stringify({
      today_is: today,
      period_days: input.days === 0 ? 'all_time' : input.days,
      days_tracked: 0,
      total_meals: 0,
      note: 'No data for this period.',
    });
  }

  const byDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number; meals: number }>();
  for (const r of rows) {
    const key = toLocalDateString(new Date(r.logged_at));
    const existing = byDay.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
    existing.calories += r.calories || 0;
    existing.protein += Number(r.protein_g) || 0;
    existing.carbs += Number(r.carbs_g) || 0;
    existing.fat += Number(r.fat_g) || 0;
    existing.meals += 1;
    byDay.set(key, existing);
  }

  const dailyBreakdown = Array.from(byDay.entries()).map(([date, d]) => ({
    date,
    is_today: date === today,
    ...d,
  }));

  const daysTracked = dailyBreakdown.length;
  const totalCal = dailyBreakdown.reduce((a, d) => a + d.calories, 0);
  const totalP = dailyBreakdown.reduce((a, d) => a + d.protein, 0);
  const totalC = dailyBreakdown.reduce((a, d) => a + d.carbs, 0);
  const totalF = dailyBreakdown.reduce((a, d) => a + d.fat, 0);

  return JSON.stringify({
    today_is: today,
    period_days: input.days === 0 ? 'all_time' : input.days,
    days_tracked: daysTracked,
    total_meals: rows.length,
    totals: {
      calories: totalCal,
      protein_g: Math.round(totalP),
      carbs_g: Math.round(totalC),
      fat_g: Math.round(totalF),
    },
    daily_averages: {
      calories: Math.round(totalCal / daysTracked),
      protein_g: Math.round(totalP / daysTracked),
      carbs_g: Math.round(totalC / daysTracked),
      fat_g: Math.round(totalF / daysTracked),
    },
    daily_breakdown: dailyBreakdown,
  });
}

async function calculateAdherenceRate(input: { days: number; calorie_goal: number }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  let query = supabase
    .from('daily_logs')
    .select('calories, logged_at')
    .eq('user_id', userId);

  query = applyDateFilter(query, 'logged_at', input.days);

  const { data: rows, error } = await query;
  if (error) return JSON.stringify({ error: error.message });

  const byDay = new Map<string, number>();
  for (const r of (rows ?? [])) {
    const key = toLocalDateString(new Date(r.logged_at));
    byDay.set(key, (byDay.get(key) ?? 0) + (r.calories || 0));
  }

  const lo = input.calorie_goal * 0.9;
  const hi = input.calorie_goal * 1.1;
  let hitDays = 0;

  for (const cal of byDay.values()) {
    if (cal >= lo && cal <= hi) hitDays++;
  }

  const daysTracked = byDay.size;

  return JSON.stringify({
    today_is: todayStr(),
    period_days: input.days === 0 ? 'all_time' : input.days,
    calorie_goal: input.calorie_goal,
    days_tracked: daysTracked,
    days_on_target: hitDays,
    adherence_rate: daysTracked > 0 ? Math.round((hitDays / daysTracked) * 100) : 0,
    tolerance: '±10%',
  });
}

async function getWeightTrend(input: { days: number }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  let query = supabase
    .from('weight_logs')
    .select('weight_kg, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: true });

  query = applyDateFilter(query, 'logged_at', input.days);

  const { data: rows, error } = await query;
  if (error) return JSON.stringify({ error: error.message });

  const today = todayStr();

  if (!rows || rows.length === 0) {
    return JSON.stringify({ today_is: today, entries: [], note: 'No weight data found.' });
  }

  const entries = rows.map(r => ({
    date: toLocalDateString(new Date(r.logged_at)),
    weight_lbs: Math.round(kgToLbs(Number(r.weight_kg)) * 10) / 10,
  }));

  const first = entries[0];
  const last = entries[entries.length - 1];
  const changeLbs = Math.round((last.weight_lbs - first.weight_lbs) * 10) / 10;

  return JSON.stringify({
    today_is: today,
    entry_count: entries.length,
    first_entry: first,
    latest_entry: last,
    change_lbs: changeLbs,
    entries,
  });
}

async function searchSavedMeals(input: { query: string }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  let query = supabase
    .from('saved_meals')
    .select('meal_name, calories, protein_g, carbs_g, fat_g, notes')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (input.query.trim()) {
    query = query.ilike('meal_name', `%${input.query.trim()}%`);
  }

  const { data: rows, error } = await query;
  if (error) return JSON.stringify({ error: error.message });

  const meals = (rows ?? []).map(r => ({
    name: r.meal_name,
    calories: r.calories || 0,
    protein_g: Number(r.protein_g) || 0,
    carbs_g: Number(r.carbs_g) || 0,
    fat_g: Number(r.fat_g) || 0,
    notes: r.notes,
  }));

  return JSON.stringify({ query: input.query, result_count: meals.length, meals });
}

async function getAnalyticsTool(): Promise<string> {
  const result = await getAnalytics();
  return JSON.stringify({ today_is: todayStr(), ...result });
}

async function getFrequentMeals(input: { limit?: number }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  const { data: rows, error } = await supabase
    .from('daily_logs')
    .select('meal_name, calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId);

  if (error) return JSON.stringify({ error: error.message });

  const freq = new Map<string, { count: number; calories: number; protein: number; carbs: number; fat: number }>();
  for (const r of (rows ?? [])) {
    const key = (r.meal_name ?? '').toLowerCase().trim();
    const existing = freq.get(key) ?? { count: 0, calories: 0, protein: 0, carbs: 0, fat: 0 };
    existing.count += 1;
    existing.calories += r.calories || 0;
    existing.protein += Number(r.protein_g) || 0;
    existing.carbs += Number(r.carbs_g) || 0;
    existing.fat += Number(r.fat_g) || 0;
    freq.set(key, existing);
  }

  const sorted = Array.from(freq.entries())
    .map(([name, d]) => ({
      name: (rows ?? []).find(r => (r.meal_name ?? '').toLowerCase().trim() === name)?.meal_name ?? name,
      times_logged: d.count,
      avg_calories: Math.round(d.calories / d.count),
      avg_protein_g: Math.round(d.protein / d.count),
      avg_carbs_g: Math.round(d.carbs / d.count),
      avg_fat_g: Math.round(d.fat / d.count),
    }))
    .sort((a, b) => b.times_logged - a.times_logged)
    .slice(0, input.limit ?? 10);

  return JSON.stringify({ today_is: todayStr(), meals: sorted });
}

async function searchMealsByMacro(input: { macro: string; min_amount?: number; max_amount?: number; limit?: number }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  const colMap: Record<string, string> = { calories: 'calories', protein: 'protein_g', carbs: 'carbs_g', fat: 'fat_g' };
  const col = colMap[input.macro];
  if (!col) return JSON.stringify({ error: `Unknown macro: ${input.macro}` });

  let query = supabase
    .from('daily_logs')
    .select('meal_name, calories, protein_g, carbs_g, fat_g, logged_at')
    .eq('user_id', userId)
    .order(col, { ascending: false });

  if (input.min_amount != null && input.min_amount > 0) {
    query = query.gte(col, input.min_amount);
  }
  if (input.max_amount != null) {
    query = query.lte(col, input.max_amount);
  }

  const { data: rows, error } = await query.limit(input.limit ?? 10);
  if (error) return JSON.stringify({ error: error.message });

  const today = todayStr();
  const meals = (rows ?? []).map(r => ({
    name: r.meal_name,
    calories: r.calories || 0,
    protein_g: Number(r.protein_g) || 0,
    carbs_g: Number(r.carbs_g) || 0,
    fat_g: Number(r.fat_g) || 0,
    date: toLocalDateString(new Date(r.logged_at)),
  }));

  return JSON.stringify({ today_is: today, macro: input.macro, result_count: meals.length, meals });
}

async function getBestAdherenceDays(input: { calorie_goal: number; limit?: number }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  const { data: rows, error } = await supabase
    .from('daily_logs')
    .select('meal_name, calories, protein_g, carbs_g, fat_g, logged_at')
    .eq('user_id', userId)
    .order('logged_at', { ascending: true });

  if (error) return JSON.stringify({ error: error.message });

  const byDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number; meals: string[] }>();
  for (const r of (rows ?? [])) {
    const key = toLocalDateString(new Date(r.logged_at));
    const existing = byDay.get(key) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] };
    existing.calories += r.calories || 0;
    existing.protein += Number(r.protein_g) || 0;
    existing.carbs += Number(r.carbs_g) || 0;
    existing.fat += Number(r.fat_g) || 0;
    existing.meals.push(r.meal_name);
    byDay.set(key, existing);
  }

  const goal = input.calorie_goal;
  const today = todayStr();
  const ranked = Array.from(byDay.entries())
    .map(([date, d]) => ({
      date,
      is_today: date === today,
      calories: d.calories,
      protein_g: Math.round(d.protein),
      carbs_g: Math.round(d.carbs),
      fat_g: Math.round(d.fat),
      meals: d.meals,
      calorie_diff: Math.abs(d.calories - goal),
    }))
    .sort((a, b) => a.calorie_diff - b.calorie_diff)
    .slice(0, input.limit ?? 5)
    .map(({ calorie_diff, ...rest }) => rest);

  return JSON.stringify({ today_is: today, calorie_goal: goal, best_days: ranked });
}

async function getMealHistory(input: { meal_name: string }): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  const { data: rows, error } = await supabase
    .from('daily_logs')
    .select('meal_name, calories, protein_g, carbs_g, fat_g, logged_at')
    .eq('user_id', userId)
    .ilike('meal_name', `%${input.meal_name.trim()}%`)
    .order('logged_at', { ascending: false });

  if (error) return JSON.stringify({ error: error.message });

  const today = todayStr();
  const entries = (rows ?? []).map(r => ({
    name: r.meal_name,
    calories: r.calories || 0,
    protein_g: Number(r.protein_g) || 0,
    carbs_g: Number(r.carbs_g) || 0,
    fat_g: Number(r.fat_g) || 0,
    date: toLocalDateString(new Date(r.logged_at)),
  }));

  return JSON.stringify({
    today_is: today,
    search_term: input.meal_name,
    times_found: entries.length,
    entries,
  });
}

async function getRemainingMacros(): Promise<string> {
  const userId = await getUserId();
  if (!userId) return JSON.stringify({ error: 'Not authenticated' });

  const profile = await loadUserProfile();
  if (!profile) return JSON.stringify({ error: 'No profile found' });

  const goals = estimateDailyGoals(profile);
  const today = todayStr();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: rows, error } = await supabase
    .from('daily_logs')
    .select('calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .gte('logged_at', startOfDay.toISOString());

  if (error) return JSON.stringify({ error: error.message });

  const consumed = (rows ?? []).reduce(
    (acc, r) => ({
      calories: acc.calories + (r.calories || 0),
      protein_g: acc.protein_g + (Number(r.protein_g) || 0),
      carbs_g: acc.carbs_g + (Number(r.carbs_g) || 0),
      fat_g: acc.fat_g + (Number(r.fat_g) || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  return JSON.stringify({
    today_is: today,
    goals: { calories: goals.calories, protein_g: goals.protein, carbs_g: goals.carbs, fat_g: goals.fat },
    consumed,
    remaining: {
      calories: Math.max(0, goals.calories - consumed.calories),
      protein_g: Math.max(0, goals.protein - consumed.protein_g),
      carbs_g: Math.max(0, goals.carbs - consumed.carbs_g),
      fat_g: Math.max(0, goals.fat - consumed.fat_g),
    },
    meals_logged: (rows ?? []).length,
  });
}

// ── Executor ────────────────────────────────────────────────────────

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_daily_totals':
      return getDailyTotals(input as { date: string });
    case 'get_meals_by_date_range':
      return getMealsByDateRange(input as { start_date: string; end_date: string });
    case 'get_period_summary':
      return getPeriodSummary(input as { days: number });
    case 'calculate_adherence_rate':
      return calculateAdherenceRate(input as { days: number; calorie_goal: number });
    case 'get_weight_trend':
      return getWeightTrend(input as { days: number });
    case 'search_saved_meals':
      return searchSavedMeals(input as { query: string });
    case 'get_analytics':
      return getAnalyticsTool();
    case 'get_frequent_meals':
      return getFrequentMeals(input as { limit?: number });
    case 'search_meals_by_macro':
      return searchMealsByMacro(input as { macro: string; min_amount?: number; max_amount?: number; limit?: number });
    case 'get_best_adherence_days':
      return getBestAdherenceDays(input as { calorie_goal: number; limit?: number });
    case 'get_meal_history':
      return getMealHistory(input as { meal_name: string });
    case 'get_remaining_macros':
      return getRemainingMacros();
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
