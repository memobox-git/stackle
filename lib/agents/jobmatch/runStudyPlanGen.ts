// Study plan generator for Job Match.
//
// Sonnet 4.5. Input: parsed JD + (optional) match analysis. Output: an
// ordered, prioritized list of skills the user should study to close
// the gap between their resume and this role's must-haves.
//
// Each entry is concrete: skill name, why it matters for THIS role,
// estimated time, priority bucket, and 1-3 free + 0-2 paid learning
// resources. Resources are LLM-suggested but cited only for canonical
// sources (Mode SQL tutorial, dbt docs, etc) — never fabricated.

import Anthropic from "@anthropic-ai/sdk";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { MatchAnalysis } from "@/lib/agents/jobmatch/runMatchAnalyzer";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type StudyPriority = "high" | "medium" | "low";

export interface StudyResource {
  label: string;        // human-readable name
  url: string;          // canonical URL
  kind: "free" | "paid";
}

export interface StudyItem {
  skill: string;
  whyItMatters: string;       // 1-2 sentences for THIS role
  estTimeHours: number;       // 2-40 — be realistic
  priority: StudyPriority;
  resources: StudyResource[];
}

export interface StudyPlan {
  items: StudyItem[];
  overallTimeline: string;    // 1 short sentence
}

const SYSTEM_PROMPT = `You are a senior engineer who has hired into Data and AI teams for years. You build pragmatic study plans for candidates targeting a specific role.

Return ONLY a JSON object matching this shape:

{
  "items": [
    {
      "skill": "<specific skill, not generic ('Window Functions in SQL', not 'SQL')>",
      "whyItMatters": "<1-2 sentences explaining why THIS role requires it>",
      "estTimeHours": <integer 2-40>,
      "priority": "high" | "medium" | "low",
      "resources": [
        { "label": "<canonical resource name>", "url": "<URL>", "kind": "free" | "paid" }
      ]
    }
  ],
  "overallTimeline": "<one sentence — e.g. '~3 weeks at 1hr/day'>"
}

PRIORITIES
- high: must-haves the candidate is missing. Without this, they can't pass the screen.
- medium: nice-to-haves that show up in 30%+ of candidate competition.
- low: differentiators. Worth knowing but not required.

RESOURCES
- Suggest 1-3 resources per skill. At least one must be free.
- Only cite resources you're confident exist. Mode SQL tutorial, dbt docs,
  Andrew Ng courses, "Designing Data-Intensive Applications" book, official
  framework docs, well-known YouTube series (Jeff Heaton, Andrej Karpathy).
- If you don't know a canonical resource, set resources to [].
- NEVER fabricate URLs.

TIME ESTIMATES
- Be realistic. "Learn SQL" is 40+ hours; "Learn window functions specifically" is 4-8.
- Total across all items should be achievable in 2-6 weeks at 1hr/day.

DO NOT
- Wrap output in fences.
- List generic skills ("learn programming"). Be specific.
- Mix tutorial-level skills with senior-level skills in the same plan; gauge the user's level from their resume and pick accordingly.

Output the JSON object directly.`;

function extractJSON(raw: string): Record<string, unknown> | null {
  let t = raw.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  try {
    const parsed = JSON.parse(t.slice(s, e + 1));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeItem(raw: unknown): StudyItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const skill = typeof o.skill === "string" ? o.skill.trim() : "";
  if (!skill) return null;
  const why = typeof o.whyItMatters === "string" ? o.whyItMatters.trim() : "";
  const timeRaw = typeof o.estTimeHours === "number" ? o.estTimeHours : 8;
  const estTimeHours = Math.max(2, Math.min(40, Math.round(timeRaw)));
  const priorityRaw = typeof o.priority === "string" ? o.priority.toLowerCase() : "";
  const priority: StudyPriority = (["high", "medium", "low"] as const).includes(priorityRaw as StudyPriority)
    ? (priorityRaw as StudyPriority)
    : "medium";
  const resources = Array.isArray(o.resources)
    ? (o.resources as unknown[])
        .map((r): StudyResource | null => {
          if (!r || typeof r !== "object") return null;
          const rr = r as Record<string, unknown>;
          const label = typeof rr.label === "string" ? rr.label.trim() : "";
          const url = typeof rr.url === "string" ? rr.url.trim() : "";
          if (!label || !url) return null;
          const kindRaw = typeof rr.kind === "string" ? rr.kind.toLowerCase() : "free";
          const kind: "free" | "paid" = kindRaw === "paid" ? "paid" : "free";
          return { label, url, kind };
        })
        .filter((x): x is StudyResource => x !== null)
        .slice(0, 5)
    : [];
  return { skill, whyItMatters: why, estTimeHours, priority, resources };
}

export async function runStudyPlanGen(opts: {
  parsedJd: JDAnalysis;
  matchAnalysis?: MatchAnalysis | null;
}): Promise<StudyPlan> {
  const { parsedJd, matchAnalysis } = opts;

  const userMessage = `JOB DESCRIPTION (parsed):
${JSON.stringify(parsedJd, null, 2)}

${matchAnalysis ? `MATCH REPORT (candidate vs JD — focus the study plan on closing these specific gaps):
${JSON.stringify({
  missing: matchAnalysis.missing,
  honestGaps: matchAnalysis.honestGaps,
  score: matchAnalysis.score,
  verdict: matchAnalysis.verdict,
}, null, 2)}` : "(No match report yet — base the plan on the JD's must-haves alone.)"}

Produce the study plan JSON.`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 3000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
  const parsed = extractJSON(raw);
  if (!parsed) {
    console.error("[study-plan] parse failed. raw head:", raw.slice(0, 400));
    throw new Error("Study plan generator returned invalid JSON");
  }

  const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
  const items = itemsRaw
    .map(normalizeItem)
    .filter((x): x is StudyItem => x !== null);
  const overallTimeline = typeof parsed.overallTimeline === "string" ? parsed.overallTimeline.trim() : "";

  if (items.length === 0) {
    throw new Error("Study plan generator produced zero items");
  }
  return { items, overallTimeline };
}
