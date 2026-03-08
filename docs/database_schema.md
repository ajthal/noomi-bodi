# NoomiBodi Database Schema

**Database:** PostgreSQL (Supabase)  
**Last Updated:** March 2026

---

## Overview

The database uses Row Level Security (RLS) to ensure users can only access their own data. All tables reference `auth.users` from Supabase's built-in authentication system. Social features (friendships, activity feed, shared meals) use more complex RLS policies with cross-table checks for privacy and friendship status.

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
- `height_cm` (DECIMAL) - Height in centimeters
- `current_weight_kg` (DECIMAL) - Current weight in kilograms
- `activity_level` (TEXT) - Activity level (sedentary, moderate, active, etc.)
- `role` (TEXT, Default: 'byok') - User role for access control
  - Valid values: `admin`, `beta`, `pro`, `standard`, `byok`
- `created_at` (TIMESTAMP WITH TIME ZONE) - Account creation timestamp
- `updated_at` (TIMESTAMP WITH TIME ZONE) - Last profile update

**Indexes:**
- Primary key on `id`
- `profiles_username_idx` on `username` (for fast user search)

**RLS Policies:**
- Users can view own profile
- Admins can see all profiles (via `is_admin()` SECURITY DEFINER function)
- Users can update own profile
- Users can insert own profile

**Note:** Sensitive columns (`email`, `gender`, `age`, `height_cm`, `current_weight_kg`, `activity_level`) are only accessible to the owning user or admins. Social features use the `public_profiles` view (see Views section) for cross-user lookups.

---

### 2. `user_plans`

Nutrition plans and goals for users, generated during onboarding or updated through conversations with AI.

**Columns:**
- `id` (UUID, Primary Key) - Unique plan identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Owner of the plan
- `goal_type` (TEXT) - Type of goal: `lose`, `maintain`, or `gain`
- `target_weight_kg` (DECIMAL) - Target weight in kilograms
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

### 3. `saved_meals`

User's personal library of frequently eaten meals for quick logging.

**Columns:**
- `id` (UUID, Primary Key) - Unique meal identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Owner of the meal
- `meal_name` (TEXT, Required) - Name of the meal
- `calories` (INTEGER) - Total calories
- `protein_g` (DECIMAL) - Protein in grams
- `carbs_g` (DECIMAL) - Carbohydrates in grams
- `fat_g` (DECIMAL) - Fat in grams
- `image_url` (TEXT) - Optional image URL from storage
- `notes` (TEXT) - Optional notes about the meal
- `created_at` (TIMESTAMP WITH TIME ZONE) - When meal was saved

**Indexes:**
- `saved_meals_user_id_idx` on `user_id`

**RLS Policies:**
- Users can view own saved meals
- Users can view meals shared with them (via subquery on `shared_meals`)
- Users can insert own saved meals
- Users can update own saved meals
- Users can delete own saved meals

---

### 4. `daily_logs`

Individual meal entries logged throughout each day. Each row represents one meal or snack.

**Columns:**
- `id` (UUID, Primary Key) - Unique log entry identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Who logged the meal
- `logged_at` (TIMESTAMP WITH TIME ZONE, Default: NOW) - When the meal was logged
- `meal_name` (TEXT, Required) - Name/description of the meal
- `calories` (INTEGER) - Total calories
- `protein_g` (DECIMAL) - Protein in grams
- `carbs_g` (DECIMAL) - Carbohydrates in grams
- `fat_g` (DECIMAL) - Fat in grams
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

**Common Queries:**
```sql
-- Get today's meals
SELECT * FROM daily_logs 
WHERE user_id = 'xxx' 
AND DATE(logged_at) = CURRENT_DATE
ORDER BY logged_at DESC;

-- Get weekly totals
SELECT 
  DATE(logged_at) as date,
  SUM(calories) as total_calories,
  SUM(protein_g) as total_protein
FROM daily_logs
WHERE user_id = 'xxx'
AND logged_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(logged_at)
ORDER BY date;
```

---

### 5. `weight_logs`

Weight check-ins over time for tracking progress toward goals.

**Columns:**
- `id` (UUID, Primary Key) - Unique weight log identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Who logged the weight
- `weight_kg` (DECIMAL, Required) - Weight in kilograms
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

**Common Queries:**
```sql
-- Get weight trend over last 30 days
SELECT logged_at, weight_kg 
FROM weight_logs
WHERE user_id = 'xxx'
AND logged_at >= NOW() - INTERVAL '30 days'
ORDER BY logged_at;

-- Calculate weight change
SELECT 
  (SELECT weight_kg FROM weight_logs WHERE user_id = 'xxx' ORDER BY logged_at DESC LIMIT 1) -
  (SELECT weight_kg FROM weight_logs WHERE user_id = 'xxx' ORDER BY logged_at ASC LIMIT 1)
  AS total_change;
```

---

### 6. `user_insights`

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

**Common Queries:**
```sql
-- Get active insights for user
SELECT * FROM user_insights
WHERE user_id = 'xxx'
AND is_dismissed = false
AND (valid_until IS NULL OR valid_until > NOW())
ORDER BY priority DESC, created_at DESC;
```

---

### 7. `ai_usage_logs`

Logging table for all Claude API calls for monitoring and cost tracking. Only accessible by admins.

**Columns:**
- `id` (UUID, Primary Key) - Unique log entry identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - User who triggered the API call
- `model` (TEXT, Required) - Claude model used (e.g., `claude-sonnet-4-5-20250929`)
- `tokens_input` (INTEGER) - Input tokens consumed
- `tokens_output` (INTEGER) - Output tokens consumed
- `total_tokens` (INTEGER) - Total tokens (input + output)
- `estimated_cost_usd` (DECIMAL(10,6)) - Estimated cost in USD
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
- Admins can view all logs (checks `profiles.role = 'admin'`)
- System can insert logs for any user

**Common Queries:**
```sql
-- Total usage by user (admin only)
SELECT 
  user_id,
  COUNT(*) as total_calls,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost_usd) as total_cost
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY total_cost DESC;

-- Error rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_calls,
  SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as errors,
  ROUND(100.0 * SUM(CASE WHEN success = false THEN 1 ELSE 0 END) / COUNT(*), 2) as error_rate_pct
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

---

### 8. `friendships`

Bidirectional friend system. Both users must accept for friendship to be active (status = 'accepted').

**Columns:**
- `id` (UUID, Primary Key) - Unique friendship identifier
- `follower_id` (UUID, Foreign Key → `auth.users.id`) - User who sent the request
- `following_id` (UUID, Foreign Key → `auth.users.id`) - User who received the request
- `status` (TEXT) - Request status: `pending`, `accepted`, or `declined`
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
- Users can view friendships they're part of (as follower or following)
- Users can create friend requests (as follower only)
- Recipients can accept or decline friend requests (UPDATE restricted to `following_id = auth.uid()`)
- Users can delete friendships they're part of (either party can unfriend/cancel)

---

### 9. `activity_feed`

Stores user achievements (streak milestones) to display in friend activity feeds.

**Columns:**
- `id` (UUID, Primary Key) - Unique activity identifier
- `user_id` (UUID, Foreign Key → `auth.users.id`) - Who performed the activity
- `activity_type` (TEXT) - Type of activity (currently only `streak_milestone`)
- `activity_data` (JSONB) - Activity details (e.g., `{ "streak_days": 7 }`)
- `created_at` (TIMESTAMP WITH TIME ZONE) - When the activity occurred

**Activity types (MVP):**
- `streak_milestone` - User hit N-day streak (3, 7, 14, 30, etc.)

**Indexes:**
- `activity_feed_user_id_idx` on `user_id`
- `activity_feed_created_at_idx` on `created_at` (DESC, for feed queries)

**RLS Policies:**
- Users can view their own activity
- Users can view accepted friends' activity IF friend is not private:
  - Bidirectional friendship must exist with status = 'accepted'
  - Friend's `profiles.is_private` must be `false` (or viewing own activity)
- Users can insert their own activity

**Common Queries:**
```sql
-- Get friend activity feed (respects privacy)
SELECT af.* FROM activity_feed af
JOIN friendships f ON (
  (f.follower_id = 'current_user' AND f.following_id = af.user_id)
  OR (f.following_id = 'current_user' AND f.follower_id = af.user_id)
)
JOIN profiles p ON p.id = af.user_id
WHERE f.status = 'accepted'
AND p.is_private = false
ORDER BY af.created_at DESC;
```

---

### 10. `shared_meals`

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
- Users can share their own meals (validates meal ownership via `saved_meals`)
- Recipients can update read status (mark as read)
- Recipients can delete meals shared with them

**Common Queries:**
```sql
-- Get unread shared meals inbox
SELECT sm.*, s.meal_name, s.calories, s.protein_g, s.carbs_g, s.fat_g,
       p.username, p.display_name, p.profile_picture_url
FROM shared_meals sm
JOIN saved_meals s ON s.id = sm.meal_id
JOIN profiles p ON p.id = sm.shared_by
WHERE sm.shared_with = 'current_user'
AND sm.is_read = false
ORDER BY sm.created_at DESC;

-- Get unread count for badge
SELECT COUNT(*) FROM shared_meals
WHERE shared_with = 'current_user'
AND is_read = false;
```

---

## Views

### `public_profiles`

Security definer view exposing only non-sensitive profile columns for social feature lookups. All social services (`friendships.ts`, `activityFeed.ts`, `sharedMeals.ts`, `profileService.ts`) query this view instead of the `profiles` table directly.

**Columns:**
- `id` (UUID)
- `username` (TEXT)
- `display_name` (TEXT)
- `profile_picture_url` (TEXT)
- `bio` (TEXT)
- `is_private` (BOOLEAN)
- `created_at` (TIMESTAMP WITH TIME ZONE)

**Excluded from view (private):** `email`, `gender`, `age`, `height_cm`, `current_weight_kg`, `activity_level`, `role`, `updated_at`

**Access:**
- `GRANT SELECT` to `authenticated` role
- `REVOKE SELECT` from `anon` and `public` roles
- Security definer mode bypasses profiles RLS, so authenticated users can look up any user's public info
- Admin search (`adminSearchUsers`) queries `profiles` directly for email/role access

---

## Supabase Storage

### `profile-pictures` Bucket

Public bucket for user profile images. URLs are saved in `profiles.profile_picture_url`.

**Folder structure:** `{user_id}/{timestamp}.jpg`

**Storage Policies:**
- Users can upload to their own folder (`{user_id}/`)
- Anyone can view profile pictures (public bucket)
- Users can update/delete their own pictures

---

## Relationships
```
auth.users (Supabase managed)
    ↓
    ├── profiles (1:1) - Extended with username, picture, bio, privacy
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
    └── shared_meals (1:many as recipient)
```

---

## Security

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- Users can only access their own data
- Admins can view additional data (ai_usage_logs, all profiles via `is_admin()` SECURITY DEFINER function)
- Authentication is required for all operations
- Cross-user social lookups go through the `public_profiles` view (security definer, non-sensitive columns only)

**Social feature RLS:**
- **Friendships:** Bidirectional visibility — both follower and following can see and delete the row. Only the follower can create (send request). Only the recipient (`following_id`) can accept/decline (UPDATE).
- **Activity Feed:** Complex privacy logic — own activity is always visible; friends' activity is visible only if friendship is accepted (bidirectional) AND friend's `is_private = false`. Prevents leaking private users' activities.
- **Shared Meals:** Both sender and recipient can view. Only the sender can create (must own the meal via `saved_meals`). Only the recipient can mark as read or delete.
- **Saved Meals:** Users can view meals shared with them (via subquery on `shared_meals.shared_with = auth.uid()`) in addition to their own meals.

### Helper Functions

- **`is_admin()`** — SECURITY DEFINER function that checks `profiles.role = 'admin'` for the current user. Bypasses RLS to avoid infinite recursion when used inside profile policies.

### Roles

Defined in `profiles.role`:
- `admin` - Full system access, can view all analytics
- `beta` - Pilot users, free access during testing
- `pro` - Future premium tier
- `standard` - Future basic tier
- `byok` - Bring Your Own Key users (default)

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
- `meal_plans` - Saved multi-day meal plans
- `user_settings` - App preferences and configuration
- `notifications` - Push notification history
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