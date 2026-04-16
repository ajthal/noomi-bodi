import axios from 'axios';
import { withRetry } from '../utils/retry';
import { MealData, UserProfile, estimateDailyGoals, SUMMARY_MAX_CHARS } from './storage';
import { cmToFeetInchesStr, kgToLbs } from '../utils/units';
import { TOOL_DEFINITIONS, getToolsForIntent, type ToolDefinition, executeTool } from './claudeTools';
import { supabase } from './supabase';
import { updateAiMemory } from './profileService';
import type { MealEntry, DailyMacroTotals } from './mealLog';

/** Soft cap on persistent memory length. The distillation prompt asks Claude
 *  to stay under this; we also hard-trim on write as a safety net. */
export const AI_MEMORY_MAX_CHARS = 1500;

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
const CACHE_READ_COST_PER_MILLION = 0.3; // $0.30 per million cached read tokens
const CACHE_WRITE_COST_PER_MILLION = 3.75; // $3.75 per million cache write tokens

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheCreationTokens: number = 0,
): number {
  // Cache-read tokens are NOT counted in input_tokens by the API,
  // so we cost them separately at the discounted rate.
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION +
    (cacheReadTokens / 1_000_000) * CACHE_READ_COST_PER_MILLION +
    (cacheCreationTokens / 1_000_000) * CACHE_WRITE_COST_PER_MILLION
  );
}

async function logAiUsage(params: {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  toolsUsed?: string[];
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cacheRead = params.cacheReadTokens ?? 0;
    const cacheCreation = params.cacheCreationTokens ?? 0;
    const totalTokens = params.tokensInput + params.tokensOutput + cacheRead;
    const cost = estimateCost(params.tokensInput, params.tokensOutput, cacheRead, cacheCreation);

    if (cacheRead > 0 || cacheCreation > 0) {
      console.log(`[AI Cache] read=${cacheRead} creation=${cacheCreation} input=${params.tokensInput} output=${params.tokensOutput}`);
    }

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
 *
 * Any failure (including 429 rate limits) is logged via `logAiUsage` so future
 * regressions are observable — previously a silent catch hid these cases, which
 * allowed the summary to get stuck stale-and-huge on real-world installs.
 *
 * The returned string is hard-capped at `SUMMARY_MAX_CHARS`; the ChatContext
 * auto-clear flow uses the cap as a trigger threshold.
 */
export async function summarizeDroppedMessages(
  droppedMessages: ChatMessage[],
  existingSummary: string | null,
  apiKey: string,
): Promise<string> {
  const startTime = Date.now();
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
        system: [{ type: 'text', text: 'You are a summarization assistant. Produce only the summary, nothing else.', cache_control: { type: 'ephemeral' } }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          ...ANTHROPIC_HEADERS,
        },
        timeout: 30000,
      },
    );
    const { usage } = response.data;
    const block = response.data.content?.[0];
    let result = block?.type === 'text' ? block.text : existingSummary ?? '';
    if (result.length > SUMMARY_MAX_CHARS) {
      // Keep the most recent half — the distillation step will fold the rest into ai_memory.
      result = result.slice(-SUMMARY_MAX_CHARS);
    }
    logAiUsage({
      model: CLAUDE_MODEL,
      tokensInput: usage?.input_tokens ?? 0,
      tokensOutput: usage?.output_tokens ?? 0,
      cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - startTime,
      success: true,
      toolsUsed: ['summarize'],
    });
    return result;
  } catch (error: any) {
    console.error('[AI] Summarization failed, keeping prior summary', error?.message ?? error);
    const apiError = error?.response?.data;
    const apiErrorDetail = apiError?.error?.message || apiError?.error?.type;
    const errorMsg = error?.response?.status === 429
      ? 'rate_limited_during_summarize'
      : (apiErrorDetail
          ? `${error?.message || 'API error'} — ${apiErrorDetail}`
          : (error?.message || 'unknown'));
    logAiUsage({
      model: CLAUDE_MODEL,
      tokensInput: 0,
      tokensOutput: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: Date.now() - startTime,
      success: false,
      errorMessage: errorMsg,
      toolsUsed: ['summarize'],
    });
    return existingSummary ?? '';
  }
}

/**
 * Distill persistent facts about the user from the current chat context and
 * merge them into the user's long-lived `ai_memory`. Called by ChatContext
 * just before auto-clearing chat history, so personalization survives clears.
 *
 * Returns the new memory string (also persisted to Supabase).
 */
export async function extractAndStoreMemory(params: {
  currentMemory: string;
  summary: string | null;
  recentMessages: ChatMessage[];
  apiKey: string;
}): Promise<string> {
  const { currentMemory, summary, recentMessages, apiKey } = params;
  const startTime = Date.now();

  const transcript = recentMessages
    .slice(-20)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 400)}`)
    .join('\n');

  const userContent = [
    'Existing memory about this user (may be empty):',
    '---',
    currentMemory || '(none yet)',
    '---',
    '',
    'Recent conversation summary (may be empty):',
    '---',
    summary || '(none)',
    '---',
    '',
    'Recent verbatim messages (last 20):',
    '---',
    transcript || '(none)',
    '---',
    '',
    `Produce an UPDATED memory string under ${AI_MEMORY_MAX_CHARS} characters.`,
    'Rules:',
    '1. Preserve hard constraints VERBATIM (allergies, intolerances, medical conditions, explicit goal macros).',
    '2. Merge — do NOT duplicate facts that already appear in existing memory.',
    '3. Drop day-to-day chatter (what they ate Tuesday, one-off questions). Keep durable traits: goals, preferred cuisines, disliked foods, training schedule, work schedule, meal-prep habits, family context, nicknames they go by, tone preferences.',
    '4. Use compact bullet points, one fact per line, no preamble.',
    '5. If nothing new to add, return the existing memory unchanged.',
    'Return ONLY the memory string — no headers, no markdown code fences, no commentary.',
  ].join('\n');

  const systemPrompt =
    "You are a memory distillation assistant for a nutrition coaching app. You turn chat history into a compact, durable profile of the user. Be faithful — never invent facts.";

  try {
    const response = await withRetry(() =>
      axios.post(
        API_URL,
        {
          model: CLAUDE_MODEL,
          max_tokens: 500,
          messages: [{ role: 'user', content: userContent }],
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            ...ANTHROPIC_HEADERS,
          },
          timeout: 30000,
        },
      ),
    );

    const { usage } = response.data;
    const block = response.data.content?.[0];
    let memory = block?.type === 'text' ? block.text.trim() : currentMemory;
    if (memory.length > AI_MEMORY_MAX_CHARS) {
      memory = memory.slice(0, AI_MEMORY_MAX_CHARS);
    }

    logAiUsage({
      model: CLAUDE_MODEL,
      tokensInput: usage?.input_tokens ?? 0,
      tokensOutput: usage?.output_tokens ?? 0,
      cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - startTime,
      success: true,
      toolsUsed: ['memory_distill'],
    });

    await updateAiMemory(memory);
    return memory;
  } catch (error: any) {
    console.error('[AI] Memory extraction failed, keeping prior memory', error?.message ?? error);
    const apiError = error?.response?.data;
    const apiErrorDetail = apiError?.error?.message || apiError?.error?.type;
    const errorMsg = error?.response?.status === 429
      ? 'rate_limited_during_memory_distill'
      : (apiErrorDetail
          ? `${error?.message || 'API error'} — ${apiErrorDetail}`
          : (error?.message || 'unknown'));
    logAiUsage({
      model: CLAUDE_MODEL,
      tokensInput: 0,
      tokensOutput: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: Date.now() - startTime,
      success: false,
      errorMessage: errorMsg,
      toolsUsed: ['memory_distill'],
    });
    return currentMemory;
  }
}

// ── Core API call ─────────────────────────────────────────────────────

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';

const MAX_TOOL_ROUNDS = 3;

// ── Prompt caching headers ──────────────────────────────────────────

const ANTHROPIC_HEADERS = {
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'prompt-caching-2024-07-31',
  'Content-Type': 'application/json',
};

// ── Intent classification for dynamic tool selection ─────────────────

export type ToolIntent = 'meal_log' | 'data_query' | 'meal_suggestion' | 'general';

const MEAL_LOG_PATTERNS = /\b(i\s+(had|ate|just ate|just had|grabbed|made|cooked|prepared|drank|got)|for\s+(breakfast|lunch|dinner|snack)|here'?s\s+what\s+i|log\s+(this|that|my|a)|eating|ordered)\b/i;
const DATA_QUERY_PATTERNS = /\b(how\s+much|how\s+many|this\s+week|last\s+week|this\s+month|today'?s?\s+(total|intake|calories)|yesterday|progress|trend|weight|adherence|average|summary|total|history|stats|all\s+time|ever)\b/i;
const SUGGESTION_PATTERNS = /\b(what\s+should\s+i\s+eat|suggest|recommend|meal\s+plan|recipe|what\s+can\s+i|idea|option|remaining|still\s+need|left\s+to\s+eat)\b/i;

export function classifyIntent(message: string, hasImage: boolean): ToolIntent {
  if (hasImage) return 'meal_log';
  if (MEAL_LOG_PATTERNS.test(message)) return 'meal_log';
  if (DATA_QUERY_PATTERNS.test(message)) return 'data_query';
  if (SUGGESTION_PATTERNS.test(message)) return 'meal_suggestion';
  return 'general';
}

/** Add cache_control to the last tool so all tool definitions are cached together. */
function addCacheControlToTools(tools: ToolDefinition[]): (ToolDefinition & { cache_control?: { type: string } })[] {
  if (tools.length === 0) return tools;
  return tools.map((t, i) =>
    i === tools.length - 1
      ? { ...t, cache_control: { type: 'ephemeral' } }
      : t,
  );
}

/** Build system prompt blocks with cache_control for prompt caching.
 *  The static portion (instructions) is cached; the dynamic portion (user data) is not. */
export function buildSystemBlocks(
  staticPrompt: string,
  dynamicContext: string,
): { type: 'text'; text: string; cache_control?: { type: string } }[] {
  const blocks: { type: 'text'; text: string; cache_control?: { type: string } }[] = [];
  if (staticPrompt.trim()) {
    blocks.push({ type: 'text', text: staticPrompt.trim(), cache_control: { type: 'ephemeral' } });
  }
  if (dynamicContext.trim()) {
    blocks.push({ type: 'text', text: dynamicContext.trim() });
  }
  return blocks;
}

/** Send a chat-style request to the Anthropic Messages API and return the text response.
 *  Handles tool_use responses automatically by executing the requested function and
 *  continuing the conversation until Claude produces a final text response.
 *
 *  Uses prompt caching to reduce rate limit impact — cached tokens are excluded from
 *  Anthropic's input token rate limit. */
export async function sendMessageToClaude(
  messages: ChatMessage[],
  apiKey?: string | null,
  systemPrompt?: string | null,
  /** Pass separate static/dynamic system prompt blocks for prompt caching. */
  systemBlocks?: { type: 'text'; text: string; cache_control?: { type: string } }[] | null,
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      'No Claude API key provided. Please add your API key in the Profile screen.',
    );
  }

  if (!apiKey.startsWith('sk-ant-')) {
    throw new Error(
      'Invalid Claude API key format. Keys should start with "sk-ant-". Please check your API key in the Profile screen.',
    );
  }

  const startTime = Date.now();
  const hasImage = messages.some(m => m.imageBase64);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreationTokens = 0;
  const allToolsUsed: string[] = [];

  // Classify intent from the last user message for dynamic tool selection
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const intent = classifyIntent(lastUserMsg?.content ?? '', hasImage);
  const selectedTools = addCacheControlToTools(getToolsForIntent(intent));

  console.log(`[AI Intent] "${intent}" → ${selectedTools.length} tools (was ${TOOL_DEFINITIONS.length})`);

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
    ...ANTHROPIC_HEADERS,
  };

  const axiosOpts = { headers, maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 60000 };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    try {
      const body: Record<string, unknown> = {
        model: CLAUDE_MODEL,
        max_tokens: hasImage ? 4096 : 2048,
        messages: apiMessages,
      };
      if (selectedTools.length > 0) {
        body.tools = selectedTools;
      }

      // Use block-format system prompt for caching when available
      if (systemBlocks && systemBlocks.length > 0) {
        body.system = systemBlocks;
      } else if (systemPrompt?.trim()) {
        // Fallback: wrap plain string in a cacheable block
        body.system = [{ type: 'text', text: systemPrompt.trim(), cache_control: { type: 'ephemeral' } }];
      }

      const response = await withRetry(() => axios.post(API_URL, body, axiosOpts));
      const { content, stop_reason, usage } = response.data;

      if (usage) {
        totalInputTokens += usage.input_tokens ?? 0;
        totalOutputTokens += usage.output_tokens ?? 0;
        totalCacheReadTokens += usage.cache_read_input_tokens ?? 0;
        totalCacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
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
          cacheReadTokens: totalCacheReadTokens,
          cacheCreationTokens: totalCacheCreationTokens,
          latencyMs: Date.now() - startTime,
          success: true,
          toolsUsed: allToolsUsed,
        });

        return result;
      }

      // Token budget check between tool rounds to prevent runaway consumption
      if (totalInputTokens > 20_000) {
        console.warn(`[AI] Token budget exceeded after round ${round} (${totalInputTokens} input tokens). Forcing text response.`);
        const textParts = (content as ContentBlock[])
          .filter((b): b is TextBlock => b.type === 'text')
          .map(b => b.text);
        const result = textParts.join('\n') || "I wasn't able to complete that request within the token budget. Please try again with a shorter message.";

        logAiUsage({
          model: CLAUDE_MODEL,
          tokensInput: totalInputTokens,
          tokensOutput: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cacheCreationTokens: totalCacheCreationTokens,
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
          cacheReadTokens: totalCacheReadTokens,
          cacheCreationTokens: totalCacheCreationTokens,
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

      const apiErrorDetail = apiError?.error?.message || apiError?.error?.type;
      const errorMsg = apiErrorDetail
        ? `${error?.message || 'API error'} — ${apiErrorDetail}`
        : (error?.message || 'Unknown error');

      logAiUsage({
        model: CLAUDE_MODEL,
        tokensInput: totalInputTokens,
        tokensOutput: totalOutputTokens,
        cacheReadTokens: totalCacheReadTokens,
        cacheCreationTokens: totalCacheCreationTokens,
        latencyMs: Date.now() - startTime,
        success: false,
        errorMessage: errorMsg,
        toolsUsed: allToolsUsed,
      });

      throw error;
    }
  }

  logAiUsage({
    model: CLAUDE_MODEL,
    tokensInput: totalInputTokens,
    tokensOutput: totalOutputTokens,
    cacheReadTokens: totalCacheReadTokens,
    cacheCreationTokens: totalCacheCreationTokens,
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

/** Extract ALL structured meal data blocks from the text. */
export function parseAllMealData(text: string): MealData[] {
  const results: MealData[] = [];
  let searchFrom = 0;
  while (true) {
    const start = text.indexOf(MEAL_START, searchFrom);
    const end = text.indexOf(MEAL_END, start + 1);
    if (start === -1 || end === -1 || end <= start) break;
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
        results.push({
          name: data.name,
          calories: Math.round(data.calories),
          protein: Math.round(data.protein),
          carbs: Math.round(data.carbs),
          fat: Math.round(data.fat),
        });
      }
    } catch { /* skip malformed */ }
    searchFrom = end + MEAL_END.length;
  }
  return results;
}

/** Remove `[MEAL_DATA]…[/MEAL_DATA]` markers so the user sees clean text. */
export function stripMealMarkers(text: string): string {
  return text.replace(/\[MEAL_DATA\][\s\S]*?\[\/MEAL_DATA\]/g, '').trim();
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

/** Extract ALL save-meal suggestions from the text. */
export function parseAllSaveMealSuggestions(text: string): MealData[] {
  const results: MealData[] = [];
  let searchFrom = 0;
  while (true) {
    const start = text.indexOf(SAVE_MEAL_START, searchFrom);
    const end = text.indexOf(SAVE_MEAL_END, start + 1);
    if (start === -1 || end === -1 || end <= start) break;
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
        results.push({
          name: data.name,
          calories: Math.round(data.calories),
          protein: Math.round(data.protein),
          carbs: Math.round(data.carbs),
          fat: Math.round(data.fat),
        });
      }
    } catch { /* skip malformed */ }
    searchFrom = end + SAVE_MEAL_END.length;
  }
  return results;
}

/** Remove `[SAVE_MEAL]…[/SAVE_MEAL]` markers so the user sees clean text. */
export function stripSaveMealMarkers(text: string): string {
  return text.replace(/\[SAVE_MEAL\][\s\S]*?\[\/SAVE_MEAL\]/g, '').trim();
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

/** Build the STATIC portion of the system prompt — instructions that rarely change.
 *  This part is cached via Anthropic's prompt caching to avoid counting against rate limits. */
export function buildStaticSystemPrompt(): string {
  return [
    "You are the same NoomiBodi coach who created this user's plan. You have the following context about them.",
    '',
    'When the user asks to change their plan, update it based on this context and their request.',
    'When you output a NEW or REVISED plan, wrap ONLY the exact plan text between [PLAN_START] and [PLAN_END] markers on their own lines, so the app can save it automatically.',
    '',
    '**Meal logging instructions**',
    'Whenever you estimate or describe the nutritional content of a specific meal (whether from an image or conversation), include a JSON block wrapped in markers so the app can offer to log it:',
    '[MEAL_DATA]{"name":"Meal Name","calories":000,"protein":00,"carbs":00,"fat":00}[/MEAL_DATA]',
    'Always include this block when you give a nutritional breakdown for a meal. The values should be your best estimates in whole numbers (calories in kcal, macros in grams).',
    'IMPORTANT: When the user tells you they ate something or describes a meal they had, ALWAYS include a [MEAL_DATA] block with your best estimate so they can log it immediately. Do NOT ask "would you like me to log that?" — just provide the data block. The app will show a Log button.',
    'If the user mentions a meal they eat regularly or that you recognize from earlier in the conversation, proactively offer to log it with the estimated nutritional content.',
    'You may include MULTIPLE [MEAL_DATA] blocks in a single response if the user describes multiple meals or you are suggesting several options.',
    '',
    '**Saved meals instructions**',
    'If you notice the user has logged or mentioned the same meal multiple times during the conversation, or they explicitly say they eat something regularly, suggest saving it to their meal library by including:',
    '[SAVE_MEAL]{"name":"Meal Name","calories":000,"protein":00,"carbs":00,"fat":00}[/SAVE_MEAL]',
    'The app will show a "Save to Meals" button so they can quick-add it in the future. Only suggest this when a meal clearly appears to be a regular/favourite — do not suggest it for every single meal.',
    '',
    '**Data tools — CRITICAL date rules**',
    'You have tools that query the database. Every tool result includes a "today_is" field — ALWAYS cross-check it against the dates in the result.',
    '',
    'RULES:',
    '- When the user says "today" they mean TODAY_DATE (provided in the dynamic context below). Pass exactly that string to any date parameter.',
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
    "IMPORTANT: You already have today's complete meal data and running totals in the dynamic context below. Do NOT call get_daily_totals for today's date — that data is already provided. Only use get_daily_totals when the user asks about a DIFFERENT date.",
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
  ].join('\n');
}

/** Build the DYNAMIC portion of the system prompt — user-specific data that changes per request.
 *  This part is NOT cached since it includes real-time data. */
export function buildDynamicContext(
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

  const goals = estimateDailyGoals(profile);

  const lines = [
    `**Current date & time**: ${dateStr}, ${timeStr}`,
    'CRITICAL: The date and time above are authoritative and always accurate. NEVER infer the current time or date from conversation history. Each turn uses fresh, real-time data from the app.',
    '',
    `TODAY_DATE = ${toLocalDateString(now)} (this is the user's local date right now).`,
    '',
    '**Profile**',
    `Gender: ${profile.gender}, Age: ${profile.age}, Height: ${heightImperial}, Current weight: ${weightLbs} lb`,
    `Goal: ${profile.goal} weight${targetLbs ? `, Target weight: ${targetLbs} lb` : ''}`,
    `Activity level: ${profile.activityLevel}`,
    '',
    '**Daily Targets (source of truth — NEVER deviate from these numbers)**',
    `Calories: ${goals.calories} cal, Protein: ${goals.protein}g, Carbs: ${goals.carbs}g, Fat: ${goals.fat}g`,
  ];

  if (profile.aiMemory && profile.aiMemory.trim()) {
    lines.push(
      '',
      '**What Noomi remembers about you** (persistent — survives chat clears)',
      profile.aiMemory.trim(),
      '',
      'Treat these as durable facts. Respect allergies/restrictions without needing to be reminded.',
    );
  }

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

  return lines.join('\n');
}

/** Build a context-aware system prompt for the chat screen.
 *  @deprecated Use buildStaticSystemPrompt() + buildDynamicContext() with buildSystemBlocks() for prompt caching. */
export function buildChatSystemPrompt(
  profile: UserProfile | null,
  daily?: DailyContext | null,
): string {
  if (!profile) return '';
  const staticPart = buildStaticSystemPrompt();
  const dynamicPart = buildDynamicContext(profile, daily);
  return staticPart + '\n\n' + dynamicPart;
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
          ...ANTHROPIC_HEADERS,
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
    const apiError = error?.response?.data;
    const apiErrorDetail = apiError?.error?.message || apiError?.error?.type;
    const errorMsg = apiErrorDetail
      ? `${error?.message || 'API error'} — ${apiErrorDetail}`
      : (error?.message || 'Unknown error');

    logAiUsage({
      model: CLAUDE_MODEL,
      tokensInput: 0,
      tokensOutput: 0,
      latencyMs: Date.now() - startTime,
      success: false,
      errorMessage: errorMsg,
    });
    throw error;
  }
}
