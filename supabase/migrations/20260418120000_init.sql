-- Tutor AI — initial schema (Phase 1)
-- Tables, enums, RLS (tutor-owned rows), moddatetime triggers,
-- and auto-creation of a tutors row per auth.users signup.

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE course_status     AS ENUM ('draft', 'active', 'archived');
CREATE TYPE session_status    AS ENUM ('scheduled', 'completed', 'cancelled');
CREATE TYPE material_type     AS ENUM ('worksheet', 'quiz', 'rubric', 'notes', 'slides');
CREATE TYPE chat_scope_type   AS ENUM ('general', 'course', 'student');
CREATE TYPE message_role      AS ENUM ('user', 'assistant');

-- ============================================================
-- tutors (1:1 with auth.users)
-- ============================================================
CREATE TABLE tutors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT,
  subjects             TEXT[] NOT NULL DEFAULT '{}',
  bio                  TEXT,

  -- Onboarding — filled by the 3-step flow; onboarded_at is the gate.
  avatar_url           TEXT,
  resume_storage_path  TEXT,                               -- path inside `tutor-resumes` bucket
  resume_extracted     JSONB,                              -- parsed resume cache for agents
  interests            TEXT[] NOT NULL DEFAULT '{}',
  years_teaching       INT,
  levels_taught        TEXT[] NOT NULL DEFAULT '{}',
  timezone             TEXT,
  teaching_style       TEXT,
  onboarded_at         TIMESTAMPTZ,                        -- NULL → /dashboard redirects to /onboarding

  -- home_chat_id FK added after chats table is created (forward ref).
  home_chat_id         UUID,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create a tutors row on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tutors (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- students
-- parent_contact expected shape: { name?, email?, phone?, relationship? }
-- (all optional; typed in TS; DB only enforces "is an object").
-- ============================================================
CREATE TABLE students (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id       UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  level          TEXT,
  subjects       TEXT[] NOT NULL DEFAULT '{}',
  goals          TEXT,
  parent_contact JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(parent_contact) = 'object'),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX students_tutor_id_idx ON students(tutor_id);

-- ============================================================
-- courses / units / enrollments
-- ============================================================
CREATE TABLE courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id    UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  subject     TEXT,
  level       TEXT,
  description TEXT,
  status      course_status NOT NULL DEFAULT 'draft',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX courses_tutor_id_idx ON courses(tutor_id);

CREATE TABLE units (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  objectives       TEXT[] NOT NULL DEFAULT '{}',
  order_index      INT NOT NULL,
  duration_minutes INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Deferrable so reorder_units can shuffle indices inside a transaction.
  CONSTRAINT units_course_order_unique UNIQUE (course_id, order_index)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX units_course_id_idx ON units(course_id);

CREATE TABLE course_enrollments (
  course_id   UUID NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (course_id, student_id)
);
CREATE INDEX course_enrollments_student_idx ON course_enrollments(student_id);

-- ============================================================
-- materials (unit-owned content; assigned to students M:N)
-- ============================================================
CREATE TABLE materials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_tutor_id UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  unit_id        UUID REFERENCES units(id) ON DELETE SET NULL,
  type           material_type NOT NULL,
  title          TEXT NOT NULL,
  content        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX materials_owner_idx ON materials(owner_tutor_id);
CREATE INDEX materials_unit_idx  ON materials(unit_id);

CREATE TABLE material_assignments (
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id)  ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'assigned',
  PRIMARY KEY (material_id, student_id)
);
CREATE INDEX material_assignments_student_idx ON material_assignments(student_id);

-- ============================================================
-- sessions
-- cancelled_at is a soft-delete marker so tutors retain cancellation history.
-- status='cancelled' and cancelled_at should be set together by the app.
-- ============================================================
CREATE TABLE sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id         UUID NOT NULL REFERENCES tutors(id)   ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INT,
  status           session_status NOT NULL DEFAULT 'scheduled',
  cancelled_at     TIMESTAMPTZ,
  pre_brief        TEXT,
  recap            TEXT,
  homework         TEXT,
  linked_unit_id   UUID REFERENCES units(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_tutor_time_idx ON sessions(tutor_id, scheduled_at);
CREATE INDEX sessions_student_idx    ON sessions(student_id);

-- ============================================================
-- chats / messages
-- Scope is split into two typed FKs + a CHECK that mirrors scope_type.
-- deleted_at is a soft-delete marker for archived threads (chats only).
-- ============================================================
CREATE TABLE chats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id         UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  title            TEXT,
  -- Which agent config owns this thread. Set at chat creation, immutable
  -- (app-enforced — no trigger for MVP). Text + CHECK (not enum) so adding
  -- agents later is a codegen change, not a DDL migration.
  agent_id         TEXT NOT NULL CHECK (agent_id IN ('courseCreator', 'tutorAssistant')),
  scope_type       chat_scope_type NOT NULL DEFAULT 'general',
  scope_course_id  UUID REFERENCES courses(id)  ON DELETE CASCADE,
  scope_student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chats_scope_consistency CHECK (
    CASE scope_type
      WHEN 'general' THEN scope_course_id IS NULL     AND scope_student_id IS NULL
      WHEN 'course'  THEN scope_course_id IS NOT NULL AND scope_student_id IS NULL
      WHEN 'student' THEN scope_course_id IS NULL     AND scope_student_id IS NOT NULL
    END
  )
);
-- Partial: sidebar filters out archived chats.
CREATE INDEX chats_active_idx         ON chats(tutor_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX chats_scope_course_idx   ON chats(scope_course_id)  WHERE scope_course_id  IS NOT NULL;
CREATE INDEX chats_scope_student_idx  ON chats(scope_student_id) WHERE scope_student_id IS NOT NULL;

CREATE TABLE messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role       message_role NOT NULL,
  -- Anthropic content-blocks array; enables replay of tool_use/tool_result turns.
  content    JSONB NOT NULL,
  -- UI-renderable cards extracted from tool outputs: [{type,id,data}, ...]
  artifacts  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX messages_chat_idx ON messages(chat_id, created_at);

-- ============================================================
-- tutors.home_chat_id FK (forward reference resolved here)
-- ============================================================
ALTER TABLE tutors
  ADD CONSTRAINT tutors_home_chat_fk
    FOREIGN KEY (home_chat_id) REFERENCES chats(id) ON DELETE SET NULL;

-- ============================================================
-- updated_at triggers (moddatetime extension)
-- ============================================================
CREATE TRIGGER tutors_moddatetime    BEFORE UPDATE ON tutors    FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
CREATE TRIGGER students_moddatetime  BEFORE UPDATE ON students  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
CREATE TRIGGER courses_moddatetime   BEFORE UPDATE ON courses   FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
CREATE TRIGGER units_moddatetime     BEFORE UPDATE ON units     FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
CREATE TRIGGER materials_moddatetime BEFORE UPDATE ON materials FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
CREATE TRIGGER sessions_moddatetime  BEFORE UPDATE ON sessions  FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);
CREATE TRIGGER chats_moddatetime     BEFORE UPDATE ON chats     FOR EACH ROW EXECUTE PROCEDURE moddatetime (updated_at);

-- ============================================================
-- RLS — every policy chains through tutors.user_id = auth.uid()
-- ============================================================
ALTER TABLE tutors                ENABLE ROW LEVEL SECURITY;
ALTER TABLE students              ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE units                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials             ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages              ENABLE ROW LEVEL SECURITY;

-- tutors: self-row only. Insert handled by on_auth_user_created trigger;
-- delete cascades from auth.users deletion.
CREATE POLICY tutors_self_select ON tutors FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY tutors_self_update ON tutors FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- students
CREATE POLICY students_owner_all ON students FOR ALL
  USING      (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()))
  WITH CHECK (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()));

-- courses
CREATE POLICY courses_owner_all ON courses FOR ALL
  USING      (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()))
  WITH CHECK (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()));

-- units (owned transitively via course.tutor)
CREATE POLICY units_owner_all ON units FOR ALL
  USING (course_id IN (
    SELECT c.id FROM courses c
    JOIN tutors t ON t.id = c.tutor_id
    WHERE t.user_id = auth.uid()
  ))
  WITH CHECK (course_id IN (
    SELECT c.id FROM courses c
    JOIN tutors t ON t.id = c.tutor_id
    WHERE t.user_id = auth.uid()
  ));

-- course_enrollments (owned via course)
CREATE POLICY enrollments_owner_all ON course_enrollments FOR ALL
  USING (course_id IN (
    SELECT c.id FROM courses c
    JOIN tutors t ON t.id = c.tutor_id
    WHERE t.user_id = auth.uid()
  ))
  WITH CHECK (course_id IN (
    SELECT c.id FROM courses c
    JOIN tutors t ON t.id = c.tutor_id
    WHERE t.user_id = auth.uid()
  ));

-- materials
CREATE POLICY materials_owner_all ON materials FOR ALL
  USING      (owner_tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()))
  WITH CHECK (owner_tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()));

-- material_assignments (owned via material)
CREATE POLICY material_assignments_owner_all ON material_assignments FOR ALL
  USING (material_id IN (
    SELECT m.id FROM materials m
    JOIN tutors t ON t.id = m.owner_tutor_id
    WHERE t.user_id = auth.uid()
  ))
  WITH CHECK (material_id IN (
    SELECT m.id FROM materials m
    JOIN tutors t ON t.id = m.owner_tutor_id
    WHERE t.user_id = auth.uid()
  ));

-- sessions
CREATE POLICY sessions_owner_all ON sessions FOR ALL
  USING      (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()))
  WITH CHECK (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()));

-- chats
CREATE POLICY chats_owner_all ON chats FOR ALL
  USING      (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()))
  WITH CHECK (tutor_id IN (SELECT id FROM tutors WHERE user_id = auth.uid()));

-- messages (owned via chat → tutor)
CREATE POLICY messages_owner_all ON messages FOR ALL
  USING (chat_id IN (
    SELECT ch.id FROM chats ch
    JOIN tutors t ON t.id = ch.tutor_id
    WHERE t.user_id = auth.uid()
  ))
  WITH CHECK (chat_id IN (
    SELECT ch.id FROM chats ch
    JOIN tutors t ON t.id = ch.tutor_id
    WHERE t.user_id = auth.uid()
  ));

-- ============================================================
-- Storage buckets
-- Path convention: `{user_id}/filename.ext`; the first folder segment
-- equals the owner's auth.uid(), enforced by the policies below.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('tutor-avatars', 'tutor-avatars', true,  5242880,
     ARRAY['image/jpeg','image/png','image/webp']),
  ('tutor-resumes', 'tutor-resumes', false, 10485760,
     ARRAY['application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- tutor-avatars: public read, owner-only write.
CREATE POLICY tutor_avatars_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'tutor-avatars');
CREATE POLICY tutor_avatars_owner_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tutor-avatars'
              AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY tutor_avatars_owner_update ON storage.objects FOR UPDATE
  USING      (bucket_id = 'tutor-avatars'
              AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'tutor-avatars'
              AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY tutor_avatars_owner_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'tutor-avatars'
         AND (storage.foldername(name))[1] = auth.uid()::text);

-- tutor-resumes: owner-only everything.
CREATE POLICY tutor_resumes_owner_all ON storage.objects FOR ALL
  USING      (bucket_id = 'tutor-resumes'
              AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'tutor-resumes'
              AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Backfill existing auth.users into tutors
-- One-time; idempotent via NOT IN guard. onboarded_at stays NULL
-- so they land on /onboarding on next login.
-- ============================================================
INSERT INTO tutors (user_id, name)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'name', u.email)
FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM tutors);
