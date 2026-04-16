# Changelog

All notable changes to NoomiBodi will be documented in this file.

## [1.0.7] - 2026-04-16

### Bug Fixes
- **Chat state bloat (rate-limit cascade on long-lived installs)**: v1.0.6 fixed the meal-log tool-cascade on fresh simulators, but installs that had been accumulating chat state since v1.0.4 still sent 24–27k tokens per request and hit rate limits. Root cause was a combination of unbounded conversation-summary growth and a silent catch in `summarizeDroppedMessages` that hid rate-limit failures, letting stale huge summaries stick around indefinitely.

### Added
- **Persistent AI memory layer (`profiles.ai_memory`)**: Noomi now distills durable facts (goals, allergies, preferred cuisines, patterns) into a 1500-char memory that survives chat clears. Injected into every system prompt as "What Noomi remembers about you."
- **Automatic chat clearing**: Hybrid trigger — fires when any of: > 40 messages, > 2000-char summary, or > 7 days since last clear. Before clearing, a dedicated Claude call distills the chat into persistent memory so personalization is preserved.
- **Settings → Chat & Memory section**: Read-only view of what Noomi remembers. Two buttons: "Clear chat history" (keeps memory) and "Forget everything" (wipes both).
- **Post-clear banner in chat**: One-tap-to-dismiss notice after an auto-clear, explaining what happened and reassuring the user their profile + memory are intact.
- **Supabase migration**: `profiles.ai_memory TEXT NOT NULL DEFAULT ''` + `ai_memory_updated_at TIMESTAMPTZ`. Protected by existing `auth.uid() = id` RLS; never exposed via `public_profiles`.

### Internal
- **Silent-catch fix in `summarizeDroppedMessages`**: Failures now log via `logAiUsage` with `success=false` and a categorized `errorMessage` (e.g. `rate_limited_during_summarize`). Without this, stuck-summary regressions couldn't be diagnosed from admin logs.
- **Hard cap on conversation summary**: `SUMMARY_MAX_CHARS = 2000` enforced on every write. Anything over gets trimmed to the most recent half before persistence.
- New `extractAndStoreMemory()` in `services/claude.ts` — single Claude call, max 500 output tokens, prompt-cached static system, routed through `withRetry`. Writes via `profileService.updateAiMemory()`.
- New `ChatContext.evaluateAutoClear()` runs on app mount and after every send. Memory extraction runs in the background so the UI isn't blocked.

## [1.0.6] - 2026-04-16

### Bug Fixes
- **Chat meal logging rate limit errors**: Fixed a cascade where logging a meal would trigger unnecessary tool_use rounds, exhaust the 20k token budget, and produce a misleading "Claude rate limit reached" error while admin logs showed the call as successful.
  - `meal_log` intent now sends **no tools** (was 1). The dynamic system context already includes daily targets, running totals, and the full food log — Claude can generate `[MEAL_DATA]` blocks directly without any tool calls.
  - The inter-round token budget guard now **always returns** when exceeded, with a graceful fallback message if no text was produced. Previously it would fall through when the response contained only tool_use blocks, triggering another API call.
  - The `tools` key is now omitted from the API request body when `selectedTools` is empty.

### Internal
- Adopted standard Semantic Versioning (`MAJOR.MINOR.PATCH`). Previous `1.0.5.1` was renamed to `1.0.6` to match iOS/Android native version format and be user-visible in TestFlight/App Store.
- Added `.claude/worktrees/` and `.claude/settings.local.json` to `.gitignore`.

## [1.0.5] - 2026-04-14

### Performance
- **Prompt caching**: Split system prompt into static (cached) and dynamic parts. Cached tokens are excluded from Anthropic's rate limit, dramatically reducing 429 errors during conversation.
- **Dynamic tool selection**: Chat requests now only include relevant tools based on message intent (e.g., meal logging sends 1 tool instead of 13), reducing token usage by ~1,000-1,500 tokens per request.
- **Reduced tool rounds**: Max tool rounds reduced from 5 to 3 with a 20k token budget check between rounds to prevent runaway consumption.
- **App-level data preloading**: All tab screens now fetch data on mount (not just on first focus), eliminating loading skeletons when navigating between tabs.

### Bug Fixes
- **Chat remounting**: Chat state is now held in a persistent `ChatContext` provider — navigating to and from the chat screen no longer remounts the component or shows a loading skeleton.
- **Rate limit retry logic**: 429 errors now respect the `retry-after` header (min 5s wait) with max 1 retry, instead of aggressively retrying after 1-2 seconds which compounded the rate limit problem.
- **Summarization caching**: The conversation summarization API call now uses prompt caching headers, reducing its impact on rate limits.

### Internal
- Added `anthropic-beta: prompt-caching-2024-07-31` header to all Anthropic API call sites (chat, insights, API key validation).
- New `ChatContext` (`src/contexts/ChatContext.tsx`) manages chat state at the app level.
- New `getToolsForIntent()` and `classifyIntent()` functions for dynamic tool selection.
- Updated cost estimation to account for cache read/write token pricing.
- Version bumped to 1.0.5.

## [1.0.4] - 2026-04-12

_No changelog maintained for this version and earlier. See git history for details._
