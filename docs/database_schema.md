# NoomiBodi Database Schema

**Database:** PostgreSQL (Supabase)  
**Last Updated:** February 2026

---

## Overview

The database uses Row Level Security (RLS) to ensure users can only access their own data. All tables reference `auth.users` from Supabase's built-in authentication system.

---

## Tables

### 1. `profiles`

Extended user profile information beyond basic authentication.

**Columns:**
- `id` (UUID, Primary Key) - References `auth.users.id`
- `email` (TEXT) - User's email address
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

**RLS Policies:**
- Users can view own profile
- Users can update own profile
- Users can insert own profile

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

## Relationships
```
auth.users (Supabase managed)
    ↓
    ├── profiles (1:1)
    ├── user_plans (1:many)
    ├── saved_meals (1:many)
    ├── daily_logs (1:many)
    ├── weight_logs (1:many)
    ├── user_insights (1:many)
    └── ai_usage_logs (1:many)
```

---

## Security

### Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:
- Users can only access their own data
- Admins can view additional data (ai_usage_logs)
- Authentication is required for all operations

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