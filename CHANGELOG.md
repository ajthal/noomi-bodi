# Changelog

All notable changes to NoomiBodi will be documented in this file.

## [1.0.5.1] - 2026-04-16

### Bug Fixes
- **Chat meal logging rate limit errors**: Fixed a cascade where logging a meal would trigger unnecessary tool_use rounds, exhaust the 20k token budget, and produce a misleading "Claude rate limit reached" error while admin logs showed the call as successful.
  - `meal_log` intent now sends **no tools** (was 1). The dynamic system context already includes daily targets, running totals, and the full food log — Claude can generate `[MEAL_DATA]` blocks directly without any tool calls.
  - The inter-round token budget guard now **always returns** when exceeded, with a graceful fallback message if no text was produced. Previously it would fall through when the response contained only tool_use blocks, triggering another API call.
  - The `tools` key is now omitted from the API request body when `selectedTools` is empty.

### Internal
- Added `.claude/worktrees/` and `.claude/settings.local.json` to `.gitignore`.
- Version bumped to 1.0.5.1 (hotfix).

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
