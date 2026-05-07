// JD Analyzer runner. Haiku 4.5 — fast, cheap structured extraction.
// Returns JDAnalysis JSON the JD-Tailored Rewriter consumes.

import Anthropic from "@anthropic-ai/sdk";
import { JD_ANALYZER_SYSTEM_PROMPT } from "./jdAnalyzerPrompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type Seniority =
  | "intern" | "entry" | "junior" | "mid" | "senior"
  | "staff" | "principal" | "lead" | "manager" | "director" | "unknown";

export interface JDAnalysis {
  company: string | null;
  role: string;
  seniority: Seniority;
  yearsRequired: number | null;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  techStack: string[];
  responsibilities: string[];
  culturalSignals: string[];
  redFlags: string[];
  location: string | null;
  isRemote: boolean | null;
}

const VALID_SENIORITY: Seniority[] = [
  "intern", "entry", "junior", "mid", "senior",
  "staff", "principal", "lead", "manager", "director", "unknown",
];

function arr(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
}

const FALLBACK: JDAnalysis = {
  company: null,
  role: "Unknown role",
  seniority: "unknown",
  yearsRequired: null,
  mustHaveSkills: [],
  niceToHaveSkills: [],
  techStack: [],
  responsibilities: [],
  culturalSignals: [],
  redFlags: ["Couldn't parse the JD — try pasting more text or check formatting."],
  location: null,
  isRemote: null,
};

export async function runJDAnalyzer(jdText: string): Promise<JDAnalysis> {
  const trimmed = (jdText ?? "").trim();
  if (trimmed.length < 50) {
    return {
      ...FALLBACK,
      redFlags: ["Input is too short to be a real job description (under 50 characters)."],
    };
  }

  // Cap input to keep token costs predictable. 12k chars ≈ a long JD.
  const capped = trimmed.slice(0, 12000);

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: JD_ANALYZER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: capped }],
    });
    let raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(raw) as Partial<JDAnalysis>;

    return {
      company: typeof parsed.company === "string" && parsed.company.trim() ? parsed.company.trim() : null,
      role: typeof parsed.role === "string" && parsed.role.trim() ? parsed.role.trim() : FALLBACK.role,
      seniority: VALID_SENIORITY.includes(parsed.seniority as Seniority) ? (parsed.seniority as Seniority) : "unknown",
      yearsRequired: typeof parsed.yearsRequired === "number" && isFinite(parsed.yearsRequired) ? parsed.yearsRequired : null,
      mustHaveSkills: arr(parsed.mustHaveSkills),
      niceToHaveSkills: arr(parsed.niceToHaveSkills),
      techStack: arr(parsed.techStack),
      responsibilities: arr(parsed.responsibilities),
      culturalSignals: arr(parsed.culturalSignals),
      redFlags: arr(parsed.redFlags),
      location: typeof parsed.location === "string" && parsed.location.trim() ? parsed.location.trim() : null,
      isRemote: typeof parsed.isRemote === "boolean" ? parsed.isRemote : null,
    };
  } catch (err) {
    console.error("[jd-analyzer] failed:", err);
    return FALLBACK;
  }
}
