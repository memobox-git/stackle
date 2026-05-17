// Test-only Supabase admin helper. Uses the service role key to
// create + verify + delete test users programmatically — no email
// inbox required.
//
// CRITICAL: this file only runs in CI / test contexts. The service
// role key must NEVER ship to the browser. Tests only.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  // Don't throw at import — let tests skip with a clear message.
  // eslint-disable-next-line no-console
  console.warn("[tests] Supabase admin env vars missing. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.");
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

// Create a pre-verified test user. Uses Supabase's admin API with
// email_confirm=true so the magic-link / confirm step is skipped.
// Email pattern: smoke-{timestamp}-{rand}@stackle-test.com — always
// unique, recognizable in dashboards, namespaced for cleanup.
export async function createTestUser(): Promise<TestUser> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `smoke-${ts}-${rand}@stackle-test.com`;
  const password = `SmokeTest!${ts}${rand}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Smoke Test ${rand}`, source: "playwright" },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message ?? "unknown"}`);
  }
  return { id: data.user.id, email, password };
}

// Tear down: delete user + all their rows in drive_files, chats,
// profiles. Runs after every test, even on failure (via afterEach).
export async function deleteTestUser(id: string): Promise<void> {
  const sb = admin();
  // Order matters — drive_files has no ON DELETE CASCADE.
  await sb.from("drive_files").delete().eq("user_id", id);
  await sb.from("chats").delete().eq("user_id", id);
  await sb.from("interview_questions").delete().eq("user_id", id);
  await sb.from("profiles").delete().eq("user_id", id);
  // Finally remove the auth user.
  const { error } = await sb.auth.admin.deleteUser(id);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[tests] deleteTestUser ${id} failed: ${error.message}`);
  }
}

// Sanity check before tests run. Throws with a useful message if
// env vars are missing.
export function assertEnv(): void {
  if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — tests cannot run");
  if (!SERVICE_ROLE) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — tests cannot run");
  if (!process.env.ANTHROPIC_API_KEY) {
    // Anthropic key is required for the analyzer call mid-test. Warn
    // loudly but don't fail import — some tests might run without it.
    // eslint-disable-next-line no-console
    console.warn("[tests] ANTHROPIC_API_KEY not set — agent-dependent assertions will skip");
  }
}
