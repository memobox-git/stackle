// Supabase CRUD helpers for Job Match.
//
// Each job_matches row is one application the user is working on.
// job_match_outputs holds lazy-generated tab content (Match verdict,
// tailored resume, cover letter, study plan, interview prep). Tab
// outputs cache so re-opening doesn't re-burn API calls.
//
// RLS is enforced server-side; these helpers just shape queries.

import { getSupabaseClient } from "./client";

export type JobMatchStatus =
  | "analyzing"
  | "ready"
  | "applied"
  | "interviewing"
  | "rejected"
  | "offered"
  | "skipped";

export type JobMatchOutputType =
  | "jd"
  | "match"
  | "resume"
  | "cover"
  | "study"
  | "prep";

export interface JobMatch {
  id: string;
  user_id: string;
  url: string | null;
  raw_jd_text: string;
  company: string | null;
  role: string | null;
  location: string | null;
  seniority_level: string | null;
  parsed_jd: unknown | null; // JDAnalysis shape — keep loose for forward compat
  status: JobMatchStatus;
  resume_snapshot_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobMatchOutput {
  id: string;
  job_match_id: string;
  output_type: JobMatchOutputType;
  content: unknown;
  drive_file_id: string | null;
  model_used: string | null;
  tokens_used: number | null;
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Reads

export async function listJobMatches(): Promise<JobMatch[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("job_matches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[jobMatches.list] failed:", error.message);
    return [];
  }
  return (data ?? []) as JobMatch[];
}

export async function getJobMatch(id: string): Promise<JobMatch | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("job_matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.warn("[jobMatches.get] failed:", error.message);
    return null;
  }
  return (data as JobMatch | null) ?? null;
}

export async function getJobMatchOutputs(
  jobMatchId: string,
): Promise<JobMatchOutput[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("job_match_outputs")
    .select("*")
    .eq("job_match_id", jobMatchId);
  if (error) {
    console.warn("[jobMatches.outputs] failed:", error.message);
    return [];
  }
  return (data ?? []) as JobMatchOutput[];
}

// ─────────────────────────────────────────────────────────────
// Writes

export async function createJobMatch(input: {
  url?: string | null;
  rawJdText: string;
  parsed?: {
    company?: string | null;
    role?: string | null;
    location?: string | null;
    seniorityLevel?: string | null;
    parsedJd?: unknown | null;
  };
  resumeSnapshotId?: string | null;
}): Promise<JobMatch | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn("[jobMatches.create] no user — cannot persist");
    return null;
  }
  const { data, error } = await supabase
    .from("job_matches")
    .insert({
      user_id: user.id,
      url: input.url ?? null,
      raw_jd_text: input.rawJdText,
      company: input.parsed?.company ?? null,
      role: input.parsed?.role ?? null,
      location: input.parsed?.location ?? null,
      seniority_level: input.parsed?.seniorityLevel ?? null,
      parsed_jd: input.parsed?.parsedJd ?? null,
      status: input.parsed?.parsedJd ? "ready" : "analyzing",
      resume_snapshot_id: input.resumeSnapshotId ?? null,
    })
    .select()
    .single();
  if (error) {
    console.warn("[jobMatches.create] failed:", error.message);
    return null;
  }
  return data as JobMatch;
}

export async function updateJobMatch(
  id: string,
  patch: Partial<Pick<JobMatch, "status" | "company" | "role" | "location" | "seniority_level" | "parsed_jd">>,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("job_matches")
    .update(patch)
    .eq("id", id);
  if (error) console.warn("[jobMatches.update] failed:", error.message);
}

export async function deleteJobMatch(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("job_matches").delete().eq("id", id);
  if (error) console.warn("[jobMatches.delete] failed:", error.message);
}

// ─────────────────────────────────────────────────────────────
// Output cache — one row per (job_match_id, output_type). Upsert
// semantics: regenerating overwrites the prior row.

export async function upsertJobMatchOutput(input: {
  jobMatchId: string;
  outputType: JobMatchOutputType;
  content: unknown;
  driveFileId?: string | null;
  modelUsed?: string | null;
  tokensUsed?: number | null;
}): Promise<JobMatchOutput | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("job_match_outputs")
    .upsert(
      {
        job_match_id: input.jobMatchId,
        output_type: input.outputType,
        content: input.content as object,
        drive_file_id: input.driveFileId ?? null,
        model_used: input.modelUsed ?? null,
        tokens_used: input.tokensUsed ?? null,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "job_match_id,output_type" },
    )
    .select()
    .single();
  if (error) {
    console.warn("[jobMatches.upsertOutput] failed:", error.message);
    return null;
  }
  return data as JobMatchOutput;
}

