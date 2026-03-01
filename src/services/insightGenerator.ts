import axios from 'axios';
import { supabase } from './supabase';
import { getApiKey, loadUserProfile, estimateDailyGoals } from './storage';
import { executeTool } from './claudeTools';
import { getAnalytics } from './analytics';
import { kgToLbs } from '../utils/units';

// ── Types ────────────────────────────────────────────────────────────

export type InsightType = 'success' | 'warning' | 'recommendation' | 'alert';

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  dataContext?: Record<string, unknown> | null;
  priority: number;
  isDismissed: boolean;
  createdAt: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const API_URL = 'https://api.anthropic.com/v1/messages';

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

function rowToInsight(row: any): Insight {
  return {
    id: row.id,
    type: row.insight_type as InsightType,
    title: row.title,
    description: row.description,
    dataContext: row.data_context,
    priority: row.priority ?? 0,
    isDismissed: row.is_dismissed ?? false,
    createdAt: new Date(row.created_at).getTime(),
  };
}

// ── Gather data context for Claude ──────────────────────────────────

async function gatherDataForInsights(): Promise<string> {
  const today = toLocalDateString(new Date());
  const sections: string[] = [`Data snapshot taken on ${today}:\n`];

  const [weekSummary, monthSummary, weightAll, savedMeals, adherence7, adherence30] =
    await Promise.all([
      executeTool('get_period_summary', { days: 7 }),
      executeTool('get_period_summary', { days: 30 }),
      executeTool('get_weight_trend', { days: 0 }),
      executeTool('search_saved_meals', { query: '' }),
      executeTool('calculate_adherence_rate', { days: 7, calorie_goal: 0 }),
      executeTool('calculate_adherence_rate', { days: 30, calorie_goal: 0 }),
    ]);

  sections.push('## Last 7 days nutrition:\n' + weekSummary);
  sections.push('\n## Last 30 days nutrition:\n' + monthSummary);
  sections.push('\n## Weight history (all time):\n' + weightAll);
  sections.push('\n## Saved meals library:\n' + savedMeals);

  const profile = await loadUserProfile();
  if (profile) {
    const goals = estimateDailyGoals(profile);
    sections.push(`\n## User goals:\nCalories: ${goals.calories}, Protein: ${goals.protein}g, Carbs: ${goals.carbs}g, Fat: ${goals.fat}g`);
    sections.push(`Goal type: ${profile.goal} weight`);
    if (profile.targetWeightKg) {
      sections.push(`Target weight: ${Math.round(kgToLbs(profile.targetWeightKg))} lbs`);
    }
    sections.push(`Current weight: ${Math.round(kgToLbs(profile.weightKg))} lbs`);

    const adherence7WithGoal = await executeTool('calculate_adherence_rate', { days: 7, calorie_goal: goals.calories });
    const adherence30WithGoal = await executeTool('calculate_adherence_rate', { days: 30, calorie_goal: goals.calories });
    sections.push('\n## 7-day goal adherence:\n' + adherence7WithGoal);
    sections.push('\n## 30-day goal adherence:\n' + adherence30WithGoal);
  }

  // Predictive analytics
  const analytics = await getAnalytics();
  sections.push('\n## Predictive Analytics:\n' + JSON.stringify(analytics));

  return sections.join('\n');
}

// ── Claude call to generate insights ────────────────────────────────

const INSIGHT_SYSTEM_PROMPT = `You are an AI nutrition coach analyzing a user's food logging and weight tracking data.

Your job is to identify 3-5 key insights from their data. Each insight must be one of these types:
- "success": Positive achievement, streak, or good habit (green)
- "warning": Something trending in the wrong direction (yellow)  
- "recommendation": Actionable advice based on a pattern (blue)
- "alert": Something that needs immediate attention (red)

RESPOND ONLY with a JSON array. No other text before or after. Each object must have:
- "type": one of "success", "warning", "recommendation", "alert"
- "title": short headline (under 60 chars)
- "description": 1-2 sentence explanation with specific numbers from the data
- "priority": integer 1-10 (10 = most important)

Examples:
[
  {"type":"success","title":"6-day calorie streak!","description":"You've hit your calorie goal 6 days in a row — your best streak yet. Keep it going!","priority":9},
  {"type":"warning","title":"Protein consistently low","description":"Your protein averaged 120g/day this week vs your 155g goal — that's 23% below target.","priority":7}
]

Rules:
- Use ONLY data provided. Never invent numbers.
- If there's very little data (< 3 days), say so in one insight and give encouragement.
- Be specific: include actual numbers, percentages, and comparisons to goals.
- Keep titles punchy and motivating.
- Sort by priority descending in your response.`;

async function callClaudeForInsights(dataContext: string, apiKey: string): Promise<Insight[]> {
  const response = await axios.post(
    API_URL,
    {
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: INSIGHT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Analyze this user's data and generate insights:\n\n${dataContext}` }],
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    },
  );

  const text: string = response.data.content[0].text;

  // Extract JSON array from response (Claude may wrap it in backticks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('Insight generation: no JSON array found in response');
    return [];
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (item: any) =>
        typeof item.type === 'string' &&
        typeof item.title === 'string' &&
        typeof item.description === 'string',
    )
    .map((item: any, i: number) => ({
      id: `generated-${i}`,
      type: item.type as InsightType,
      title: item.title,
      description: item.description,
      dataContext: null,
      priority: item.priority ?? 5,
      isDismissed: false,
      createdAt: Date.now(),
    }));
}

// ── Supabase persistence ────────────────────────────────────────────

async function saveInsightsToDb(insights: Insight[]): Promise<Insight[]> {
  const userId = await getUserId();
  if (!userId) return insights;

  // Clear old undismissed insights for this user
  await supabase
    .from('user_insights')
    .delete()
    .eq('user_id', userId)
    .eq('is_dismissed', false);

  const rows = insights.map(ins => ({
    user_id: userId,
    insight_type: ins.type,
    title: ins.title,
    description: ins.description,
    data_context: ins.dataContext,
    priority: ins.priority,
    is_dismissed: false,
    valid_from: new Date().toISOString(),
    valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { data: savedRows, error } = await supabase
    .from('user_insights')
    .insert(rows)
    .select();

  if (error || !savedRows) {
    console.error('Failed to save insights:', error);
    return insights;
  }

  return savedRows.map(rowToInsight);
}

export async function loadCachedInsights(): Promise<Insight[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data: rows, error } = await supabase
    .from('user_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('is_dismissed', false)
    .gte('valid_until', new Date().toISOString())
    .order('priority', { ascending: false });

  if (error || !rows) return [];
  return rows.map(rowToInsight);
}

export async function dismissInsight(id: string): Promise<void> {
  await supabase
    .from('user_insights')
    .update({ is_dismissed: true })
    .eq('id', id);
}

// ── Main entry point ────────────────────────────────────────────────

export async function generateInsights(forceRefresh = false): Promise<Insight[]> {
  if (!forceRefresh) {
    const cached = await loadCachedInsights();
    if (cached.length > 0) return cached;
  }

  const apiKey = await getApiKey();
  if (!apiKey) return [];

  const dataContext = await gatherDataForInsights();
  const insights = await callClaudeForInsights(dataContext, apiKey);
  if (insights.length === 0) return [];

  return saveInsightsToDb(insights);
}
