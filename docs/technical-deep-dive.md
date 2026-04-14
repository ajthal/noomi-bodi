# NoomiBodi — Technical Deep Dive

## Executive Summary

NoomiBodi is an AI-powered mobile nutrition tracking application that replaces manual food logging with conversational AI. Users photograph meals or describe them in natural language, and the AI estimates calories, macronutrients, and provides personalized coaching. The app is built on a modern mobile stack — React Native 0.84 with TypeScript, Supabase (PostgreSQL + Row-Level Security), Claude Sonnet 4.6 for AI, Firebase Cloud Messaging for push notifications, and a native WidgetKit extension for iOS home/lock screen integration.

**Current status:** Version 1.0.4, iOS TestFlight internal testing.

---

## 1. System Architecture

### 1.1 High-Level Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Mobile App | React Native 0.84, TypeScript, React 19 | Cross-platform UI (iOS primary) |
| AI Engine | Anthropic Claude Sonnet 4.6 | Meal analysis, coaching, plan generation, insights |
| Database | Supabase PostgreSQL 17 + RLS | User data, social graph, analytics |
| Auth | Supabase Auth (email, Apple, Google) | Identity, sessions, social sign-in |
| Storage | Supabase Storage (S3-compatible) | Profile pictures, feedback screenshots |
| Notifications | Firebase Cloud Messaging → APNs | Friend requests, shared meals, milestones |
| Edge Functions | Supabase Edge (Deno 2) | Server-side notification dispatch |
| Widgets | WidgetKit (Swift) | Home screen, lock screen, Control Center |
| Native Bridge | Objective-C (React Native Module) | App ↔ Widget data sharing via App Groups |

### 1.2 Data Flow Overview

```
User Action (photo/text)
    → React Native App
        → Claude API (meal analysis, 12 RAG tools for user data)
            → Supabase (persist meal log)
                → Widget Sync (App Group UserDefaults → WidgetKit reload)
                → Streak Check → Activity Feed → Push Notifications (Edge Function → FCM → APNs)
```

---

## 2. AI Integration — The Core Differentiator

### 2.1 Claude API Integration

The AI layer is the heart of NoomiBodi. It powers five capabilities:

1. **Meal Analysis** — Users send a photo or text description. Claude identifies foods, estimates portions, and returns structured nutrition data with calories, protein, carbs, and fat.
2. **Conversational Coaching** — Multi-turn chat with persistent context. The AI acts as "Noomi," a nutrition coach that knows the user's goals, history, and current day's intake.
3. **Plan Generation** — During onboarding, Claude creates a personalized nutrition plan based on the user's body stats, activity level, and goals (weight loss, gain, or maintenance).
4. **Insight Generation** — Weekly AI analysis across 7-day and 30-day windows, identifying adherence patterns, macro imbalances, and behavioral trends.
5. **Smart Recommendations** — Context-aware meal suggestions based on remaining macros for the day, user's saved meals library, and dietary preferences.

### 2.2 Context Window Management

Claude's context window is managed carefully to maintain conversation quality over long sessions:

- **Token Budget:** 150,000 tokens total, minus 8,000 reserved for the system prompt.
- **Estimation:** ~4 characters per token for text; ~1,600 tokens per image attachment.
- **Windowing:** `windowMessages()` trims the oldest messages when approaching the budget. The full chat history stays in the UI — only the API call is windowed.
- **Rolling Summary:** Trimmed messages are compressed into a rolling conversation summary via `summarizeDroppedMessages()`. This summary is injected into the system prompt so Claude retains awareness of earlier discussion topics.
- **Persistence:** The conversation summary persists to AsyncStorage (`@noomibodi_conversation_summary`), surviving app restarts.

### 2.3 System Prompt Engineering

Each API call includes a dynamically-built system prompt with:

- Authoritative date/time (prevents Claude from hallucinating dates)
- User profile (gender, age, height, weight, activity level, goals)
- Active nutrition plan text and explicit macro targets
- Today's food log with running calorie/macro totals
- Conversation summary from prior windowed messages
- Response format instructions (JSON markers for structured meal data)
- Tool usage guidelines (which RAG tools to use and when)

### 2.4 RAG Tool System (Function Calling)

Claude has access to 12 domain-specific tools that query the user's Supabase data in real-time:

| Tool | Purpose |
|------|---------|
| `get_daily_totals` | Calories/macros for a specific date |
| `get_meals_by_date_range` | All meals within a date range |
| `get_period_summary` | Aggregated daily breakdown (7d, 30d, all-time) |
| `calculate_adherence_rate` | % days within ±10% of calorie goal |
| `get_weight_trend` | Weight logs with first/last/change stats |
| `search_saved_meals` | Search meal library (case-insensitive) |
| `get_analytics` | Predictive analytics (goal projection, patterns, correlations) |
| `get_frequent_meals` | Most-logged meals ranked by count |
| `search_meals_by_macro` | Filter meals by macro range |
| `get_best_adherence_days` | Top days closest to calorie goal |
| `get_meal_history` | All instances of a specific meal name |
| `get_remaining_macros` | Today's macros left to hit goals |

Each tool response includes a `today_is` field so Claude compares dates against ground truth rather than its own date reasoning. The tool execution loop runs up to 5 rounds until Claude's `stop_reason` is no longer `tool_use`.

### 2.5 Response Parsing

Claude's responses contain structured markers that the app parses into actionable UI elements:

- `[MEAL_DATA]{...}[/MEAL_DATA]` — JSON nutrition data for a meal (supports multiple per response)
- `[SAVE_MEAL]{...}[/SAVE_MEAL]` — Suggestion to save a meal to the library
- `[PLAN_START]...[/PLAN_END]` — Updated nutrition plan text
- `[PORTION]...[/PORTION]` — Portion size guidance

Multi-meal support means a single Claude response like "I had eggs and a smoothie" generates two separate action cards, each with independent "Log Meal," "Edit & Log," and "Save to Library" buttons.

### 2.6 Cost Tracking & Usage Logging

Every Claude API call is logged to the `ai_usage_logs` table:

| Field | Purpose |
|-------|---------|
| `model` | Claude model used |
| `tokens_input` / `tokens_output` | Token consumption |
| `estimated_cost_usd` | Input: $3/M tokens, Output: $15/M tokens |
| `latency_ms` | Round-trip time |
| `success` | Boolean |
| `error_message` | Anthropic error detail on failure |
| `tools_used` | Which RAG tools were invoked |

The admin dashboard surfaces this data as charts, per-user breakdowns, tool usage distribution, monthly cost-per-user trends, and error logs.

### 2.7 Predictive Analytics

The `analytics.ts` service provides three ML-lite capabilities:

- **Weight Projection:** Linear regression on weight logs → estimated date to reach goal weight. Clamps weekly rate to physiological limits (±2 lbs/week loss, ±1.5 lbs/week gain). Confidence levels based on R² fit and data point count.
- **Day-of-Week Patterns:** Groups meals by weekday, computes average macros and adherence % per day. Surfaces via Claude tools for personalized advice ("Your Saturdays tend to be 400 calories over target").
- **Behavioral Correlations:** Detects patterns like weekday vs. weekend adherence gaps, high-protein days correlating with better calorie adherence, and meal count vs. adherence relationships.

---

## 3. Database Architecture

### 3.1 Schema Overview

Supabase PostgreSQL 17 with Row-Level Security (RLS) enforced on all 14 tables:

**Core Tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | Full user data (private) | username, display_name, bio, is_private, role, gender, age, height_cm, current_weight_kg, activity_level |
| `public_profiles` | Social lookups (synced subset) | username, display_name, profile_picture_url, bio, is_private |
| `user_plans` | Active nutrition plan | goal_type, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, plan_text, is_active |
| `saved_meals` | Personal meal library | meal_name, calories, protein_g, carbs_g, fat_g, image_url, notes |
| `daily_logs` | Individual meal entries | logged_at (TIMESTAMPTZ), meal_name, meal_type, calories, protein_g, carbs_g, fat_g, image_url |
| `weight_logs` | Weight tracking | weight_kg, logged_at (TIMESTAMPTZ) |
| `user_insights` | AI-generated insights | insight_type, title, description, priority, is_dismissed, valid_until |

**Social Tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `friendships` | Bidirectional friend graph | follower_id, following_id, status (pending/accepted/declined), accepted_at |
| `activity_feed` | Streak milestones | activity_type, activity_data (JSONB) |
| `shared_meals` | Meal sharing between friends | meal_id (FK → saved_meals), shared_by, shared_with, is_read, message |

**Infrastructure Tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ai_usage_logs` | Claude API telemetry | model, tokens, cost, latency, tools_used |
| `device_tokens` | FCM push tokens | fcm_token, platform, user_id |
| `feedback` | Bug reports & feature requests | category, title, description, screenshot_urls, device_info (JSONB), status |
| `meal_plans` | Multi-day meal planning | name, start_date, end_date, plan_data (JSONB) |

### 3.2 Privacy Architecture

Privacy is enforced at three layers:

1. **RLS Policies** — Every table has policies ensuring users only access their own data. Social tables use junction queries that verify friendship status AND privacy flags.
2. **Public Profile Sync** — The `public_profiles` table is a non-sensitive mirror of `profiles`, kept in sync by a `SECURITY DEFINER` trigger (`sync_public_profile()`). It deliberately excludes email, gender, age, height, weight, activity level, and role. All cross-user lookups query this table, never `profiles`.
3. **Privacy Toggle** — Users can set `is_private = true`, which hides their activity from the social feed, leaderboard, and friend profile views. RLS policies check this flag at the database level.

### 3.3 Server-Side Functions

| Function | Type | Purpose |
|----------|------|---------|
| `is_admin()` | SECURITY DEFINER | Checks `profiles.role = 'admin'`, used in admin RLS policies to avoid recursion |
| `sync_public_profile()` | SECURITY DEFINER Trigger | Fires AFTER INSERT/UPDATE/DELETE on `profiles`, upserts public columns to `public_profiles` |
| `claim_device_token(p_fcm_token)` | SECURITY DEFINER | Cleans stale FCM tokens when a device switches accounts |
| `get_friend_stats(p_friend_id)` | SECURITY DEFINER | Returns JSONB with friend's streak, adherence, plan, weight progress, average macros. Checks accepted friendship and non-private profile before returning data. |

### 3.4 Storage Buckets

| Bucket | Access | Structure |
|--------|--------|-----------|
| `profile-pictures` | Public read | `{user_id}/{timestamp}.jpg` |
| `feedback-screenshots` | Public read | `{user_id}/{timestamp}.jpg` |

Profile picture uploads auto-clean old versions, keeping only the latest.

---

## 4. Authentication & Identity

### 4.1 Auth Methods

| Method | Implementation | Notes |
|--------|---------------|-------|
| Email/Password | Supabase Auth | Standard flow with email verification |
| Apple Sign-In | `@invertase/react-native-apple-authentication` | Library auto-hashes nonce with SHA256; raw nonce passed to Supabase |
| Google Sign-In | `@react-native-google-signin/google-signin` | Custom patch via `patch-package` adds nonce support on iOS; SHA256 hashed nonce passed to Google, raw nonce to Supabase |

### 4.2 Identity Linking

Supabase automatic linking is enabled — the same email across Google, Apple, and email/password maps to one account. Users can sign up with email, then later sign in with Apple (same email), and they'll get the same account.

### 4.3 Session Management

- Sessions persist via `AsyncStorage` (Supabase JS client configured for React Native)
- Auto-refresh enabled (`autoRefreshToken: true`)
- `AuthContext` subscribes to `onAuthStateChange()` for real-time session events
- Sign-out unregisters FCM push token before clearing session
- Push token refresh handled via `onTokenRefresh` listener

### 4.4 Post-Auth Flow

The app manages five screen states: `loading → signIn → emailVerification → onboarding → main`.

- **Email/password signup** → Completes onboarding → Blocked by `EmailVerificationScreen` until `email_confirmed_at` is set (polls every 5 seconds)
- **Social sign-in** → Skips email verification → Enters onboarding or main app
- **Returning user sign-in** → Skips onboarding → Goes directly to main app
- **Profile reset** → Returns to onboarding (keeps auth session)

### 4.5 User Roles

| Role | Access | Assignment |
|------|--------|------------|
| `admin` | Full dashboard, impersonation, user management, feedback review | Manual |
| `beta` | Early access features | Manual |
| `pro` | Premium features (future) | Subscription |
| `standard` | Full app access | Default (server-assigned) |
| `byok` | Bring Your Own Key (Claude API key required) | Default (client fallback) |

---

## 5. Navigation Architecture

### 5.1 Flat Swipeable Pager

The app uses `createMaterialTopTabNavigator` (React Navigation 7) as a flat swipeable pager. All main screens are registered as individual tabs:

```
MainTabs (MaterialTopTabNavigator, swipeable)
├── Home (QuickLogPage)
├── MyMeals (MealsScreen)
├── SharedMeals (SharedMealsPage)
├── Reports (ReportsScreen)
├── Insights (InsightsPage)
├── Social (SocialScreen)
└── Admin (AdminDashboard) [conditional]
```

Navigation between tabs happens via swipe gestures or the bottom tab bar.

### 5.2 Tab Grouping

A `CustomBottomTabBar` groups pages into logical sections:

| Tab Group | Pages | Sub-navigation |
|-----------|-------|----------------|
| Home | QuickLogPage | — |
| Meals | MealsScreen, SharedMealsPage | SubTabBar with icon toggle |
| Reports | ReportsScreen, InsightsPage | SubTabBar with icon toggle |
| Social | SocialScreen | — |
| Admin | AdminDashboard | Conditional (admin role only) |

The `SubTabBar` is an icon-based segmented control that appears for multi-page tab groups. It includes badge support (e.g., unread shared meals count).

### 5.3 Pushable Stack Screens

On top of the tab pager, a `RootStack` (native stack navigator) presents modal-style screens:

- `ProfileScreen` — via TopBar profile picture
- `SettingsScreen` — via ProfileScreen gear icon
- `EditProfileScreen` — via ProfileScreen edit button
- `ChatScreen` — via TopBar chat bubble icon
- `FeedbackScreen` — via TopBar bug icon
- `FriendProfileScreen` — via friend card tap in Social

### 5.4 Deep Links

| URL | Action |
|-----|--------|
| `noomibodi://quick-log` | Navigate to Home tab |
| `noomibodi://add-photo` | Launch camera for meal logging |

Deep links are registered in `AppDelegate.swift` and handled by the `useDeepLink` hook in QuickLogPage. The medium home screen widget uses these links — the general tap area opens Quick Log, and the camera capsule opens the photo flow.

---

## 6. iOS Widget System

### 6.1 Widget Types

| Widget | Family | Display |
|--------|--------|---------|
| Home Screen Small | `systemSmall` | Calorie ring + consumed/goal text |
| Home Screen Medium | `systemMedium` | Calorie ring + protein/carbs/fat rows + camera button |
| Lock Screen Circular | `accessoryCircular` | Calorie ring with remaining calories |
| Lock Screen Rectangular | `accessoryRectangular` | Calories + protein/carbs/fat gauges |
| Control Center | Control widget | Timer toggle (placeholder) |
| Dynamic Island | Live Activity | Placeholder (not yet integrated) |

### 6.2 Data Pipeline

```
Meal Logged
    → daily_logs (Supabase)
    → syncWidgetData() fetches today's totals + goals
        → Uses local-timezone day boundaries (not UTC)
    → updateWidgetData() writes JSON to App Group UserDefaults
        → Suite: "group.noomibodi", Key: "widgetData"
        → Includes date field for staleness validation
    → reloadWidgets() triggers WidgetCenter.shared.reloadAllTimelines()
    → Widget reads widgetData, validates date = today
        → Stale data → shows placeholder
        → Fresh data → renders calorie ring + macros
```

**Sync call sites:** QuickLogPage (after meal log, weight log, offline sync), ChatScreen (after send/AI response), MealsScreen (after save), SmartRecommendations (after suggested meal log), offlineStore (after offline sync).

### 6.3 Timeline Strategy

- **Current entry:** `Date()` with today's nutrition data
- **Reset entry:** Scheduled at midnight with nil data (clears widget for the new day)
- **Refresh policy:** `.after(15 minutes)` — WidgetKit refreshes every 15 minutes
- **On-demand refresh:** App calls `reloadWidgets()` after any data change

### 6.4 Native Bridge

The `SharedGroupPreferences` Objective-C module exposes two methods to React Native:

```objc
- (void)set:(NSString *)suiteName key:(NSString *)key value:(id)data
    // → Writes JSON to NSUserDefaults(suiteName: "group.noomibodi")

- (void)reloadWidgets
    // → WidgetCenter.shared.reloadAllTimelines()
```

Platform-guarded in JavaScript: no-op on Android, graceful fallback if native module missing.

---

## 7. Push Notifications

### 7.1 Architecture

```
App Event (friend request, shared meal, streak milestone)
    → sendNotification(type, recipientId, data)
        → Supabase Edge Function: send-notification (Deno 2)
            → Validates caller JWT
            → Queries device_tokens for recipient
            → Generates Google OAuth2 token (service account JWT)
            → FCM HTTP v1 API → APNs → Device
```

### 7.2 Notification Types

| Type | Trigger | Recipients |
|------|---------|------------|
| `friend_request` | User sends friend request | Request recipient |
| `friend_accepted` | User accepts friend request | Original requester |
| `shared_meal` | User shares a meal | Meal recipient(s) |
| `streak_milestone` | User hits 3, 7, 14, 30, 60, 90, 120, 150, 180, or 365+ day streak | All accepted friends (excluding private profiles) |

### 7.3 Token Lifecycle

1. **Registration:** App launch → request permission → get FCM token → upsert to `device_tokens`
2. **Refresh:** `onTokenRefresh` listener → automatic re-registration
3. **Stale Cleanup:** `claim_device_token()` RPC deletes tokens for the same device belonging to a different user (handles device reuse across accounts)
4. **Sign-out:** Token deleted from `device_tokens` before session clear

### 7.4 Edge Function Security

- Gateway JWT verification is disabled (`--no-verify-jwt` on deploy)
- Function validates JWT internally using `supabase.auth.getUser()`
- Uses service role client for DB queries (bypasses RLS to look up recipient tokens)
- FCM service account credentials stored as Supabase secrets (never in app code)

---

## 8. Offline Support

### 8.1 Write Queue

When the user logs a meal or weight entry while offline, the operation is queued to AsyncStorage:

```
Network error detected
    → enqueueMealLog(data, imageBase64) or enqueueWeightLog(weightKg)
    → Pending item stored with ID format: pending-{timestamp}-{counter}
    → UI shows pending status indicator
```

### 8.2 Sync on Reconnect

```
Network restored (NetInfo event)
    → useOfflineSync() detects transition from offline → online
    → flushQueue() iterates pending items:
        - Success → remove from queue
        - Network error → keep in queue, retry next time
        - Auth error (401/403) → drop item (user must re-auth)
    → After successful sync → syncWidgetData() updates iOS widget
    → OfflineBanner shows "Back online" with animated slide-in
```

### 8.3 Read Cache

| Cache | Key | Expiration |
|-------|-----|------------|
| Today's meals | `@noomibodi_cache_meals` | Date-keyed (invalidated at midnight) |
| User profile | `@noomibodi_cache_profile` | None (always fresh on next fetch) |
| Saved meals | `@noomibodi_cache_saved_meals` | None |
| AI insights | `user_insights` table | 24 hours (`valid_until` timestamp) |

Screens fall back to cached data when network requests fail, showing stale data rather than empty states.

---

## 9. Social Features

### 9.1 Friend System

Bidirectional friendships stored in the `friendships` table:

- **Send request:** Creates row with `status: 'pending'`
- **Accept:** Updates to `status: 'accepted'`, sets `accepted_at`
- **Decline:** Deletes the row (RLS ensures only recipient can decline)
- **Remove:** Either party can delete an accepted friendship

Both directions are included in friend queries (symmetric). Status check queries both A→B and B→A to determine relationship state.

### 9.2 Activity Feed

Streak milestones are automatically recorded after each meal log:

1. `checkStreakMilestone()` runs after successful meal log
2. Computes current streak (consecutive days with ≥1 meal)
3. If streak matches a milestone threshold (3, 7, 14, 30, 60, 90, 120, 150, 180, 365+), records to `activity_feed`
4. Duplicate prevention: queries today's milestones before inserting
5. Sends push notifications to all accepted, non-private friends

### 9.3 Meal Sharing

- Users select a meal from their library → pick friends → add optional message → share
- Shared meals appear in the recipient's inbox with unread indicators
- Recipients can "Add to My Meals" (copies to their saved_meals with attribution note)
- RLS ensures: sender must own the meal, sender and recipient must be friends, only recipient can mark as read or delete

### 9.4 Weekly Leaderboard

Ranking algorithm:
1. Fetch all accepted friends (filter out private users)
2. For each user, count days in current Mon-Sun week where calories were within ±10% of goal
3. Adherence % = adherence days / 7 × 100
4. Sort by percentage descending, then days hit descending
5. Current user always included regardless of privacy setting

---

## 10. Frontend Architecture Patterns

### 10.1 Theming

`ThemeContext` provides light, dark, and system modes with 20+ color tokens:

```typescript
interface ThemeColors {
  background, surface, surfaceAlt, text, textSecondary, textTertiary,
  border, borderLight, inputBg, inputBorder, card,
  userBubble, assistantBubble,
  tabBarBg, tabBarBorder, tabBarActive, tabBarInactive, statusBar,
  accent: '#7C3AED',  // Purple (static)
  error: string       // Adapts per theme
}
```

Colors are applied inline (`{ color: colors.text }`), not in `StyleSheet.create`. For screens with separate style files, a `createStyles(colors, isDark)` factory pattern is used with `useMemo`.

Theme mode persists to AsyncStorage (`@noomibodi_theme_mode`). The context blocks rendering until the theme is loaded to prevent a flash of the wrong theme on launch.

### 10.2 Data Fetching

**`useAsyncData(fetcher, options?)`** — Generic hook that standardizes the loading/error/refresh pattern:

- Distinguishes `loading` (first load → skeleton) from `refreshing` (subsequent load → RefreshControl spinner)
- Prevents state updates on unmounted components via `mountedRef`
- Converts errors to user-friendly messages via `getUserFriendlyError()`

**`useStaleFetch(fetchFn, staleTimeMs)`** — Prevents redundant re-fetches on tab switches:

- `fetchIfStale()` — Only fetches if data is older than the stale time (15s–60s per screen)
- `forceFetch()` — Always fetches (used for pull-to-refresh)
- `markStale()` — Invalidates cache (used after mutations)

### 10.3 Error Handling

All errors flow through `getUserFriendlyError()`, which maps technical errors to human-readable messages:

| Source | Example | User Message |
|--------|---------|-------------|
| Network | `TypeError: Network request failed` | "Unable to connect. Check your internet connection and try again." |
| Supabase | PostgreSQL code `23505` | "This record already exists." |
| Claude | HTTP 401 | "Your Claude API key appears to be invalid." |
| Claude | HTTP 402 | "Your Claude API account is out of credits." |
| Claude | HTTP 429 | "Too many requests. Please wait a moment." |
| Auth | `refresh_token_not_found` | "Your session has expired. Please sign in again." |
| Fallback | (any unknown error) | "Something went wrong. Please try again." |

### 10.4 Retry Logic

`withRetry(fn, options?)` wraps async operations with exponential backoff:

- Default: 2 retries, 1000ms base delay
- Retries on: 429 (rate limit), 529 (overloaded), 5xx (server error)
- Backoff: `baseDelay × 2^attempt` → 1s, 2s, 4s
- Applied to Claude API calls and notification dispatch

### 10.5 Loading States

Every screen follows a consistent loading state pattern:

| State | UI | Component |
|-------|-----|-----------|
| Initial load | Animated shimmer placeholders | `SkeletonText`, `SkeletonCircle`, `SkeletonCard` |
| Pull-to-refresh | Spinner in scroll view header | `RefreshControl` |
| Fetch error | Error message + retry button | `ErrorState` (supports compact mode) |
| Empty data | Icon + title + subtitle + optional CTA | `EmptyState` (supports compact mode) |
| Async button | Button text replaced with spinner | `LoadingButton` |
| Offline | Animated slide-in banner | `OfflineBanner` |
| App crash | Fallback UI with "Try Again" | `ErrorBoundary` |

### 10.6 Modals

All modals use the `BottomSheet` component for consistent behavior:

- Spring animation on enter (friction: 9, tension: 65)
- Drag-to-dismiss with 100px threshold or 0.8 velocity
- Dark backdrop with fade animation
- `KeyboardAvoidingView` wrapper on iOS
- Safe area padding at bottom
- Max height: 88% of screen

Used by: AddFriendModal, FriendPickerModal, MealPickerModal, ImpersonateModal, UpdatePlanModal, SavedMealModal, EditMealModal, AIMealBuilderModal.

---

## 11. Key Screens

### 11.1 QuickLogPage (Home)

The primary screen. Displays today's meal log with daily calorie/macro progress, a weight tracking section with a 7-day chart, smart AI meal recommendations, and a floating action button for photo-based meal logging.

**Key engineering:**
- Image analysis sends photo to Claude with system prompt context
- 60-second timeout safety clears stuck analyzing states
- Widget sync after every meal log/delete
- Deep link support for widget camera button
- Day change detection triggers automatic refresh at midnight

### 11.2 ChatScreen

Multi-turn conversational interface with Claude. Supports text and image input, markdown rendering, quick action chips, and interactive meal action cards.

**Key engineering:**
- Context windowing with rolling summary
- Multi-meal parsing (separate action cards per `[MEAL_DATA]` block)
- Replace-meal flow (delete old log + re-log edited version)
- `ChatImage` fallback component for stale/broken image URIs
- AppState-aware background request handling (tracks loading state via ref)

### 11.3 OnboardingScreen

8-step wizard: API Key → Profile Info → Goals → Activity → Account → Username → Details → AI Plan.

**Key engineering:**
- AI plan generation via Claude with fallback to basic calculation (Mifflin-St Jeor BMR + activity multiplier)
- Macro extraction from natural language plan text via regex
- Social auth integration (Apple/Google) with nonce-based OAuth security
- Username availability checking with profanity filter

### 11.4 AdminDashboard

Admin-only analytics with AI usage metrics, cost tracking, tool usage breakdown, feedback management, user role management, and impersonation.

**Key engineering:**
- 11 different data types loaded in parallel
- Tool cost attribution (cost split across tools used in a single call)
- Monthly cost-per-user trend calculation
- DAU/WAU/MAU metrics from `ai_usage_logs`
- Feedback status workflow (new → reviewed → resolved → closed)

---

## 12. Security

### 12.1 Data Access

- **RLS-first:** Every database query respects Row-Level Security policies. Users can only access their own data unless explicitly shared.
- **Service role isolation:** Only the Edge Function uses the service role key (for cross-user notification lookups). The app never has service role access.
- **Admin functions:** Use `SECURITY DEFINER` to avoid RLS policy recursion while still enforcing role checks.

### 12.2 API Key Management

- Claude API keys are stored only on-device in AsyncStorage — never sent to the backend
- Keys are trimmed on save/load and validated to start with `sk-ant-` before use
- The admin dashboard tracks usage costs but never sees individual API keys

### 12.3 Content Moderation

Client-side profanity filter with normalization for obfuscation:
- Visual lookalike replacement (`0→o`, `1→i`, `3→e`, etc.)
- Cyrillic character substitution (`с→c`, `р→p`)
- Separator/whitespace stripping
- Diacritics removal via Unicode NFD normalization
- Categories: brand protection, profanity, slurs, violence, sexual content, drugs, scam indicators
- Applied to usernames, display names, and bios. Skipped for admin accounts.

### 12.4 Sensitive Files

Gitignored and never committed:
- `.env`, `.env.local`, `.env.*.local` — Supabase URLs, anon keys, Google OAuth client IDs
- `ios/GoogleService-Info.plist` — Firebase config
- `supabase/.temp/` — Local CLI state
- `src/utils/testAccounts.ts`, `docs/seed_test_accounts.sql` — Test credentials

---

## 13. Environment & Deployment

### 13.1 Dual Environment Setup

| | Development | Production |
|---|---|---|
| Supabase Project | Separate | Separate |
| Firebase Project | Separate | Separate |
| `.env` file | `.env` | `.env.production` |
| Switch command | `npm start` | `npm run start:prod` |
| iOS build | `npm run ios` | `npm run ios:prod` |

Environment switching is handled by `react-native-dotenv` with the `APP_ENV` variable. Same codebase, different backend targets.

### 13.2 Build & Deploy

```bash
# Development
npm install          # patch-package runs automatically via postinstall
npm start            # Metro bundler with .env
npx react-native run-ios  # Build + run on simulator

# Production (TestFlight)
cp ios/firebase/GoogleService-Info-Prod.plist ios/GoogleService-Info.plist
APP_ENV=production react-native start --reset-cache
# Xcode: Product → Archive → Distribute → TestFlight Internal
```

### 13.3 Database Migrations

Managed via Supabase CLI:
```bash
supabase link --project-ref <ref>
supabase db push
```

Migration files in `supabase/migrations/` with timestamped naming.

---

## 14. Dependencies

### 14.1 Production Dependencies (26)

**Core:** React 19.2.3, React Native 0.84.0

**Navigation:** `@react-navigation/native` 7.x, `@react-navigation/material-top-tabs` 7.x, `@react-navigation/native-stack` 7.x, `react-native-pager-view` 8.x

**Backend:** `@supabase/supabase-js` 2.97.0, `axios` 1.13.5

**Auth:** `@invertase/react-native-apple-authentication` 2.5.1, `@react-native-google-signin/google-signin` 16.1.2 (patched), `js-sha256` 0.11.1

**Firebase:** `@react-native-firebase/app` 23.8.6, `@react-native-firebase/messaging` 23.8.6

**UI:** `react-native-vector-icons` 10.3.0 (Ionicons), `react-native-chart-kit` 6.12.0, `react-native-svg` 15.15.4, `react-native-markdown-display` 7.0.2, `react-native-image-picker` 8.2.1

**Platform:** `react-native-safe-area-context` 5.6.2, `react-native-screens` 4.23.0, `react-native-url-polyfill` 3.0.0, `@react-native-async-storage/async-storage` 2.2.0, `@react-native-community/netinfo` 12.0.1, `react-native-device-info` 15.0.2

### 14.2 Notable Patch

`@react-native-google-signin/google-signin` is patched via `patch-package` to add nonce support on iOS. The patch adds an optional `nonce` parameter to the sign-in method and routes to a nonce-aware native method when provided. This enables PKCE-style OAuth2 security with Supabase identity linking.

---

## 15. Design Language

### 15.1 Visual Identity

- **Mascot:** Noomi, a purple phoenix. Appears as chat avatar (22×22), empty state illustration (80×80), app icon, and launch screen.
- **Accent Color:** `#7C3AED` (purple) — used throughout as `colors.accent`. The old green accent (`#4CAF50`) has been fully replaced.
- **Extended Palette:** Lighter purple `#8B5CF6`, deep purple `#5B21B6`, light bg `#EDE9FE` / dark bg `#1a1033`
- **Card Styling:** `colors.surface` background, `colors.border` border, `borderRadius: 14`

### 15.2 Component Conventions

- Functional components only, TypeScript strict mode
- Styles via `StyleSheet.create` at bottom of file
- Theme colors applied inline: `{ color: colors.text }`
- 12px spacing between sibling components on home screen
- Primary buttons invert in dark mode (white bg/dark text)
- Apple Sign-In button inverts in dark mode; Google stays blue

---

## 16. What's Next

### 16.1 In-Progress

- Live Activity integration (Dynamic Island for real-time calorie tracking)
- Control Center widget (quick actions)
- Android platform support

### 16.2 Designed (docs exist)

- Complex multi-day meal plans (`docs/design-complex-plans.md`)
- Ingredients library with reusable building blocks (`docs/design-ingredients-library.md`)

### 16.3 Potential

- Barcode scanning for packaged food
- Apple Health integration (read/write weight, activity)
- Group challenges between friends
- Recipe search and import
- Subscription tier for server-side AI (no BYOK required)
