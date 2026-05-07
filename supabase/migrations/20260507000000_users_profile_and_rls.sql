-- Stackle V2 — users profile table + RLS hardening
--
-- Per the auth spec:
--   - Public-schema users profile row (1:1 with auth.users)
--   - Auto-create on sign-up
--   - Subscription tier, recruiter pack flag, tutor approval flag
--   - RLS: users can only see + edit their own row
--   - Existing tables (chats, drive_files, feedback, etc.) get RLS
--     policies if they don't already have them
--
-- Run this from the Supabase SQL editor or `supabase db push`. It's
-- idempotent — IF NOT EXISTS / DROP POLICY IF EXISTS guards throughout.

-- ============================================================
-- users — public profile row (1:1 with auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                TEXT NOT NULL,
  full_name            TEXT,
  avatar_url           TEXT,
  target_role          TEXT,
  linkedin_url         TEXT,
  has_recruiter_pack   BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved_tutor    BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_tier    TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'max')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row changes.
CREATE OR REPLACE FUNCTION public.touch_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS users_touch_updated_at ON public.users;
CREATE TRIGGER users_touch_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_users_updated_at();

-- ============================================================
-- Auto-create a profile row when a new auth.users row appears.
-- Pulls email + raw_user_meta_data fields (full_name, avatar_url) from
-- the auth row so OAuth sign-ups land with a populated profile.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_stackle_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_stackle ON auth.users;
CREATE TRIGGER on_auth_user_created_stackle
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_stackle_user();

-- ============================================================
-- RLS — users
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users select own" ON public.users;
CREATE POLICY "users select own" ON public.users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users update own" ON public.users;
CREATE POLICY "users update own" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- INSERT goes through the trigger; users themselves don't insert.
-- DELETE cascades from auth.users; explicit policy not needed.

-- ============================================================
-- RLS hardening for existing Stackle tables
-- The tables below may or may not already exist in your project. Each
-- block guards with `IF EXISTS`. Adjust column names if your schema differs.
-- ============================================================

DO $$
BEGIN
  -- chats
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chats') THEN
    EXECUTE 'ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "chats select own" ON public.chats';
    EXECUTE 'CREATE POLICY "chats select own" ON public.chats FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS "chats insert own" ON public.chats';
    EXECUTE 'CREATE POLICY "chats insert own" ON public.chats FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS "chats update own" ON public.chats';
    EXECUTE 'CREATE POLICY "chats update own" ON public.chats FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS "chats delete own" ON public.chats';
    EXECUTE 'CREATE POLICY "chats delete own" ON public.chats FOR DELETE USING (auth.uid() = user_id)';
  END IF;

  -- drive_files
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'drive_files') THEN
    EXECUTE 'ALTER TABLE public.drive_files ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "drive_files select own" ON public.drive_files';
    EXECUTE 'CREATE POLICY "drive_files select own" ON public.drive_files FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS "drive_files insert own" ON public.drive_files';
    EXECUTE 'CREATE POLICY "drive_files insert own" ON public.drive_files FOR INSERT WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS "drive_files update own" ON public.drive_files';
    EXECUTE 'CREATE POLICY "drive_files update own" ON public.drive_files FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS "drive_files delete own" ON public.drive_files';
    EXECUTE 'CREATE POLICY "drive_files delete own" ON public.drive_files FOR DELETE USING (auth.uid() = user_id)';
  END IF;

  -- feedback
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feedback') THEN
    EXECUTE 'ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "feedback insert own" ON public.feedback';
    EXECUTE 'CREATE POLICY "feedback insert own" ON public.feedback FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL)';
    EXECUTE 'DROP POLICY IF EXISTS "feedback select own" ON public.feedback';
    EXECUTE 'CREATE POLICY "feedback select own" ON public.feedback FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ============================================================
-- Backfill: create profile rows for any existing auth.users that
-- don't yet have one. Safe to run repeatedly.
-- ============================================================
INSERT INTO public.users (id, email, full_name, avatar_url)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
FROM auth.users u
LEFT JOIN public.users p ON p.id = u.id
WHERE p.id IS NULL;
