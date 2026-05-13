-- ============================================================
-- Stackle V2 profile fields — added to the existing legacy
-- `profiles` table (which already had user_id + username +
-- first_name + last_name + professional_title + bio).
-- ============================================================
-- We reuse the existing columns rather than creating a parallel
-- table:
--   display_name        ← derive from first_name + last_name
--   headline            ← write to professional_title
--   summary             ← write to professional_summary
--   top_skills          ← reuse existing `skills` text[]
--
-- Net-new columns this migration adds:
--   location            ← from resume.location (city/state/country string)
--   years_experience    ← from resume.totalYearsExperience
--   source_resume_id    ← which Drive resume seeded these fields
--   is_public           ← controls whether /u/{username} is reachable

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS years_experience numeric;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source_resume_id uuid REFERENCES drive_files(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Public-by-flag read: anyone can read profiles where is_public = true.
-- Powers the future /u/{username} page without needing service-role.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_public_read'
  ) THEN
    EXECUTE 'CREATE POLICY profiles_public_read ON profiles FOR SELECT USING (is_public = true)';
  END IF;
END $$;
