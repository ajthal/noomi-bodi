import axios from 'axios';
import { withRetry } from '../utils/retry';
import { MealData, UserProfile } from './storage';
import { cmToFeetInchesStr, kgToLbs } from '../utils/units';
import { TOOL_DEFINITIONS, executeTool } from './claudeTools';
import { supabase } from './supabase';
import type { MealEntry, DailyMacroTotals } from './mealLog';

// ── Anthropic Messages API types ──────────────────────────────────────

type TextBlock = { type: 'text'; text: string };
type ImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
};
type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string };
type ContentBlock = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

type ApiMessage = {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Raw base64 image data – only populated for the current request, never persisted. */
  imageBase64?: string;
  imageMimeType?: string;
}

// ── Date helper ──────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Image helpers ─────────────────────────────────────────────────────

const VALID_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/** Map non-standard MIME strings (e.g. `image/jpg`) to a value the API accepts. */
function normalizeMediaType(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (VALID_MEDIA_TYPES.has(lower)) return lower;
  if (lower === 'image/jpg') return 'image/jpeg';
  return 'image/jpeg';
}

/** Strip a `data:…;base64,` prefix if the picker included one. */
function stripDataUriPrefix(data: string): string {
  const commaIdx = data.indexOf(',');
  return commaIdx !== -1 ? data.slice(commaIdx + 1) : data;
}

// ── Marker constants used to parse structured data from responses ─────

export const PLAN_START = '[PLAN_START]';
export const PLAN_END = '[PLAN_END]';
export const MEAL_START = '[MEAL_DATA]';
export const MEAL_END = '[/MEAL_DATA]';
export const SAVE_MEAL_START = '[SAVE_MEAL]';
export const SAVE_MEAL_END = '[/SAVE_MEAL]';

// ── AI usage logging ──────────────────────────────────────────────────

const INPUT_COST_PER_MILLION = 3; // $3 per million input tokens
const OUTPUT_COST_PER_MILLION = 15; // $15 per million output tokens

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION
  );
}

async function logAiUsage(params: {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  toolsUsed?: string[];
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const totalTokens = params.tokensInput + params.tokensOutput;
    const cost = estimateCost(params.tokensInput, params.tokensOutput);

    await supabase.from('ai_usage_logs').insert({
      user_id: user.id,
      model: params.model,
      tokens_input: params.tokensInput,
      tokens_output: params.tokensOutput,
      total_tokens: totalTokens,
      estimated_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
      latency_ms: params.latencyMs,
      success: params.success,
      error_message: params.errorMessage ?? null,
      tools_used: params.toolsUsed?.length ? params.toolsUsed : null,
    });
  } catch (e) {
    console.warn('Failed to log AI usage:', e);
  }
}

// ── Context window management ─────────────────────────────────────────

/** Rough token estimate: ~4 chars per token for English text. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => {
    let tokens = estimateTokens(m.content);
    if (m.imageBase64) tokens += 1600; // ~1600 tokens for a typical image
    return sum + tokens;
  }, 0);
}

const CONTEXT_BUDGET_TOKENS = 150_000;
const SYSTEM_PROMPT_RESERVE = 8_000;
/**
 * Trim messages to fit within the context budget, keeping the most recent ones.
 * Returns the messages to send and the messages that were dropped (for summarization).
 */
export function windowMessages(
  messages: ChatMessage[],
  systemPromptTokens: number,
): { kept: ChatMessage[]; dropped: ChatMessage[] } {
  const budget = CONTEXT_BUDGET_TOKENS - systemPromptTokens - SYSTEM_PROMPT_RESERVE;
  let total = 0;
  let cutIndex = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    let tokens = estimateTokens(messages[i].content);
    if (messages[i].imageBase64) tokens += 1600;
    if (total + tokens > budget) {
      cutIndex = i + 1;
      break;
    }
    total += tokens;
  }

  return {
    kept: messages.slice(cutIndex),
    dropped: messages.slice(0, cutIndex),
  };
}

/**
 * Ask Claude to produce a concise summary of dropped messages.
 * The summary is injected into the system prompt so context isn't fully lost.
 */
export async function summarizeDroppedMessages(
  droppedMessages: ChatMessage[],
  existingSummary: string | null,
  apiKey: string,
): Promise<string> {
  const transcript = droppedMessages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
    .join('\n');

  const prompt = existingSummary
    ? `Here is an existing summary of an earlier part of the conversation:\n\n${existingSummary}\n\nHere are additional messages that need to be incorporated into the summary:\n\n${transcript}\n\nProduce an updated, concise summary (max 300 words) that captures all key facts, preferences, decisions, and meal/nutrition details mentioned. Focus on information the user would expect you to remember.`
    : `Here is the beginning of a conversation between a user and their AI nutrition coach:\n\n${transcript}\n\nProduce a concise summary (max 300 words) that captures all key facts, preferences, decisions, and meal/nutrition details mentioned. Focus on information the user would expect you to remember.`;

  try {
    const response = await axios.post(
      API_URL,
      {
        model: CLAUDE_MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
        system: 'You are a summarization assistant. Produce only the summary, nothing else.',
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );
    const block = response.data.content?.[0];
    return block?.type === 'text' ? block.text : existingSummary ?? '';
  } catch {
    return existingSummary ?? '';
  }
}

// ── Core API call ─────────────────────────────────────────────────────

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

const MAX_TOOL_ROUNDS = 5;

/** Send a chat-style request to the Anthropic Messages API and return the text response.
 *  Handles tool_use responses automatically by executing the requested function and
 *  continuing the conversation until Claude produces a final text response. */
export async function sendMessageToClaude(
  messages: ChatMessage[],
  apiKey?: string | null,
  systemPrompt?: string | null,
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'No Claude API key provided. Please add your API key in the Profile screen.',
    );
  }

  const startTime = Date.now();
  const hasImage = messages.some(m => m.imageBase64);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const allToolsUsed: string[] = [];

  const apiMessages: ApiMessage[] = messages.map(msg => {
    if (msg.imageBase64 && msg.imageMimeType) {
      const content: ContentBlock[] = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizeMediaType(msg.imageMimeType),
            data: stripDataUriPrefix(msg.imageBase64),
          },
        },
        { type: 'text', text: msg.content },
      ];
      return { role: msg.role, content };
    }
    return { role: msg.role, content: msg.content };
  });

  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };

  const axiosOpts = { headers, maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 60000 };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    try {
      const body: Record<string, unknown> = {
        model: CLAUDE_MODEL,
        max_tokens: hasImage ? 4096 : 2048,
        messages: apiMessages,
        tools: TOOL_DEFINITIONS,
      };
      if (systemPrompt?.trim()) {
        body.system = systemPrompt.trim();
      }

      const response = await withRetry(() => axios.post(API_URL, body, axiosOpts));
      const { content, stop_reason, usage } = response.data;

      if (usage) {
        totalInputTokens += usage.input_tokens ?? 0;
        totalOutputTokens += usage.output_tokens ?? 0;
      }

      if (stop_reason !== 'tool_use') {
        const textParts = (content as ContentBlock[])
          .filter((b): b is TextBlock => b.type === 'text')
          .map(b => b.text);
        const result = textParts.join('\n') || '';

        logAiUsage({
          model: CLAUDE_MODEL,
          tokensInput: totalInputTokens,
          tokensOutput: totalOutputTokens,
          latencyMs: Date.now() - startTime,
          success: true,
          toolsUsed: allToolsUsed,
        });

        return result;
      }

      const toolUseBlocks = (content as ContentBlock[]).filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        const textParts = (content as ContentBlock[])
          .filter((b): b is TextBlock => b.type === 'text')
          .map(b => b.text);
        const result = textParts.join('\n') || '';

        logAiUsage({
          model: CLAUDE_MODEL,
          tokensInput: totalInputTokens,
          tokensOutput: totalOutputTokens,
          latencyMs: Date.now() - startTime,
          success: true,
          toolsUsed: allToolsUsed,
        });

        return result;
      }

      apiMessages.push({ role: 'assistant', content: content as ContentBlock[] });

      const toolResults: ToolResultBlock[] = [];
      for (const block of toolUseBlocks) {
        allToolsUsed.push(block.name);
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      apiMessages.push({ role: 'user', content: toolResults });

    } catch (error: any) {
      const apiError = error?.response?.data;
      if (apiError) {
        console.error('Claude API error response:', JSON.stringify(apiError));
      }
      console.error('Error calling Claude API:', error?.message || error);

      logAiUsage({
        model: CLAUDE_MODEL,
        tokensInput: totalInputTokens,
        tokensOutput: totalOutputTokens,
        latencyMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.message || 'Unknown error',
        toolsUsed: allToolsUsed,
      });

      throw error;
    }
  }

  logAiUsage({
    model: CLAUDE_MODEL,
    tokensInput: totalInputTokens,
    tokensOutput: totalOutputTokens,
    latencyMs: Date.now() - startTime,
    success: true,
    toolsUsed: allToolsUsed,
  });

  return 'I needed more steps to answer that question. Could you try rephrasing?';
}

// ── Response parsing ──────────────────────────────────────────────────

/** Extract structured meal data from a `[MEAL_DATA]…[/MEAL_DATA]` block, if present. */
export function parseMealData(text: string): MealData | null {
  const start = text.indexOf(MEAL_START);
  const end = text.indexOf(MEAL_END);
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonStr = text.slice(start + MEAL_START.length, end).trim();
  try {
    const data = JSON.parse(jsonStr);
    if (
      typeof data.name === 'string' &&
      typeof data.calories === 'number' &&
      typeof data.protein === 'number' &&
      typeof data.carbs === 'number' &&
      typeof data.fat === 'number'
    ) {
      return {
        name: data.name,
        calories: Math.round(data.calories),
        protein: Math.round(data.protein),
        carbs: Math.round(data.carbs),
        fat: Math.round(data.fat),
      };
    }
  } catch {
    console.warn('Failed to parse meal data JSON:', jsonStr);
  }
  return null;
}

/** Remove `[MEAL_DATA]…[/MEAL_DATA]` markers so the user sees clean text. */
export function stripMealMarkers(text: string): string {
  const start = text.indexOf(MEAL_START);
  const end = text.indexOf(MEAL_END);
  if (start === -1 || end === -1 || end <= start) return text;
  return (text.slice(0, start) + text.slice(end + MEAL_END.length)).trim();
}

/** Extract a save-meal suggestion from `[SAVE_MEAL]…[/SAVE_MEAL]`, if present. */
export function parseSaveMealSuggestion(text: string): MealData | null {
  const start = text.indexOf(SAVE_MEAL_START);
  const end = text.indexOf(SAVE_MEAL_END);
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonStr = text.slice(start + SAVE_MEAL_START.length, end).trim();
  try {
    const data = JSON.parse(jsonStr);
    if (
      typeof data.name === 'string' &&
      typeof data.calories === 'number' &&
      typeof data.protein === 'number' &&
      typeof data.carbs === 'number' &&
      typeof data.fat === 'number'
    ) {
      return {
        name: data.name,
        calories: Math.round(data.calories),
        protein: Math.round(data.protein),
        carbs: Math.round(data.carbs),
        fat: Math.round(data.fat),
      };
    }
  } catch {
    console.warn('Failed to parse save-meal suggestion JSON:', jsonStr);
  }
  return null;
}

/** Remove `[SAVE_MEAL]…[/SAVE_MEAL]` markers so the user sees clean text. */
export function stripSaveMealMarkers(text: string): string {
  const start = text.indexOf(SAVE_MEAL_START);
  const end = text.indexOf(SAVE_MEAL_END);
  if (start === -1 || end === -1 || end <= start) return text;
  return (text.slice(0, start) + text.slice(end + SAVE_MEAL_END.length)).trim();
}

/** Extract plan text from `[PLAN_START]…[PLAN_END]` markers. Returns null if not present. */
export function parsePlanText(text: string): string | null {
  const start = text.indexOf(PLAN_START);
  const end = text.indexOf(PLAN_END);
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start + PLAN_START.length, end).trim() || null;
}

/** Remove `[PLAN_START]…[PLAN_END]` markers, keeping the plan text inline. */
export function stripPlanMarkers(text: string): string {
  const start = text.indexOf(PLAN_START);
  const end = text.indexOf(PLAN_END);
  if (start === -1 || end === -1 || end <= start) return text;
  const planText = text.slice(start + PLAN_START.length, end).trim();
  return (text.slice(0, start) + planText + text.slice(end + PLAN_END.length)).trim();
}

// ── System prompt builders ────────────────────────────────────────────

export interface DailyContext {
  meals: MealEntry[];
  totals: DailyMacroTotals;
}

/** Build a context-aware system prompt for the chat screen. */
export function buildChatSystemPrompt(
  profile: UserProfile | null,
  daily?: DailyContext | null,
): string {
  if (!profile) return '';

  const heightImperial = cmToFeetInchesStr(profile.heightCm);
  const weightLbs = Math.round(kgToLbs(profile.weightKg));
  const targetLbs = profile.targetWeightKg
    ? Math.round(kgToLbs(profile.targetWeightKg))
    : null;

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const lines = [
    "You are the same NoomiBodi coach who created this user's plan. You have the following context about them.",
    '',
    `**Current date & time**: ${dateStr}, ${timeStr}`,
    '',
    '**Profile**',
    `Gender: ${profile.gender}, Age: ${profile.age}, Height: ${heightImperial}, Current weight: ${weightLbs} lb`,
    `Goal: ${profile.goal} weight${targetLbs ? `, Target weight: ${targetLbs} lb` : ''}`,
    `Activity level: ${profile.activityLevel}`,
  ];

  if (profile.plan?.trim()) {
    lines.push(
      '',
      '**Current plan (you or the app generated this)**',
      '',
      profile.plan.trim(),
    );
  }

  if (daily && daily.meals.length > 0) {
    const t = daily.totals;
    lines.push(
      '',
      "**Today's food log (from the app — this is the source of truth)**",
      `Meals logged: ${daily.meals.length}`,
      `Running totals: ${t.calories} cal, ${t.protein}g protein, ${t.carbs}g carbs, ${t.fat}g fat`,
      '',
      'Individual meals:',
    );
    for (const m of daily.meals) {
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      lines.push(`- ${time}: ${m.name} (${m.calories} cal, ${m.protein}g P, ${m.carbs}g C, ${m.fat}g F)`);
    }
    lines.push(
      '',
      'IMPORTANT: Use these totals when the user asks about their daily intake. Do NOT estimate from conversation history alone — the app log above is the accurate source.',
    );
  } else {
    lines.push('', "**Today's food log**: No meals logged yet today.");
  }

  lines.push(
    '',
    'When the user asks to change their plan, update it based on this context and their request.',
    'When you output a NEW or REVISED plan, wrap ONLY the exact plan text between [PLAN_START] and [PLAN_END] markers on their own lines, so the app can save it automatically.',
    '',
    '**Meal logging instructions**',
    'Whenever you estimate or describe the nutritional content of a specific meal (whether from an image or conversation), include a JSON block wrapped in markers so the app can offer to log it:',
    '[MEAL_DATA]{"name":"Meal Name","calories":000,"protein":00,"carbs":00,"fat":00}[/MEAL_DATA]',
    'Always include this block when you give a nutritional breakdown for a meal. The values should be your best estimates in whole numbers (calories in kcal, macros in grams).',
    'If the user mentions a meal they eat regularly or that you recognize from earlier in the conversation, proactively offer to log it with the estimated nutritional content.',
    '',
    '**Saved meals instructions**',
    'If you notice the user has logged or mentioned the same meal multiple times during the conversation, or they explicitly say they eat something regularly, suggest saving it to their meal library by including:',
    '[SAVE_MEAL]{"name":"Meal Name","calories":000,"protein":00,"carbs":00,"fat":00}[/SAVE_MEAL]',
    'The app will show a "Save to Meals" button so they can quick-add it in the future. Only suggest this when a meal clearly appears to be a regular/favourite — do not suggest it for every single meal.',
    '',
    '**Data tools — CRITICAL date rules**',
    `TODAY_DATE = ${toLocalDateString(now)} (this is the user's local date right now).`,
    'You have tools that query the database. Every tool result includes a "today_is" field — ALWAYS cross-check it against the dates in the result.',
    '',
    'RULES:',
    '- When the user says "today" they mean TODAY_DATE above. Pass exactly that string to any date parameter.',
    '- For "yesterday", subtract 1 day from TODAY_DATE.',
    '- For "all time" / "ever" / "total", pass days=0 to get_period_summary.',
    '- Each item in a tool result has a "date" field and an "is_today" boolean. Trust these, not your own date math.',
    '- Do NOT confuse dates in the result. If a row says date="2026-02-19" and is_today=false, that is NOT today.',
    '',
    'Tool mapping:',
    '- "How much X did I eat today/yesterday/on DATE?" → get_daily_totals',
    '- "What did I eat today/this week?" → get_meals_by_date_range',
    '- "Total ever / this week / this month summary" → get_period_summary (days=0 for all time, 7 for week, 30 for month)',
    '- "Am I hitting my goals?" → calculate_adherence_rate',
    '- "Weight trend / progress" → get_weight_trend (days=0 for all time)',
    '- "What meals do I have saved?" → search_saved_meals',
    '- "When will I reach my goal?" / "Patterns?" / "Predictions?" → get_analytics',
    '- "What are my most common meals?" / "Favourite meals?" → get_frequent_meals',
    '- "Find high-protein meals" / "Meals under 400 cal" → search_meals_by_macro',
    '- "What did I eat on my best days?" → get_best_adherence_days',
    '- "Show me every time I ate chicken" → get_meal_history',
    '- "What should I eat?" / "How much protein do I still need?" → get_remaining_macros',
    '',
    'ALWAYS use tools for historical/aggregate questions. Do NOT estimate from conversation history or the system prompt food log.',
    '',
    '**Meal planning & recipe capabilities**',
    'You can generate meal plans, suggest recipes, and recommend meals. When doing so:',
    '- ALWAYS call get_remaining_macros first so you know what the user still needs today.',
    '- Call search_saved_meals and/or get_frequent_meals to personalize suggestions with meals the user already likes.',
    '- Be time-aware: suggest breakfast foods in the morning, dinner foods in the evening.',
    '- When generating a multi-day meal plan, format it clearly day-by-day with per-meal macros and a daily total.',
    '- Include a [MEAL_DATA] block for every concrete meal suggestion so the user can log it immediately.',
    '- For recipe suggestions, include ingredients, brief instructions, and macro estimates.',
    '',
    '**Smart recommendations**',
    'When the user asks "what should I eat" or similar:',
    '1. Call get_remaining_macros to see what they still need.',
    '2. Call get_frequent_meals and search_saved_meals to find meals they already enjoy that fit.',
    '3. Suggest 2-3 concrete options that best fill the remaining macro gaps.',
    '4. Prioritize whichever macro is furthest from the goal.',
  );

  return lines.join('\n');
}

/** Build the one-shot prompt used during onboarding to generate a personalised plan. */
export async function generatePlanWithClaude(
  profile: UserProfile,
  apiKey?: string | null,
  extraDetails?: string,
): Promise<string> {
  const { gender, age, heightCm, weightKg, goal, targetWeightKg, activityLevel } =
    profile;

  const heightImperial = cmToFeetInchesStr(heightCm);
  const weightLbs = Math.round(kgToLbs(weightKg));
  const targetWeightLbs = targetWeightKg
    ? Math.round(kgToLbs(targetWeightKg))
    : null;

  const userContent = [
    'You are a friendly nutrition and fitness coach.',
    'Create a concise, easy-to-follow 7-day plan for this person.',
    '',
    `Gender: ${gender}`,
    `Age: ${age}`,
    `Height: ${heightImperial} (feet/inches)`,
    `Current weight: ${weightLbs} lb`,
    `Goal: ${goal} weight`,
    targetWeightLbs ? `Target weight: ${targetWeightLbs} lb` : '',
    `Activity level: ${activityLevel}`,
    extraDetails
      ? ['', 'Additional context from the user (use this to personalise the plan):', extraDetails].join('\n')
      : '',
    '',
    'Return:',
    '- An estimated daily calorie target',
    '- Approximate daily protein / carbs / fat targets (in grams)',
    '- 3–5 bullet points of simple dietary guidance',
    '- 3–5 bullet points of realistic movement/exercise suggestions',
    '',
    'Use imperial units (lb, feet/inches) when talking about body size, and keep the tone supportive and brief so it fits nicely in a mobile screen.',
  ]
    .filter(Boolean)
    .join('\n');

  if (!apiKey) {
    throw new Error('No Claude API key provided.');
  }
  return sendSimpleMessage([{ role: 'user', content: userContent }], apiKey);
}

/** Simple one-shot request without tool support (e.g. onboarding plan generation). */
async function sendSimpleMessage(
  messages: ChatMessage[],
  apiKey: string,
): Promise<string> {
  const startTime = Date.now();
  const apiMessages = messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  try {
    const response = await withRetry(() => axios.post(
      API_URL,
      { model: CLAUDE_MODEL, max_tokens: 1024, messages: apiMessages },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    ));

    const { usage } = response.data;
    logAiUsage({
      model: CLAUDE_MODEL,
      tokensInput: usage?.input_tokens ?? 0,
      tokensOutput: usage?.output_tokens ?? 0,
      latencyMs: Date.now() - startTime,
      success: true,
    });

    return response.data.content[0].text;
  } catch (error: any) {
    logAiUsage({
      model: CLAUDE_MODEL,
      tokensInput: 0,
      tokensOutput: 0,
      latencyMs: Date.now() - startTime,
      success: false,
      errorMessage: error?.message || 'Unknown error',
    });
    throw error;
  }
}
