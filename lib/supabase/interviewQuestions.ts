// CRUD for the interview_questions cache table.
//
// Generator-produced questions get saved here so subsequent drill
// sessions can reuse them without re-paying Sonnet. Questions are
// keyed by skill + difficulty, scoped to a user when resume-grounded
// (NULL user = shareable across users).
//
// The id column uses the same string id format the generator emits
// ("gen-<skill>-<ts>-<idx>") so client-side seen-id tracking from
// localStorage correlates without a separate uuid round-trip.

import { getSupabaseClient } from "./client";
import type { InterviewQuestion, Difficulty } from "@/lib/agents/interview/questionBank/types";

export interface CachedQuestion {
  id: string;
  user_id: string | null;
  skill: string;
  difficulty: Difficulty;
  payload: InterviewQuestion;
  resume_grounded: boolean;
  created_at: string;
}

/**
 * Pull cached questions matching skill + difficulty, excluding any ids
 * the caller has already seen. Returns at most `limit` rows ordered
 * by creation date descending (newest first).
 *
 * The query trusts RLS to scope (own questions OR shareable NULL-user
 * questions). The route caller is responsible for passing the
 * authenticated supabase client.
 */
export async function loadCachedQuestions(opts: {
  skill: string;
  difficulty: Difficulty;
  excludeIds: string[];
  limit: number;
}): Promise<CachedQuestion[]> {
  const supabase = getSupabaseClient();
  let q = supabase
    .from("interview_questions")
    .select("id, user_id, skill, difficulty, payload, resume_grounded, created_at")
    .ilike("skill", opts.skill)
    .eq("difficulty", opts.difficulty)
    .order("created_at", { ascending: false })
    .limit(opts.limit);

  if (opts.excludeIds.length > 0) {
    // Postgres "id not in (a, b, c)" — supabase handles the array.
    q = q.not("id", "in", `(${opts.excludeIds.map((i) => `"${i}"`).join(",")})`);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[interviewQuestions] loadCachedQuestions error:", error.message);
    return [];
  }
  return (data ?? []) as CachedQuestion[];
}

/**
 * Bulk-insert newly-generated questions into the cache. Resume-grounded
 * questions get user_id set (private to the caller); generic ones use
 * NULL user_id (shareable across users).
 *
 * Looks up the authenticated user via the supabase session so callers
 * don't have to pass the id. If there's no session (anonymous user),
 * we silently skip the save — RLS would reject it anyway and a noisy
 * error doesn't help.
 *
 * Failures are logged but not thrown — the cache is a best-effort
 * optimization, not a critical path.
 */
export async function saveQuestions(opts: {
  questions: InterviewQuestion[];
  resumeGrounded: boolean;
}): Promise<void> {
  if (opts.questions.length === 0) return;
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // anon user — RLS rejects all inserts, skip.

  const rows = opts.questions.map((q) => ({
    id: q.id,
    user_id: opts.resumeGrounded ? user.id : null,
    skill: q.category,
    difficulty: q.difficulty,
    payload: q,
    resume_grounded: opts.resumeGrounded,
  }));
  const { error } = await supabase
    .from("interview_questions")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.warn("[interviewQuestions] saveQuestions error:", error.message);
  }
}
