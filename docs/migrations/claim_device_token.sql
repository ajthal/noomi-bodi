-- Migration: Add claim_device_token RPC
-- When a user registers a device token, remove any stale entries
-- for the same FCM token that belong to a different user (e.g. after
-- sign-out / sign-in with a different account on the same device).
-- Run this in the Supabase SQL Editor.

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
