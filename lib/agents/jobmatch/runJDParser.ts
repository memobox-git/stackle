// Orchestrates the parse step of Job Match:
//   1. Detect URL vs raw text.
//   2. If URL: runJDScraper.
//   3. runJDAnalyzer on the resulting text.
//   4. Persist a job_matches row with the structured fields.
//   5. Return { jobMatch, parsed } for the client.
//
// Stays server-side so the scraper's CORS headache (HTML fetch with
// custom User-Agent) doesn't hit the browser.

import { runJDScraper, extractJDUrl, type ScrapeResult } from "@/lib/agents/jd/runJDScraper";
import { runJDAnalyzer, type JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";

export interface JDParseResult {
  jdText: string;
  sourceUrl: string | null;
  parsed: JDAnalysis;
}

export async function runJDParser(rawInput: string): Promise<JDParseResult> {
  const trimmed = rawInput.trim();
  if (!trimmed) throw new Error("Empty input");

  // Detect URL — either the entire input is a URL or a URL is embedded.
  // extractJDUrl returns the first JD-shaped URL it finds; if the input
  // is just a URL, it returns it. Otherwise we treat the input as JD
  // text directly.
  const detectedUrl = extractJDUrl(trimmed);

  let jdText: string;
  let sourceUrl: string | null = null;
  if (detectedUrl && trimmed.length < 600) {
    // Short input that contains a URL → scrape.
    const scrape: ScrapeResult = await runJDScraper(detectedUrl);
    if (!scrape.ok) {
      throw new Error(scrape.error || "Couldn't fetch the JD from that URL");
    }
    jdText = scrape.jdText;
    sourceUrl = scrape.sourceUrl;
  } else {
    // Long input → treat as pasted JD text.
    jdText = trimmed;
  }

  if (!jdText || jdText.length < 80) {
    throw new Error("JD text too short — did the fetch succeed?");
  }

  const parsed = await runJDAnalyzer(jdText);
  return { jdText, sourceUrl, parsed };
}
