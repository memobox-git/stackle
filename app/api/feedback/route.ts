// User feedback ingest.
//
// Accepts a small JSON payload from FeedbackButton, validates lightly, and
// inserts into a `feedback` table in Supabase. Designed to never throw on
// the client — always returns a 200/4xx with a clean message so the user
// gets a useful state regardless of backend health.

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "@/lib/rateLimit";

interface FeedbackBody {
  message?: string;
  severity?: "bug" | "suggestion" | "praise";
  email?: string | null;
  pageUrl?: string | null;
  userAgent?: string | null;
  viewport?: string | null;
}

// Lazy client — see notes on /api/reports/save. Creating at module-load
// can crash the build step if env isn't wired up at "collect page data"
// time (first deploy).
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  // Lighter rate limit — feedback is user-driven and infrequent, but we
  // still don't want a script firehosing the table.
  const __rl = rateLimit(req, { limit: 8, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = (await req.json()) as FeedbackBody;
    const message = (body.message ?? "").trim();
    const severity = body.severity ?? "bug";

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "message is too long" }, { status: 413 });
    }
    if (!["bug", "suggestion", "praise"].includes(severity)) {
      return NextResponse.json({ error: "invalid severity" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      // Soft-fail when DB isn't wired so we don't lose the feedback. The
      // simplest fallback is to log it; the user still gets a thank-you.
      console.warn("[feedback] Supabase not configured. Logging only.", { severity, message: message.slice(0, 200), email: body.email, pageUrl: body.pageUrl });
      return NextResponse.json({ ok: true, persisted: false });
    }

    const { error } = await supabase.from("feedback").insert({
      message,
      severity,
      email: body.email?.trim() || null,
      page_url: body.pageUrl?.slice(0, 500) || null,
      user_agent: body.userAgent?.slice(0, 500) || null,
      viewport: body.viewport?.slice(0, 30) || null,
    });

    if (error) {
      console.error("[feedback] Supabase insert failed:", error.message);
      // Still return 200 — better UX is "we got it" than an angry red box.
      // The console.error gives us the trail to debug if it matters.
      return NextResponse.json({ ok: true, persisted: false });
    }

    return NextResponse.json({ ok: true, persisted: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[feedback] Route error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
