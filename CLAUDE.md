# NoomiBodi

AI-powered nutrition tracking app built with React Native (TypeScript), Supabase backend, and Claude API.

## Quick Reference

- **Version**: 1.0.5
- **Node**: >= 22.11.0
- **Run dev**: `npm start` (or `npm run start:prod` for production env)
- **Run iOS**: `npx react-native run-ios` (or `npm run ios:prod`)
- **Run Android**: `npx react-native run-android`
- **Lint**: `npm run lint`
- **Test**: `npm test`
- **Postinstall**: `npx patch-package` (runs automatically)
- **Environment switching**: `APP_ENV=production react-native start --reset-cache`
- **Changelog**: `CHANGELOG.md` — update for each version

## Architecture

React Native 0.84 app with flat swipeable pager navigation (`createMaterialTopTabNavigator`). Supabase for auth, database (PostgreSQL + RLS), and storage. Claude Sonnet 4.6 for AI chat and nutrition insights. Firebase Cloud Messaging for push notifications. WidgetKit (Swift) for iOS widgets.

### Key Directories

- `src/screens/` — app screens (QuickLogPage, ChatScreen, MealsScreen, etc.)
- `src/services/` — business logic and API integrations (claude.ts, mealLog.ts, storage.ts, etc.)
- `src/components/` — reusable UI components
- `src/contexts/` — React contexts (Auth, Theme, Impersonation, Chat)
- `src/hooks/` — custom hooks (useAsyncData, useStaleFetch, useDayChange, etc.)
- `src/utils/` — utilities (errorMessages, retry, profanityFilter)
- `ios/NoomiBodi Widget/` — native WidgetKit extension (Swift)
- `supabase/migrations/` — database migrations
- `docs/` — database schema, deployment guide, roles, feature designs

## Claude API Integration

### Prompt Caching (v1.0.5+)

All Anthropic API calls use the `anthropic-beta: prompt-caching-2024-07-31` header. Cached tokens are excluded from rate limits.

- **System prompt** is split into two parts in `claude.ts`:
  - `buildStaticSystemPrompt()` — instructions, tool docs, meal logging rules. Cached via `cache_control: { type: 'ephemeral' }`.
  - `buildDynamicContext(profile, daily)` — real-time user data (date/time, profile, daily macros, food log). Not cached.
  - `buildSystemBlocks()` — assembles both into the block format the API expects.
- **Tool definitions** get `cache_control` on the last tool in the array so all are cached together.
- **Legacy** `buildChatSystemPrompt()` still exists (returns combined string) but is deprecated. Use the split functions with `buildSystemBlocks()`.

### Dynamic Tool Selection (v1.0.5+)

Not all 13 tools are sent with every request. `classifyIntent(message, hasImage)` in `claude.ts` classifies user messages into intents:

| Intent | Trigger | Tools Sent |
|--------|---------|------------|
| `meal_log` | Image attached, or "I had/ate..." patterns | 1 (get_remaining_macros) |
| `meal_suggestion` | "what should I eat", "suggest", "recommend" | 3 (remaining_macros, frequent_meals, saved_meals) |
| `data_query` | "how much", "this week", "progress", etc. | 11 (all data tools) |
| `general` | Default / unclear intent | 13 (all tools) |

`getToolsForIntent(intent)` in `claudeTools.ts` returns the filtered tool array.

### Rate Limit Handling

Anthropic Tier 1: 30k input tokens/min, 50 requests/min. The app is optimized for this:

- **Retry logic** (`src/utils/retry.ts`): 429 errors use `retry-after` header (min 5s, max 60s, max 1 retry). 5xx errors use exponential backoff (max 2 retries).
- **MAX_TOOL_ROUNDS = 3** (reduced from 5). Token budget check (20k) between rounds.
- **Intent-based tool selection** reduces token payload for simple interactions.

### Response Markers

Claude response markers parsed by the app:
- `[MEAL_DATA]{"name":"...","calories":0,"protein":0,"carbs":0,"fat":0}[/MEAL_DATA]`
- `[SAVE_MEAL]{"name":"...","calories":0,"protein":0,"carbs":0,"fat":0}[/SAVE_MEAL]`
- `[PLAN_START]...[PLAN_END]`

## Conventions

- TypeScript strict mode, functional components only
- Styles via `StyleSheet.create` at bottom of file; theme colors applied inline `{ color: colors.text }`
- For separate style files: `createStyles(colors: ThemeColors, isDark: boolean)` pattern with `useMemo`
- Card styling: `colors.surface` bg, `colors.border` border, `borderRadius: 14`
- All modals use `BottomSheet` wrapper (tap/drag dismiss, dark backdrop)
- Skeleton loaders for initial load (not ActivityIndicator), `RefreshControl` for pull-to-refresh
- All user-facing errors go through `getUserFriendlyError()` — never show raw errors
- Tab-switching uses `useStaleFetch` to avoid redundant re-fetches; all tabs also fetch on mount (not just on focus)
- Accent color is purple `#7C3AED` (`colors.accent`) — never use green `#4CAF50`
- Noomi (purple phoenix mascot) avatar appears wherever AI persona is represented

### Context Providers (wrap order in App.tsx)

`ThemeProvider` → `AuthProvider` → `ImpersonationProvider` → `ChatProvider` → `AppInner`

- **ChatContext** (`src/contexts/ChatContext.tsx`): Holds chat messages, apiKey, profile, conversationSummary. Loads once on mount, persists across navigation. ChatScreen reads from this context — it does NOT remount or re-fetch on every navigation.

### Data Loading Pattern

All tab screens use `useStaleFetch` + two `useEffect` hooks:
1. `useEffect(() => { fetchIfStale(); }, [])` — fetch on mount (so data is ready before user navigates)
2. `useEffect(() => { if (isFocused) fetchIfStale(); }, [isFocused])` — re-fetch on focus if stale

All tab data fetches are **Supabase queries only** (no Claude API calls on mount). Safe to preload.

## Database

Supabase with RLS. Key tables: `profiles`, `public_profiles`, `user_plans`, `saved_meals`, `daily_logs`, `weight_logs`, `user_insights`, `ai_usage_logs`, `friendships`, `activity_feed`, `shared_meals`, `device_tokens`, `feedback`.

See `docs/database_schema.md` for full schema, `docs/roles.md` for role details.

## Sensitive Files (gitignored — never commit)

- `.env`, `.env.local`, `.env.*.local`
- `ios/GoogleService-Info.plist`
- `supabase/.temp/`
- `src/utils/testAccounts.ts`, `docs/seed_test_accounts.sql`

## Open Feedback Items (as of v1.0.5)

Tracked in the `feedback` table. Key unresolved items:
- **Chat photo display** (#5): Upload works but image shows empty space in chat bubble
- **Push notifications** (#8): Friend request notifications not being received
- **Weight input UX** (#7): Keyboard doesn't lock to field, floating dome button
- **Feature requests**: Lock screen widget calories remaining, complex/flexible plans, saved ingredients library
- See SQL: `SELECT * FROM feedback WHERE status NOT IN ('closed', 'resolved') ORDER BY created_at DESC`
