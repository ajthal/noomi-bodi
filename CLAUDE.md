# NoomiBodi

AI-powered nutrition tracking app built with React Native (TypeScript), Supabase backend, and Claude API.

## Quick Reference

- **Node**: >= 22.11.0
- **Run dev**: `npm start` (or `npm run start:prod` for production env)
- **Run iOS**: `npx react-native run-ios` (or `npm run ios:prod`)
- **Run Android**: `npx react-native run-android`
- **Lint**: `npm run lint`
- **Test**: `npm test`
- **Postinstall**: `npx patch-package` (runs automatically)
- **Environment switching**: `APP_ENV=production react-native start --reset-cache`

## Architecture

React Native 0.84 app with flat swipeable pager navigation (`createMaterialTopTabNavigator`). Supabase for auth, database (PostgreSQL + RLS), and storage. Claude Sonnet 4.6 for AI chat and nutrition insights. Firebase Cloud Messaging for push notifications. WidgetKit (Swift) for iOS widgets.

### Key Directories

- `src/screens/` — app screens (QuickLogPage, ChatScreen, MealsScreen, etc.)
- `src/services/` — business logic and API integrations (claude.ts, mealLog.ts, storage.ts, etc.)
- `src/components/` — reusable UI components
- `src/contexts/` — React contexts (Auth, Theme, Impersonation)
- `src/hooks/` — custom hooks (useAsyncData, useStaleFetch, useDayChange, etc.)
- `src/utils/` — utilities (errorMessages, retry, profanityFilter)
- `ios/NoomiBodi Widget/` — native WidgetKit extension (Swift)
- `supabase/migrations/` — database migrations
- `docs/` — database schema, deployment guide, roles, feature designs

## Conventions

- TypeScript strict mode, functional components only
- Styles via `StyleSheet.create` at bottom of file; theme colors applied inline `{ color: colors.text }`
- For separate style files: `createStyles(colors: ThemeColors, isDark: boolean)` pattern with `useMemo`
- Card styling: `colors.surface` bg, `colors.border` border, `borderRadius: 14`
- All modals use `BottomSheet` wrapper (tap/drag dismiss, dark backdrop)
- Skeleton loaders for initial load (not ActivityIndicator), `RefreshControl` for pull-to-refresh
- All user-facing errors go through `getUserFriendlyError()` — never show raw errors
- Tab-switching uses `useStaleFetch` to avoid redundant re-fetches
- Accent color is purple `#7C3AED` (`colors.accent`) — never use green `#4CAF50`
- Noomi (purple phoenix mascot) avatar appears wherever AI persona is represented
- Claude response markers: `[MEAL_DATA]`, `[PLAN_START]`, `[SAVE_MEAL]`, `[PORTION]`

## Database

Supabase with RLS. Key tables: `profiles`, `public_profiles`, `user_plans`, `saved_meals`, `daily_logs`, `weight_logs`, `user_insights`, `ai_usage_logs`, `friendships`, `activity_feed`, `shared_meals`, `device_tokens`, `feedback`.

See `docs/database_schema.md` for full schema, `docs/roles.md` for role details.

## Sensitive Files (gitignored — never commit)

- `.env`, `.env.local`, `.env.*.local`
- `ios/GoogleService-Info.plist`
- `supabase/.temp/`
- `src/utils/testAccounts.ts`, `docs/seed_test_accounts.sql`
