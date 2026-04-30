// Best-effort JD URL fetcher.
//
// User pastes a job-posting URL, we fetch it server-side, strip the HTML
// down to visible text, return it for the JD match modal to use as input.
//
// IMPORTANT: this is best-effort. LinkedIn / Indeed / Glassdoor return
// 401 / 403 / Cloudflare challenges to non-browser fetches, and we do not
// run a headless browser. The UI surfaces the failure gracefully and
// asks the user to paste the JD text instead.

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";

interface JDFetchRequest {
  url: string;
}

// Hosts we know we can't fetch reliably. We fail fast with a useful message
// instead of timing out / returning 60 lines of CSS junk.
const KNOWN_BLOCKED = [
  /linkedin\.com/i,
  /indeed\.com/i,
  /glassdoor\.com/i,
  /ziprecruiter\.com/i,
];

function stripHtml(html: string): string {
  // Drop script/style/nav/footer entirely (they're always noise).
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  // Common JD wrappers — keep only their inner text.
  // Most ATS pages put the description inside <article>, <main>, or a div
  // with class containing "description" / "job" / "posting".
  const main = /<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i.exec(s);
  if (main && main[1].length > 500) s = main[1];

  // Strip the rest of the tags.
  s = s.replace(/<\/?[^>]+>/g, " ");

  // HTML entities — minimal decoding.
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Whitespace collapse.
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 15, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;

  try {
    const { url } = (await req.json()) as JDFetchRequest;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Not a valid URL." }, { status: 400 });
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      return NextResponse.json({ error: "Only http(s) URLs supported." }, { status: 400 });
    }

    if (KNOWN_BLOCKED.some((re) => re.test(parsed.hostname))) {
      return NextResponse.json(
        {
          error: `${parsed.hostname} blocks server-side fetches. Open the posting in your browser and paste the JD text instead.`,
          blocked: true,
        },
        { status: 422 },
      );
    }

    // 12s hard timeout — most career pages respond in under 3s; anything
    // hanging this long is almost always a bot challenge.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);

    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          // Pretend to be a desktop browser — most ATS pages serve different
          // markup to non-browser UAs.
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      const aborted = err instanceof Error && err.name === "AbortError";
      return NextResponse.json(
        {
          error: aborted
            ? "The page took too long to load. Try pasting the JD text instead."
            : "Couldn't reach that URL. Paste the JD text instead.",
        },
        { status: 502 },
      );
    }
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `That site returned ${res.status}. Paste the JD text instead.`,
        },
        { status: 502 },
      );
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct)) {
      return NextResponse.json(
        { error: "That URL doesn't return an HTML page." },
        { status: 415 },
      );
    }

    const html = await res.text();
    if (html.length > 2_000_000) {
      return NextResponse.json(
        { error: "That page is suspiciously huge. Paste the JD text instead." },
        { status: 413 },
      );
    }

    const text = stripHtml(html);
    if (text.length < 200) {
      return NextResponse.json(
        {
          error:
            "We could fetch the page but couldn't find a real job description. Paste the JD text instead.",
        },
        { status: 422 },
      );
    }

    // Cap to 12k chars — JD match endpoint also caps at this.
    return NextResponse.json({ text: text.slice(0, 12000) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
