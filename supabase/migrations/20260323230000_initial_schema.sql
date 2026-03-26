-- NoomiBodi: Complete initial schema
-- Generated from live dev database inspection on 2026-03-23

-- ============================================================
-- 1. TABLES (created first, policies added after helper functions)
-- ============================================================

-- 1.1 profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  username TEXT UNIQUE,
  display_name TEXT,
  profile_picture_url TEXT,
  bio TEXT,
  is_private BOOLEAN DEFAULT false,
  gender TEXT,
  age INTEGER,
  height_cm NUMERIC,
  current_weight_kg NUMERIC,
  activity_level TEXT,
  role TEXT DEFAULT 'byok',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX profiles_username_idx ON profiles(username);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;


-- 1.2 public_profiles (synced table, not a view)
CREATE TABLE public_profiles (
  id UUID PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  profile_picture_url TEXT,
  bio TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ
);

ALTER TABLE public_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read public profiles"
  ON public_profiles FOR SELECT TO authenticated
  USING (true);


-- 1.3 user_plans
CREATE TABLE user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  goal_type TEXT,
  target_weight_kg NUMERIC,
  daily_calories INTEGER,
  daily_protein_g INTEGER,
  daily_carbs_g INTEGER,
  daily_fat_g INTEGER,
  plan_details TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX user_plans_user_id_idx ON user_plans(user_id);
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plans"
  ON user_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans"
  ON user_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans"
  ON user_plans FOR UPDATE USING (auth.uid() = user_id);


-- 1.4 saved_meals
CREATE TABLE saved_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  meal_name TEXT NOT NULL,
  calories INTEGER,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX saved_meals_user_id_idx ON saved_meals(user_id);
ALTER TABLE saved_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved meals"
  ON saved_meals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved meals"
  ON saved_meals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved meals"
  ON saved_meals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved meals"
  ON saved_meals FOR DELETE USING (auth.uid() = user_id);


-- 1.5 daily_logs
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  logged_at TIMESTAMPTZ DEFAULT now(),
  meal_name TEXT NOT NULL,
  calories INTEGER,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  meal_type TEXT,
  image_url TEXT,
  notes TEXT
);

CREATE INDEX daily_logs_user_id_idx ON daily_logs(user_id);
CREATE INDEX daily_logs_logged_at_idx ON daily_logs(logged_at);
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily logs"
  ON daily_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily logs"
  ON daily_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily logs"
  ON daily_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily logs"
  ON daily_logs FOR DELETE USING (auth.uid() = user_id);


-- 1.6 weight_logs
CREATE TABLE weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  weight_kg NUMERIC NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX weight_logs_user_id_idx ON weight_logs(user_id);
CREATE INDEX weight_logs_logged_at_idx ON weight_logs(logged_at);
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weight logs"
  ON weight_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weight logs"
  ON weight_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own weight logs"
  ON weight_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own weight logs"
  ON weight_logs FOR DELETE USING (auth.uid() = user_id);


-- 1.7 user_insights
CREATE TABLE user_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  data_context JSONB,
  priority INTEGER DEFAULT 0,
  is_dismissed BOOLEAN DEFAULT false,
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX user_insights_user_id_idx ON user_insights(user_id);
CREATE INDEX user_insights_valid_idx ON user_insights(valid_until);
ALTER TABLE user_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own insights"
  ON user_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own insights"
  ON user_insights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own insights"
  ON user_insights FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own insights"
  ON user_insights FOR DELETE USING (auth.uid() = user_id);


-- 1.8 ai_usage_logs
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  model TEXT NOT NULL,
  tokens_input INTEGER,
  tokens_output INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC,
  latency_ms INTEGER,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  tools_used JSONB,
  conversation_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ai_usage_logs_user_id_idx ON ai_usage_logs(user_id);
CREATE INDEX ai_usage_logs_created_at_idx ON ai_usage_logs(created_at);
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;


-- 1.9 friendships
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id),
  following_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX friendships_follower_idx ON friendships(follower_id);
CREATE INDEX friendships_following_idx ON friendships(following_id);
CREATE INDEX friendships_status_idx ON friendships(status);
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = follower_id OR auth.uid() = following_id);
CREATE POLICY "Users can send friend requests"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Recipients can accept or decline friend requests"
  ON friendships FOR UPDATE
  USING (auth.uid() = following_id);
CREATE POLICY "Users can delete their own friendships"
  ON friendships FOR DELETE
  USING (auth.uid() = follower_id OR auth.uid() = following_id);


-- 1.10 activity_feed
CREATE TABLE activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  activity_type TEXT NOT NULL,
  activity_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX activity_feed_user_id_idx ON activity_feed(user_id);
CREATE INDEX activity_feed_created_at_idx ON activity_feed(created_at DESC);
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own activity"
  ON activity_feed FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view accepted friends' activity if not private"
  ON activity_feed FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM friendships f
      JOIN profiles p ON p.id = activity_feed.user_id
      WHERE (
        (f.follower_id = auth.uid() AND f.following_id = activity_feed.user_id)
        OR (f.following_id = auth.uid() AND f.follower_id = activity_feed.user_id)
      )
      AND f.status = 'accepted'
      AND (p.is_private = false OR activity_feed.user_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert their own activity"
  ON activity_feed FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- 1.11 shared_meals
CREATE TABLE shared_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES saved_meals(id),
  shared_by UUID NOT NULL REFERENCES auth.users(id),
  shared_with UUID NOT NULL REFERENCES auth.users(id),
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX shared_meals_shared_with_idx ON shared_meals(shared_with);
CREATE INDEX shared_meals_is_read_idx ON shared_meals(is_read);
ALTER TABLE shared_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meals shared with them"
  ON shared_meals FOR SELECT
  USING (auth.uid() = shared_with OR auth.uid() = shared_by);

CREATE POLICY "Users can share their own meals with friends"
  ON shared_meals FOR INSERT
  WITH CHECK (
    auth.uid() = shared_by
    AND EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = shared_meals.meal_id
        AND saved_meals.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM friendships
      WHERE friendships.status = 'accepted'
        AND (
          (friendships.follower_id = auth.uid() AND friendships.following_id = shared_meals.shared_with)
          OR (friendships.following_id = auth.uid() AND friendships.follower_id = shared_meals.shared_with)
        )
    )
  );

CREATE POLICY "Users can update read status"
  ON shared_meals FOR UPDATE
  USING (auth.uid() = shared_with);

CREATE POLICY "Users can delete shared meals they received"
  ON shared_meals FOR DELETE
  USING (auth.uid() = shared_with);

-- Allow recipients to view the actual meal data for meals shared with them
CREATE POLICY "Users can view meals shared with them"
  ON saved_meals FOR SELECT
  USING (
    id IN (
      SELECT shared_meals.meal_id
      FROM shared_meals
      WHERE shared_meals.shared_with = auth.uid()
    )
  );


-- 1.12 device_tokens
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'ios',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, fcm_token)
);

CREATE INDEX device_tokens_user_id_idx ON device_tokens(user_id);
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tokens"
  ON device_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 1.13 meal_plans
CREATE TABLE meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  plan_data JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 2. HELPER FUNCTIONS (after tables exist)
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION sync_public_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF tg_op = 'DELETE' THEN
    DELETE FROM public.public_profiles WHERE id = old.id;
    RETURN old;
  END IF;

  INSERT INTO public.public_profiles (
    id, username, display_name, profile_picture_url, bio, is_private, created_at
  )
  VALUES (
    new.id, new.username, new.display_name, new.profile_picture_url, new.bio, new.is_private, new.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    username = excluded.username,
    display_name = excluded.display_name,
    profile_picture_url = excluded.profile_picture_url,
    bio = excluded.bio,
    is_private = excluded.is_private,
    created_at = excluded.created_at;

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION claim_device_token(p_fcm_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM device_tokens
  WHERE fcm_token = p_fcm_token
    AND user_id <> auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION get_friend_stats(p_friend_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_is_friend BOOLEAN;
  v_is_private BOOLEAN;
  v_streak INTEGER := 0;
  v_days_tracked INTEGER;
  v_cursor DATE;
  v_goal_type TEXT;
  v_goal_calories INTEGER;
  v_goal_protein INTEGER;
  v_goal_carbs INTEGER;
  v_goal_fat INTEGER;
  v_week_start DATE;
  v_week_days_hit INTEGER := 0;
  v_week_days_total INTEGER := 0;
  v_adherence_pct INTEGER := 0;
  v_start_weight DECIMAL;
  v_current_weight DECIMAL;
  v_weight_change DECIMAL;
  v_avg_calories DECIMAL;
  v_avg_protein DECIMAL;
  v_avg_carbs DECIMAL;
  v_avg_fat DECIMAL;
  v_avg_days INTEGER;
BEGIN
  -- 1. Verify accepted friendship (bidirectional)
  SELECT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND (
        (follower_id = v_caller AND following_id = p_friend_id)
        OR (follower_id = p_friend_id AND following_id = v_caller)
      )
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN NULL;
  END IF;

  -- 2. Check privacy
  SELECT COALESCE(is_private, false)
    INTO v_is_private
    FROM profiles
   WHERE id = p_friend_id;

  IF v_is_private THEN
    RETURN NULL;
  END IF;

  -- 3. Get active plan
  SELECT goal_type, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g
    INTO v_goal_type, v_goal_calories, v_goal_protein, v_goal_carbs, v_goal_fat
    FROM user_plans
   WHERE user_id = p_friend_id AND is_active = true
   ORDER BY created_at DESC
   LIMIT 1;

  -- 4. Days tracked
  SELECT COUNT(DISTINCT DATE(logged_at))
    INTO v_days_tracked
    FROM daily_logs
   WHERE user_id = p_friend_id;

  -- 5. Streak: consecutive days ending today with at least one meal
  v_cursor := CURRENT_DATE;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM daily_logs
      WHERE user_id = p_friend_id
        AND DATE(logged_at) = v_cursor
    );
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  END LOOP;

  -- 6. Weekly adherence (Mon-Sun, days within +/-10% of calorie goal)
  v_week_start := DATE_TRUNC('week', CURRENT_DATE)::DATE;

  IF v_goal_calories IS NOT NULL AND v_goal_calories > 0 THEN
    FOR v_cursor IN
      SELECT d::DATE
        FROM generate_series(v_week_start, CURRENT_DATE, '1 day'::INTERVAL) AS d
    LOOP
      DECLARE
        v_day_cals INTEGER;
      BEGIN
        SELECT COALESCE(SUM(calories), 0)
          INTO v_day_cals
          FROM daily_logs
         WHERE user_id = p_friend_id
           AND DATE(logged_at) = v_cursor;

        IF v_day_cals > 0 THEN
          v_week_days_total := v_week_days_total + 1;
          IF v_day_cals >= v_goal_calories * 0.9
             AND v_day_cals <= v_goal_calories * 1.1 THEN
            v_week_days_hit := v_week_days_hit + 1;
          END IF;
        END IF;
      END;
    END LOOP;
  END IF;

  IF v_week_days_total > 0 THEN
    v_adherence_pct := ROUND((v_week_days_hit::NUMERIC / v_week_days_total) * 100);
  END IF;

  -- 7. Weight progress (first and most recent)
  SELECT weight_kg INTO v_start_weight
    FROM weight_logs
   WHERE user_id = p_friend_id
   ORDER BY logged_at ASC
   LIMIT 1;

  SELECT weight_kg INTO v_current_weight
    FROM weight_logs
   WHERE user_id = p_friend_id
   ORDER BY logged_at DESC
   LIMIT 1;

  IF v_start_weight IS NOT NULL AND v_current_weight IS NOT NULL THEN
    v_weight_change := v_current_weight - v_start_weight;
  END IF;

  -- 8. Average daily macros (last 7 days with data)
  SELECT COUNT(*), COALESCE(AVG(day_cal), 0), COALESCE(AVG(day_p), 0),
         COALESCE(AVG(day_c), 0), COALESCE(AVG(day_f), 0)
    INTO v_avg_days, v_avg_calories, v_avg_protein, v_avg_carbs, v_avg_fat
    FROM (
      SELECT DATE(logged_at) AS d,
             SUM(calories) AS day_cal,
             SUM(protein_g) AS day_p,
             SUM(carbs_g) AS day_c,
             SUM(fat_g) AS day_f
        FROM daily_logs
       WHERE user_id = p_friend_id
       GROUP BY DATE(logged_at)
       ORDER BY d DESC
       LIMIT 7
    ) recent;

  RETURN jsonb_build_object(
    'streak', v_streak,
    'days_tracked', v_days_tracked,
    'adherence_pct', v_adherence_pct,
    'goal_type', v_goal_type,
    'goal_calories', v_goal_calories,
    'goal_protein', v_goal_protein,
    'goal_carbs', v_goal_carbs,
    'goal_fat', v_goal_fat,
    'start_weight_kg', v_start_weight,
    'current_weight_kg', v_current_weight,
    'weight_change_kg', v_weight_change,
    'avg_calories', ROUND(v_avg_calories),
    'avg_protein', ROUND(v_avg_protein),
    'avg_carbs', ROUND(v_avg_carbs),
    'avg_fat', ROUND(v_avg_fat),
    'avg_days', v_avg_days
  );
END;
$$;


-- ============================================================
-- 3. RLS POLICIES THAT DEPEND ON HELPER FUNCTIONS
-- ============================================================

-- profiles policies (is_admin() must exist first)
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Authenticated users can view all profiles"
  ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admins can see all profiles"
  ON profiles FOR SELECT USING (is_admin());
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ai_usage_logs policies (is_admin() must exist first)
CREATE POLICY "Admins can view all ai usage logs"
  ON ai_usage_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Users can insert own ai usage logs"
  ON ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 4. TRIGGERS
-- ============================================================

CREATE TRIGGER sync_public_profile_trigger
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_public_profile();
