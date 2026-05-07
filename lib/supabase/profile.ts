// Profile helpers for the Stackle users table (1:1 with auth.users).
// The DB trigger handle_new_stackle_user creates a profile row on
// auth.users INSERT — these helpers cover read + update from the client.

import { getSupabaseClient } from "./client";

export interface StackleUserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  target_role: string | null;
  linkedin_url: string | null;
  has_recruiter_pack: boolean;
  is_approved_tutor: boolean;
  subscription_tier: "free" | "pro" | "max";
  created_at: string;
  updated_at: string;
}

export async function loadProfile(): Promise<StackleUserProfile | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    // Likely the profile row hasn't been created yet (trigger lag) —
    // create it client-side as a defensive fallback.
    console.warn("[profile] load failed, attempting upsert:", error.message);
    const { data: upserted, error: upsertErr } = await supabase
      .from("users")
      .upsert({
        id: user.id,
        email: user.email ?? "",
        full_name: (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? null,
        avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? (user.user_metadata?.picture as string | undefined) ?? null,
      }, { onConflict: "id" })
      .select()
      .single();
    if (upsertErr) { console.warn("[profile] upsert failed:", upsertErr.message); return null; }
    return upserted as StackleUserProfile;
  }

  return data as StackleUserProfile;
}

export async function updateProfile(patch: Partial<Omit<StackleUserProfile, "id" | "email" | "created_at" | "updated_at">>): Promise<StackleUserProfile | null> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", user.id)
    .select()
    .single();

  if (error) { console.warn("[profile] update failed:", error.message); return null; }
  return data as StackleUserProfile;
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
  if (typeof window !== "undefined") {
    window.location.href = "/signin";
  }
}
