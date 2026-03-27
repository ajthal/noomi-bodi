# NoomiBodi Database Schema

**Database:** PostgreSQL (Supabase)  
**Last Updated:** March 2026

---

## Overview

The database uses Row Level Security (RLS) to ensure users can only access their own data. All tables reference `auth.users` from Supabase's built-in authentication system. Social features (friendships, activity feed, shared meals) use more complex RLS policies with cross-table checks for privacy and friendship status.

The canonical schema lives in `supabase/migrations/20260323230000_initial_schema.sql`. Apply it to a fresh Supabase project with `supabase db push`.

---

## Tables

### 1. `profiles`

Extended user profile information beyond basic authentication.

**Columns:**
- `id` (UUID, Primary Key) - References `auth.users.id`
- `email` (TEXT) - User's email address
- `username` (TEXT, UNIQUE) - User's unique handle (e.g., "@sarah")
- `display_name` (TEXT) - Optional friendly name
- `profile_picture_url` (TEXT) - URL to profile image in Supabase Storage
- `bio` (TEXT) - Optional user bio (max 150 chars in UI)
- `is_private` (BOOLEAN, Default: false) - Privacy toggle for social features
- `gender` (TEXT) - User's gender
- `age` (INTEGER) - User's age in years
- `height_cm` (NUMERIC) - Height in centimeters
- `current_weight_kg` (NUMERIC) - Current weight in kilograms
- `activity_level` (TEXT) - Activity level (sedentary, moderate, active, etc.)
- `role` (TEXT, Default: 'byok') - User role for access control
  - Valid values: `admin`, `beta`, `pro`, `standard`, `byok`
- `created_at` (TIMESTAMP WITH TIME ZONE) - Account creation timestamp
- `updated_at` (TIMESTAMP WITH TIME ZONE) - Last profile update

**Indexes:**
- Primary key on `id`
- `profiles_username_idx` on `username` (for fast user search)

**RLS Policies:**
- Users can view own profile (`auth.uid() = id`)
- Authenticated users can view all profiles (`auth.uid() IS NOT NULL`)
- Admins can see all profiles (via `is_admin()` SECURITY DEFINER function)
- Users can update own profile
- Users can insert own profile

**Trigger:** On INSERT, UPDATE, or DELETE, the `sync_public_profile` trigger copies the public-facing columns to the `public_profiles` table (see below).

---

### 2. `public_profiles`

Separate table containing only non-sensitive profile columns for social feature lookups. Kept in sync with `profiles` via the `sync_public_profile` trigger. All social services (`friendships.ts`, `activityFeed.ts`, `sharedMeals.ts`, `profileService.ts`) query this table instead of `profiles` directly.

**Columns:**
- `id` (UUID, Primary Key)
- `username` (TEXT)
- `display_name` (TEXT)
- `profile_picture_url` (TEXT)
- `bio` (TEXT)
- `is_private` (BOOLEAN, NOT NULL, Default: false)
- `created_at` (TIMESTAMP WITH TIME ZONE)

**Excluded from this table (private):** `email`, `gender`, `age`, `height_cm`, `current_weight_kg`, `activity_level`, `role`, `updated_at`

**RLS Policies:**
- Authenticated users can read all public profiles (`true` for `authenticated` role)

**Sync mechanism:** The `sync_public_profile()` SECURITY DEFINER trigger function fires AFTER INSERT/UPDATE/DELETE on `profiles`. On INSERT/UPDATE, it upserts the matching row in `public_profiles`. On DELETE, it removes the row.

---

### 3. `user_plans`

Nutrition plans and goals for users, generated during onboarding or updated through conversations with AI.

**Columns:**
- `id` (UUID, Primary Key) - Unique plan identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Owner of the plan
- `goal_type` (TEXT) - Type of goal: `lose`, `maintain`, or `gain`
- `target_weight_kg` (NUMERIC) - Target weight in kilograms
- `daily_calories` (INTEGER) - Daily calorie target
- `daily_protein_g` (INTEGER) - Daily protein target in grams
- `daily_carbs_g` (INTEGER) - Daily carbohydrate target in grams
- `daily_fat_g` (INTEGER) - Daily fat target in grams
- `plan_details` (TEXT) - Full plan description from Claude
- `is_active` (BOOLEAN, Default: true) - Whether this is the current active plan
- `created_at` (TIMESTAMP WITH TIME ZONE) - Plan creation timestamp
- `updated_at` (TIMESTAMP WITH TIME ZONE) - Last plan update

**Indexes:**
- `user_plans_user_id_idx` on `user_id`

**RLS Policies:**
- Users can view own plans
- Users can insert own plans
- Users can update own plans

---

### 4. `saved_meals`

User's personal library of frequently eaten meals for quick logging.

**Columns:**
- `id` (UUID, Primary Key) - Unique meal identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Owner of the meal
- `meal_name` (TEXT, Required) - Name of the meal
- `calories` (INTEGER) - Total calories
- `protein_g` (NUMERIC) - Protein in grams
- `carbs_g` (NUMERIC) - Carbohydrates in grams
- `fat_g` (NUMERIC) - Fat in grams
- `image_url` (TEXT) - Optional image URL from storage
- `notes` (TEXT) - Optional notes about the meal
- `created_at` (TIMESTAMP WITH TIME ZONE) - When meal was saved

**Indexes:**
- `saved_meals_user_id_idx` on `user_id`

**RLS Policies:**
- Users can view own saved meals
- Users can view meals shared with them (via `IN` subquery on `shared_meals.shared_with = auth.uid()`)
- Users can insert own saved meals
- Users can update own saved meals
- Users can delete own saved meals

---

### 5. `daily_logs`

Individual meal entries logged throughout each day. Each row represents one meal or snack.

**Columns:**
- `id` (UUID, Primary Key) - Unique log entry identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Who logged the meal
- `logged_at` (TIMESTAMP WITH TIME ZONE, Default: NOW) - When the meal was logged
- `meal_name` (TEXT, Required) - Name/description of the meal
- `calories` (INTEGER) - Total calories
- `protein_g` (NUMERIC) - Protein in grams
- `carbs_g` (NUMERIC) - Carbohydrates in grams
- `fat_g` (NUMERIC) - Fat in grams
- `meal_type` (TEXT) - Category: `breakfast`, `lunch`, `dinner`, `snack`
- `image_url` (TEXT) - Optional image URL
- `notes` (TEXT) - Optional notes

**Indexes:**
- `daily_logs_user_id_idx` on `user_id`
- `daily_logs_logged_at_idx` on `logged_at` (for date range queries)

**RLS Policies:**
- Users can view own daily logs
- Users can insert own daily logs
- Users can update own daily logs
- Users can delete own daily logs

---

### 6. `weight_logs`

Weight check-ins over time for tracking progress toward goals.

**Columns:**
- `id` (UUID, Primary Key) - Unique weight log identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Who logged the weight
- `weight_kg` (NUMERIC, Required) - Weight in kilograms
- `logged_at` (TIMESTAMP WITH TIME ZONE, Default: NOW) - When weight was recorded
- `notes` (TEXT) - Optional notes about the weigh-in

**Indexes:**
- `weight_logs_user_id_idx` on `user_id`
- `weight_logs_logged_at_idx` on `logged_at` (for trend analysis)

**RLS Policies:**
- Users can view own weight logs
- Users can insert own weight logs
- Users can update own weight logs
- Users can delete own weight logs

---

### 7. `user_insights`

AI-generated insights and recommendations cached for display in the app.

**Columns:**
- `id` (UUID, Primary Key) - Unique insight identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Who the insight is for
- `insight_type` (TEXT, Required) - Type: `success`, `warning`, `recommendation`, `alert`
- `title` (TEXT, Required) - Short headline for the insight
- `description` (TEXT, Required) - Full insight text
- `data_context` (JSONB) - Optional metadata about what data led to this insight
- `priority` (INTEGER, Default: 0) - For sorting/ranking insights
- `is_dismissed` (BOOLEAN, Default: false) - Whether user has dismissed this insight
- `valid_from` (TIMESTAMP WITH TIME ZONE, Default: NOW) - When insight becomes valid
- `valid_until` (TIMESTAMP WITH TIME ZONE) - When insight expires (null = doesn't expire)
- `created_at` (TIMESTAMP WITH TIME ZONE) - When insight was generated

**Indexes:**
- `user_insights_user_id_idx` on `user_id`
- `user_insights_valid_idx` on `valid_until`

**RLS Policies:**
- Users can view own insights
- Users can insert own insights
- Users can update own insights (for dismissing)
- Users can delete own insights

---

### 8. `ai_usage_logs`

Logging table for all Claude API calls for monitoring and cost tracking. Only accessible by admins.

**Columns:**
- `id` (UUID, Primary Key) - Unique log entry identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - User who triggered the API call
- `model` (TEXT, Required) - Claude model used (e.g., `claude-sonnet-4-5-20250929`)
- `tokens_input` (INTEGER) - Input tokens consumed
- `tokens_output` (INTEGER) - Output tokens consumed
- `total_tokens` (INTEGER) - Total tokens (input + output)
- `estimated_cost_usd` (NUMERIC) - Estimated cost in USD
- `latency_ms` (INTEGER) - Response time in milliseconds
- `success` (BOOLEAN, Default: true) - Whether the API call succeeded
- `error_message` (TEXT) - Error details if failed
- `tools_used` (JSONB) - Array of tool/function names used in this call
- `conversation_id` (UUID) - To group related API calls in same conversation
- `created_at` (TIMESTAMP WITH TIME ZONE) - When the API call was made

**Indexes:**
- `ai_usage_logs_user_id_idx` on `user_id`
- `ai_usage_logs_created_at_idx` on `created_at`

**RLS Policies:**
- Admins can view all logs (checks `profiles.role = 'admin'` via direct subquery)
- Authenticated users can insert own logs (`auth.uid() = user_id`, scoped to `authenticated` role)

---

### 9. `friendships`

Bidirectional friend system. Both users must accept for friendship to be active (status = 'accepted').

**Columns:**
- `id` (UUID, Primary Key) - Unique friendship identifier
- `follower_id` (UUID, Foreign Key → `auth.users.id`) - User who sent the request
- `following_id` (UUID, Foreign Key → `auth.users.id`) - User who received the request
- `status` (TEXT, NOT NULL, Default: 'pending') - Request status: `pending`, `accepted`, or `declined`
- `created_at` (TIMESTAMP WITH TIME ZONE) - When request was sent
- `accepted_at` (TIMESTAMP WITH TIME ZONE, nullable) - When request was accepted

**Constraints:**
- UNIQUE(`follower_id`, `following_id`) - No duplicate requests
- CHECK: `follower_id != following_id` - Cannot friend yourself

**Indexes:**
- `friendships_follower_idx` on `follower_id`
- `friendships_following_idx` on `following_id`
- `friendships_status_idx` on `status`

**RLS Policies:**
- Users can view their own friendships (as follower or following)
- Users can send friend requests (as follower only)
- Recipients can accept or decline friend requests (UPDATE restricted to `following_id = auth.uid()`)
- Users can delete their own friendships (either party can unfriend/cancel)

---

### 10. `activity_feed`

Stores user achievements (streak milestones) to display in friend activity feeds.

**Columns:**
- `id` (UUID, Primary Key) - Unique activity identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Who performed the activity
- `activity_type` (TEXT, NOT NULL) - Type of activity (currently only `streak_milestone`)
- `activity_data` (JSONB, NOT NULL) - Activity details (e.g., `{ "streak_days": 7 }`)
- `created_at` (TIMESTAMP WITH TIME ZONE) - When the activity occurred

**Activity types (MVP):**
- `streak_milestone` - User hit N-day streak (3, 7, 14, 30, etc.)

**Indexes:**
- `activity_feed_user_id_idx` on `user_id`
- `activity_feed_created_at_idx` on `created_at` (DESC, for feed queries)

**RLS Policies:**
- Users can view their own activity
- Users can view accepted friends' activity IF friend is not private:
  - Uses a JOIN between `friendships` and `profiles`
  - Bidirectional friendship must exist with status = 'accepted'
  - Friend's `profiles.is_private` must be `false` (OR viewing own activity)
- Users can insert their own activity

---

### 11. `shared_meals`

Allows friends to share saved meals with each other. Recipients can copy shared meals to their own library.

**Columns:**
- `id` (UUID, Primary Key) - Unique share identifier
- `meal_id` (UUID, Foreign Key → `saved_meals.id`) - The meal being shared
- `shared_by` (UUID, Foreign Key → `auth.users.id`) - Who shared it
- `shared_with` (UUID, Foreign Key → `auth.users.id`) - Recipient
- `message` (TEXT, nullable) - Optional message with the share
- `is_read` (BOOLEAN, Default: false) - Read status for inbox
- `created_at` (TIMESTAMP WITH TIME ZONE) - When the meal was shared

**Indexes:**
- `shared_meals_shared_with_idx` on `shared_with` (for inbox queries)
- `shared_meals_is_read_idx` on `is_read` (for unread badge counts)

**RLS Policies:**
- Users can view meals shared with them OR by them
- Users can share their own meals with friends (validates meal ownership via `saved_meals` AND validates accepted friendship via `friendships`)
- Recipients can update read status (mark as read)
- Recipients can delete shared meals they received

---

### 12. `device_tokens`

Stores FCM (Firebase Cloud Messaging) tokens for push notification delivery. Each row maps a user to a specific device's FCM token.

**Columns:**
- `id` (UUID, Primary Key) - Unique token entry identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`, ON DELETE CASCADE) - Token owner
- `fcm_token` (TEXT, Required) - Firebase Cloud Messaging device token
- `platform` (TEXT, NOT NULL, Default: 'ios') - Device platform
- `created_at` (TIMESTAMP WITH TIME ZONE) - When token was first registered
- `updated_at` (TIMESTAMP WITH TIME ZONE) - Last token refresh

**Constraints:**
- UNIQUE(`user_id`, `fcm_token`) - No duplicate token entries per user

**Indexes:**
- `device_tokens_user_id_idx` on `user_id`

**RLS Policies:**
- Users can manage (SELECT, INSERT, UPDATE, DELETE) their own tokens only (`auth.uid() = user_id`)

**Token lifecycle:**
- Registered on app launch via `registerForPushNotifications()` (after permission grant)
- Refreshed automatically via Firebase `onTokenRefresh` listener
- Deleted on sign-out via `unregisterPushToken()`
- Stale tokens from previous users on the same device are cleaned via `claim_device_token()` RPC

---

### 13. `meal_plans`

Saved multi-day meal plans for structured eating schedules.

**Columns:**
- `id` (UUID, Primary Key) - Unique meal plan identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Owner of the plan
- `name` (TEXT, Required) - Name of the meal plan
- `start_date` (DATE, Required) - Plan start date
- `end_date` (DATE, Required) - Plan end date
- `plan_data` (JSONB, Required) - Structured plan data (meals per day)
- `is_active` (BOOLEAN, Default: true) - Whether this plan is currently active
- `created_at` (TIMESTAMP WITH TIME ZONE) - When the plan was created

---

### 14. `feedback`

TestFlight bug reports, feature requests, and general feedback from users.

**Columns:**
- `id` (UUID, Primary Key) - Unique feedback identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`, ON DELETE CASCADE) - Submitter
- `category` (TEXT, Required) - One of: `bug`, `feature`, `other`
- `title` (TEXT, Required) - Short summary
- `description` (TEXT) - Detailed description
- `screenshot_urls` (TEXT[], Default: `{}`) - Array of public URLs to uploaded screenshots
- `device_info` (JSONB, Default: `{}`) - Auto-captured device context (os, osVersion, model, appVersion, buildNumber, screen dimensions)
- `current_screen` (TEXT) - Screen the user was on when they initiated feedback
- `status` (TEXT, Default: `new`) - One of: `new`, `reviewed`, `resolved`, `closed`
- `admin_notes` (TEXT) - Internal admin notes
- `created_at` (TIMESTAMP WITH TIME ZONE) - Submission time
- `updated_at` (TIMESTAMP WITH TIME ZONE) - Last update time

**RLS Policies:**
- Users can insert their own feedback (`auth.uid() = user_id`)
- Users can read their own feedback
- Admins can read all feedback (via `is_admin()`)
- Admins can update all feedback (status, admin_notes)

---

## Supabase Storage

### `profile-pictures` Bucket

Public bucket for user profile images. URLs are saved in `profiles.profile_picture_url`.

**Folder structure:** `{user_id}/{timestamp}.jpg`

**Storage Policies:**
- Users can upload to their own folder (`{user_id}/`)
- Anyone can view profile pictures (public bucket)
- Users can update/delete their own pictures

### `feedback-screenshots` Bucket

Public bucket for feedback screenshot attachments. URLs are saved in `feedback.screenshot_urls`.

**Folder structure:** `{user_id}/{timestamp}.jpg`

**Storage Policies:**
- Authenticated users can upload screenshots
- Anyone can view screenshots (public bucket)

---

## Relationships
```
auth.users (Supabase managed)
    ↓
    ├── profiles (1:1) - Extended with username, picture, bio, privacy
    │       ↓ (sync trigger)
    │       └── public_profiles (1:1) - Non-sensitive columns only
    ├── user_plans (1:many)
    ├── saved_meals (1:many)
    │       ↓
    │       └── shared_meals (1:many) - Track which meals are shared
    ├── daily_logs (1:many)
    ├── weight_logs (1:many)
    ├── user_insights (1:many)
    ├── ai_usage_logs (1:many)
    ├── friendships (1:many as follower)
    ├── friendships (1:many as following)
    ├── activity_feed (1:many)
    ├── shared_meals (1:many as sender)
    ├── shared_meals (1:many as recipient)
    ├── device_tokens (1:many) - FCM tokens for push notifications
    ├── meal_plans (1:many) - Structured multi-day eating plans
    └── feedback (1:many) - Bug reports, feature requests, feedback
```

---

## Security

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- Users can only access their own data
- Admins can view additional data (ai_usage_logs, all profiles via `is_admin()` SECURITY DEFINER function)
- Authentication is required for all operations
- Cross-user social lookups go through the `public_profiles` table (synced from `profiles`, contains only non-sensitive columns)

**Social feature RLS:**
- **Friendships:** Bidirectional visibility — both follower and following can see and delete the row. Only the follower can create (send request). Only the recipient (`following_id`) can accept/decline (UPDATE).
- **Activity Feed:** Complex privacy logic — own activity is always visible; friends' activity is visible only if friendship is accepted (bidirectional) AND friend's `is_private = false`. Uses a JOIN between `friendships` and `profiles` for the check.
- **Shared Meals:** Both sender and recipient can view. Only the sender can create (must own the meal via `saved_meals` AND must have an accepted friendship with the recipient). Only the recipient can mark as read or delete.
- **Saved Meals:** Users can view meals shared with them (via `IN` subquery on `shared_meals.shared_with = auth.uid()`) in addition to their own meals.

### Helper Functions

- **`is_admin()`** — SECURITY DEFINER SQL function that checks `profiles.role = 'admin'` for the current user. Bypasses RLS to avoid infinite recursion when used inside profile policies.
- **`sync_public_profile()`** — SECURITY DEFINER trigger function that fires AFTER INSERT/UPDATE/DELETE on `profiles`. Upserts public-facing columns into the `public_profiles` table, or deletes the row on profile deletion. Keeps the two tables in sync automatically.
- **`claim_device_token(p_fcm_token TEXT)`** — SECURITY DEFINER function that deletes `device_tokens` rows where `fcm_token` matches but `user_id` differs from the caller (`auth.uid()`). Called during token registration to prevent stale tokens from a previous user on the same device from receiving notifications meant for a different account.
- **`get_friend_stats(p_friend_id UUID)`** — SECURITY DEFINER function returning a JSONB object with a friend's stats, plan, weight progress, and average macros. Verifies an accepted friendship exists between the caller and `p_friend_id`, and that the friend's profile is not private. Returns `null` if checks fail. Aggregates: streak, days tracked, weekly adherence, active plan (goal type, calories, macros), weight progress (start, current, change), and 7-day average calories/macros.

### Roles

Defined in `profiles.role`:
- `admin` - Full system access, can view all analytics
- `beta` - Pilot users, free access during testing
- `pro` - Future premium tier
- `standard` - Future basic tier
- `byok` - Bring Your Own Key users (default)

---

## Migration Management

Schema is managed via the Supabase CLI. Migration files live in `supabase/migrations/`.

**Initial schema:** `supabase/migrations/20260323230000_initial_schema.sql`

**Applying to a new project:**
```bash
supabase link --project-ref <project-ref>
supabase db push
```

**Creating new migrations:**
```bash
# Create a new timestamped file
# supabase/migrations/YYYYMMDDHHMMSS_description.sql

# Apply to dev first, then prod
supabase link --project-ref <dev-ref> && supabase db push
supabase link --project-ref <prod-ref> && supabase db push
```

---

## Data Retention

Currently no automatic data retention policies. Consider implementing:
- Archive `daily_logs` older than 2 years
- Archive `weight_logs` older than 2 years
- Delete dismissed `user_insights` older than 90 days
- Archive `ai_usage_logs` older than 1 year

---

## Backup Strategy

Supabase provides automatic daily backups. Additional considerations:
- Weekly exports of critical tables
- Point-in-time recovery within 7 days
- Regular testing of backup restoration

---

## Future Considerations

### Potential New Tables:
- `user_settings` - App preferences and configuration
- `notification_history` - Push notification audit log (currently notifications are fire-and-forget)
- `feedback` - User feedback and bug reports
- `api_keys` - If moving away from BYOK model

### Potential Schema Changes:
- Add `serving_size` and `servings` to `saved_meals` and `daily_logs`
- Add `meal_plan_id` foreign key to `daily_logs`
- Add `tags` (JSONB array) to `saved_meals` for categorization
- Add `timezone` to `profiles` for accurate time-based queries

### Potential Social Feature Extensions:
- New `activity_type` values (e.g., `weight_milestone`, `goal_achieved`)
- Comments/reactions on activity feed items
- Group challenges between friends
- Leaderboards and social streaks

---

## Maintenance

### Regular Tasks:
- Monitor index usage and query performance
- Review and optimize slow queries
- Update statistics for query planner
- Check for unused indexes

### Monitoring:
- Watch for table bloat
- Monitor connection pool usage
- Track slow query log
- Review RLS policy performance
