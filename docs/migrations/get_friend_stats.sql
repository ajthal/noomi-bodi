-- Migration: Add get_friend_stats RPC
-- Returns stats, plan, weight progress, and avg macros for a given user,
-- but only if the caller is an accepted friend and the target is not private.
-- Run this in the Supabase SQL Editor.

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
  -- Plan
  v_goal_type TEXT;
  v_goal_calories INTEGER;
  v_goal_protein INTEGER;
  v_goal_carbs INTEGER;
  v_goal_fat INTEGER;
  -- Adherence
  v_week_start DATE;
  v_week_days_hit INTEGER := 0;
  v_week_days_total INTEGER := 0;
  v_adherence_pct INTEGER := 0;
  -- Weight progress
  v_start_weight DECIMAL;
  v_current_weight DECIMAL;
  v_weight_change DECIMAL;
  -- Avg macros (last 7 days)
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
