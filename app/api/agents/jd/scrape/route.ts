// JD URL Scraper endpoint. POST { url } → ScrapeResult.
// Best-effort fetch + extract for Greenhouse / Lever / Ashby / generic
// company pages. JS-heavy sites (Workday, Indeed, Glassdoor, LinkedIn)
// return needsManual=true with an honest error.

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { runJDScraper } from "@/lib/agents/jd/runJDScraper";

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = await req.json() as { url?: string };
    if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });
    const result = await runJDScraper(body.url);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[jd/scrape]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown" }, { status: 500 });
  }
}
