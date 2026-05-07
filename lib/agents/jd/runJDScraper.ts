// JD URL Scraper — Phase 2 of JD-to-Resume.
//
// Best-effort HTML fetch + extraction for the four "easy" ATS platforms
// (Greenhouse, Lever, Ashby, generic company career pages). Heavy-JS
// sites (Workday, Indeed, Glassdoor, LinkedIn) require headless browser
// or third-party API and return an honest "can't reach this directly"
// error so the user can paste the text instead.
//
// Output: { ok, jdText?, sourcePlatform, sourceUrl, fetchedAt, error? }
// The caller then pipes jdText through the existing JDAnalyzer +
// rewrite-all pipeline.
//
// 24-hour in-memory cache so users prepping multiple resumes for the
// same JD don't re-hit the source site.

type CachedScrape = { jdText: string; sourcePlatform: string; fetchedAt: number };
const cache = new Map<string, CachedScrape>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type ScrapeResult =
  | { ok: true; jdText: string; sourcePlatform: string; sourceUrl: string; fetchedAt: number; cached: boolean }
  | { ok: false; sourcePlatform: string; sourceUrl: string; error: string; needsManual: boolean };

const HEAVY_JS_DOMAINS = [
  // These render the JD entirely in JS or sit behind auth — pure HTML
  // fetch returns a near-empty shell. Each requires a different solution
  // (LinkedIn → Chrome extension, others → headless browser service).
  /(^|\.)linkedin\.com$/i,
  /(^|\.)workday\.com$/i,
  /(^|\.)myworkdayjobs\.com$/i,
  /(^|\.)indeed\.com$/i,
  /(^|\.)glassdoor\.com$/i,
  /(^|\.)wellfound\.com$/i,
];

function detectPlatform(url: URL): { platform: string; isSupported: boolean; reason?: string } {
  const host = url.hostname.toLowerCase();
  if (/(^|\.)greenhouse\.io$/.test(host) || host === "boards.greenhouse.io") return { platform: "greenhouse", isSupported: true };
  if (/(^|\.)lever\.co$/.test(host) || host === "jobs.lever.co") return { platform: "lever", isSupported: true };
  if (/(^|\.)ashbyhq\.com$/.test(host) || host === "jobs.ashbyhq.com") return { platform: "ashby", isSupported: true };
  if (/(^|\.)smartrecruiters\.com$/.test(host)) return { platform: "smartrecruiters", isSupported: true };
  if (/(^|\.)bamboohr\.com$/.test(host)) return { platform: "bamboohr", isSupported: true };
  for (const re of HEAVY_JS_DOMAINS) {
    if (re.test(host)) return { platform: host, isSupported: false, reason: "JavaScript-rendered or auth-walled — pure HTML fetch returns nothing useful." };
  }
  return { platform: "generic", isSupported: true };
}

// Strip HTML to readable text. Keeps headings + paragraph breaks so the
// JD Analyzer (which reads the result) can still tell sections apart.
// Lightweight — no cheerio/jsdom dep.
function htmlToText(html: string): string {
  // Drop script/style blocks entirely.
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
              .replace(/<svg[\s\S]*?<\/svg>/gi, "")
              .replace(/<head[\s\S]*?<\/head>/gi, "");
  // Convert block-level tags to newlines so paragraph structure survives.
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|main|br)\s*>/gi, "\n")
       .replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags.
  s = s.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities.
  s = s.replace(/&nbsp;/gi, " ")
       .replace(/&amp;/gi, "&")
       .replace(/&lt;/gi, "<")
       .replace(/&gt;/gi, ">")
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/gi, "'")
       .replace(/&rsquo;|&lsquo;/gi, "'")
       .replace(/&rdquo;|&ldquo;/gi, '"');
  // Collapse whitespace.
  s = s.replace(/[ \t]+/g, " ")
       .replace(/\n[ \t]+/g, "\n")
       .replace(/\n{3,}/g, "\n\n")
       .trim();
  return s;
}

// Pull the most-likely JD body from the parsed text. ATS platforms
// typically wrap the JD in a labeled section; for generic pages we just
// trust the HTML→text output.
function extractJDFromHtml(html: string, platform: string): string {
  // Prefer og:description / og:title concatenation when present — they
  // often have a clean role label even when the page body is messy.
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
  const ogDesc = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1]
              ?? html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1];

  const fullText = htmlToText(html);

  // Greenhouse — the JD lives inside #content (and the company name is in the page title).
  if (platform === "greenhouse") {
    const m = html.match(/<div[^>]*id="content"[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|<footer)/i);
    if (m) {
      const body = htmlToText(m[1]);
      if (body.length > 200) return [ogTitle, body].filter(Boolean).join("\n\n");
    }
  }

  // Lever — JD wrapped in .posting-content or .section-wrapper.
  if (platform === "lever") {
    const m = html.match(/<div[^>]*class="[^"]*(?:posting-content|section-wrapper|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (m) {
      const body = htmlToText(m[1]);
      if (body.length > 200) return [ogTitle, body].filter(Boolean).join("\n\n");
    }
  }

  // Ashby — JD sits under a main role page. Their HTML is very semantic;
  // the heavy stripping above usually yields clean text on its own.
  if (platform === "ashby") {
    // Fall through to fullText; Ashby pages parse cleanly with the generic stripper.
  }

  // Generic + fallback: lead with title/description metadata if they exist,
  // followed by the stripped body. The JD Analyzer (Haiku) is robust to
  // some boilerplate noise around the actual JD content.
  const meta = [ogTitle, ogDesc].filter(Boolean).join("\n\n");
  if (fullText.length > 200) {
    return meta ? `${meta}\n\n${fullText}` : fullText;
  }
  return meta || fullText;
}

export async function runJDScraper(rawUrl: string): Promise<ScrapeResult> {
  let url: URL;
  try { url = new URL(rawUrl.trim()); }
  catch {
    return { ok: false, sourcePlatform: "unknown", sourceUrl: rawUrl, error: "That doesn't look like a valid URL.", needsManual: true };
  }

  const cacheKey = url.toString();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, jdText: hit.jdText, sourcePlatform: hit.sourcePlatform, sourceUrl: cacheKey, fetchedAt: hit.fetchedAt, cached: true };
  }

  const detected = detectPlatform(url);
  if (!detected.isSupported) {
    return {
      ok: false,
      sourcePlatform: detected.platform,
      sourceUrl: cacheKey,
      error: `${detected.platform} renders JDs in JavaScript or sits behind auth. Direct HTML fetch won't work — paste the JD text instead, or wait for the Chrome extension (LinkedIn) / headless scraper (Workday, Indeed) on the roadmap.`,
      needsManual: true,
    };
  }

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Identify ourselves honestly. Some ATS platforms gate aggressive
        // crawlers; Stackle is a user-initiated tailor-this-resume action,
        // not a crawler.
        "user-agent": "Mozilla/5.0 (compatible; StackleBot/1.0; +https://app.stackle.io)",
        "accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, sourcePlatform: detected.platform, sourceUrl: cacheKey, error: `Source returned HTTP ${res.status}.`, needsManual: true };
    }
    html = await res.text();
  } catch (err) {
    return { ok: false, sourcePlatform: detected.platform, sourceUrl: cacheKey, error: `Couldn't reach the URL: ${err instanceof Error ? err.message : "network error"}.`, needsManual: true };
  }

  const jdText = extractJDFromHtml(html, detected.platform);
  if (!jdText || jdText.length < 200) {
    return {
      ok: false,
      sourcePlatform: detected.platform,
      sourceUrl: cacheKey,
      error: "Found the page but couldn't extract a job description from it. The site may use JavaScript rendering — paste the text instead.",
      needsManual: true,
    };
  }

  const fetchedAt = Date.now();
  cache.set(cacheKey, { jdText, sourcePlatform: detected.platform, fetchedAt });
  return { ok: true, jdText, sourcePlatform: detected.platform, sourceUrl: cacheKey, fetchedAt, cached: false };
}

// Detect whether a free-text user message contains a URL we can scrape.
// Returns the URL string if found, otherwise null.
export function extractJDUrl(text: string): string | null {
  const m = text.match(/\bhttps?:\/\/[^\s)]+/i);
  return m ? m[0].replace(/[.,);]+$/, "") : null;
}
