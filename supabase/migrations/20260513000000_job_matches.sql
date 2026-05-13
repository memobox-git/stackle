-- ============================================================
-- Job Match V1 schema
-- ============================================================
--
-- Each job_matches row is one application. job_match_outputs
-- holds the lazy-generated tab content (match verdict, tailored
-- resume, cover letter, study plan, interview prep). Outputs
-- cache so re-opening a match doesn't re-burn API calls.
--
-- RLS: a user can only read/write their own rows. job_match_outputs
-- inherits the parent's ownership through the join.

CREATE TABLE IF NOT EXISTS job_matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source
  url               text,
  raw_jd_text       text NOT NULL,

  -- Parsed identity (denormalised from parsed_jd for cheap list rendering)
  company           text,
  role              text,
  location          text,
  seniority_level   text,

  -- Full structured parse (output of runJDAnalyzer)
  parsed_jd         jsonb,

  -- Application lifecycle
  status            text NOT NULL DEFAULT 'analyzing'
                    CHECK (status IN ('analyzing','ready','applied','interviewing','rejected','offered','skipped')),

  -- Which resume was active when this match was created. Frozen so
  -- the user can change their primary resume later without invalidating
  -- prior matches' verdicts.
  resume_snapshot_id uuid REFERENCES drive_files(id) ON DELETE SET NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_matches_user_id_created_at_idx
  ON job_matches (user_id, created_at DESC);

ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_matches_owner_select ON job_matches
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY job_matches_owner_insert ON job_matches
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_matches_owner_update ON job_matches
  FOR UPDATE USING (auth.uid() = user_id)
             WITH CHECK (auth.uid() = user_id);
CREATE POLICY job_matches_owner_delete ON job_matches
  FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at on any row change.
CREATE OR REPLACE FUNCTION touch_job_matches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_matches_touch_updated_at ON job_matches;
CREATE TRIGGER job_matches_touch_updated_at
  BEFORE UPDATE ON job_matches
  FOR EACH ROW EXECUTE FUNCTION touch_job_matches_updated_at();

-- ============================================================
-- job_match_outputs — lazy-generated tab artifacts.
-- ============================================================

CREATE TABLE IF NOT EXISTS job_match_outputs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_match_id    uuid NOT NULL REFERENCES job_matches(id) ON DELETE CASCADE,

  -- One of: 'jd' | 'match' | 'resume' | 'cover' | 'study' | 'prep'
  output_type     text NOT NULL
                  CHECK (output_type IN ('jd','match','resume','cover','study','prep')),

  -- Tab-specific structured output (shape depends on output_type)
  content         jsonb NOT NULL,

  -- If this output was also persisted as a downloadable artifact in Drive
  drive_file_id   uuid REFERENCES drive_files(id) ON DELETE SET NULL,

  -- Cost / model tracking for analytics. Optional.
  model_used      text,
  tokens_used     int,

  generated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_match_outputs_match_type_idx
  ON job_match_outputs (job_match_id, output_type);

-- One output per (match, type) — re-generation replaces.
CREATE UNIQUE INDEX IF NOT EXISTS job_match_outputs_unique_per_type
  ON job_match_outputs (job_match_id, output_type);

ALTER TABLE job_match_outputs ENABLE ROW LEVEL SECURITY;

-- RLS via join: a user can access output rows whose parent job_match
-- they own. Saves having to duplicate user_id on every output row.
CREATE POLICY job_match_outputs_owner_select ON job_match_outputs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM job_matches m
      WHERE m.id = job_match_outputs.job_match_id
        AND m.user_id = auth.uid()
    )
  );
CREATE POLICY job_match_outputs_owner_insert ON job_match_outputs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_matches m
      WHERE m.id = job_match_outputs.job_match_id
        AND m.user_id = auth.uid()
    )
  );
CREATE POLICY job_match_outputs_owner_update ON job_match_outputs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM job_matches m
      WHERE m.id = job_match_outputs.job_match_id
        AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_matches m
      WHERE m.id = job_match_outputs.job_match_id
        AND m.user_id = auth.uid()
    )
  );
CREATE POLICY job_match_outputs_owner_delete ON job_match_outputs
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM job_matches m
      WHERE m.id = job_match_outputs.job_match_id
        AND m.user_id = auth.uid()
    )
  );
