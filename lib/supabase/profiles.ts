// Stackle V2 profile helpers.
//
// Profile data sources:
//   - username, first_name, last_name set explicitly at signup
//   - Everything else (headline, summary, location, years, skills)
//     derived automatically from the user's resume on parse.
//
// We reuse the existing `profiles` table (legacy tutor schema)
// rather than creating a parallel table — see migration
// 20260513010000_profiles_stackle_v2.sql for the field mapping.

import { getSupabaseClient } from "./client";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

export interface UserProfile {
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  professional_title: string | null;  // = headline
  professional_summary: string | null; // = summary
  location: string | null;
  years_experience: number | null;
  skills: string[] | null;             // = top_skills
  source_resume_id: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Reads

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, first_name, last_name, professional_title, professional_summary, location, years_experience, skills, source_resume_id, is_public, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.warn("[profiles.get] failed:", error.message);
    return null;
  }
  return (data as UserProfile | null) ?? null;
}

// True if the username is free (case-insensitive). Used by the
// post-signup intake to live-validate as the user types.
export async function isUsernameAvailable(candidate: string): Promise<boolean> {
  const lower = candidate.trim().toLowerCase();
  if (!isValidUsername(lower)) return false;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("username", lower)
    .limit(1);
  if (error) {
    console.warn("[profiles.isUsernameAvailable] failed:", error.message);
    return false;
  }
  return (data ?? []).length === 0;
}

export function isValidUsername(s: string): boolean {
  // 3-20 chars, lowercase letters / digits / hyphen.
  // Must start with a letter, no trailing hyphen.
  return /^[a-z][a-z0-9-]{1,18}[a-z0-9]$/.test(s);
}

// Suggest a username from a name or email. Used to pre-fill the intake
// field. Strips diacritics, lowercases, hyphenates whitespace, trims.
export function suggestUsernameFrom(input: { fullName?: string | null; email?: string | null }): string {
  const seed =
    (input.fullName && input.fullName.trim()) ||
    (input.email && input.email.split("@")[0]) ||
    "";
  if (!seed) return "";
  const ascii = seed
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, "")
    .replace(/[.\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Ensure it satisfies isValidUsername — pad short ones, trim long ones,
  // ensure starts with letter, no trailing hyphen.
  let s = ascii;
  if (!/^[a-z]/.test(s)) s = "u-" + s;
  if (s.length < 3) s = (s + "user").slice(0, 6);
  if (s.length > 20) s = s.slice(0, 20).replace(/-+$/, "");
  if (!/[a-z0-9]$/.test(s)) s = s.slice(0, -1);
  return s;
}

// ─────────────────────────────────────────────────────────────
// Writes

export async function setUsername(input: {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const username = input.username.trim().toLowerCase();
  if (!isValidUsername(username)) return { ok: false, error: "Invalid username format" };

  // First check uniqueness against everyone except yourself.
  const { data: clash } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("username", username)
    .neq("user_id", user.id)
    .limit(1);
  if ((clash ?? []).length > 0) return { ok: false, error: "Username already taken" };

  // Upsert. Falls through to update if a row exists, insert otherwise.
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        username,
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
      },
      { onConflict: "user_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Auto-build profile fields from a parsed resume. Called from the
// resume-upload handler. Reuses skillGroups → flat top skills (15),
// summary → professional_summary, latest job → professional_title.
export async function buildProfileFromResume(input: {
  extraction: ResumeExtraction;
  sourceResumeId?: string | null;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { extraction } = input;
  const latest = extraction.experience?.[0];
  const headline = latest
    ? (latest.company ? `${latest.title} at ${latest.company}` : latest.title)
    : null;
  const topSkills = (extraction.skillGroups ?? [])
    .flatMap((g) => g.skills ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 15);

  // Split full name → first / last if we don't already have them.
  // Only write first/last if they're currently null — username intake
  // is the canonical source there.
  const fullName = (extraction.name ?? "").trim();
  const [first, ...rest] = fullName.split(/\s+/);
  const last = rest.join(" ");

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        // Only seed first/last if we have a real value; the username
        // intake fills these for email signups, Google for OAuth.
        ...(first ? { first_name: first } : {}),
        ...(last ? { last_name: last } : {}),
        professional_title: headline,
        professional_summary: extraction.summary ?? null,
        location: extraction.location ?? null,
        years_experience: typeof extraction.totalYearsExperience === "number" ? extraction.totalYearsExperience : null,
        skills: topSkills.length > 0 ? topSkills : null,
        source_resume_id: input.sourceResumeId ?? null,
      },
      { onConflict: "user_id" },
    );
  if (error) {
    console.warn("[profiles.buildFromResume] failed:", error.message);
  }
}
