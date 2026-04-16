-- AI memory column: persistent, distilled facts Noomi should remember about the user.
-- Populated by a dedicated extraction step before chat history is auto-cleared, so
-- personalization survives clearing `@chat_messages` and `@conversation_summary` on-device.
--
-- Lives on `profiles` only (never on `public_profiles`), so other users can never read it.
-- Existing RLS on `profiles` restricts SELECT/UPDATE to `auth.uid() = id`.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_memory TEXT NOT NULL DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_memory_updated_at TIMESTAMPTZ;
