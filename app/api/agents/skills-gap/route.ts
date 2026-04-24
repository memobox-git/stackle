// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ResumeExtraction, SkillGroup } from "@/lib/agents/schemas/resumeExtraction";
import { rateLimit } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior recruiter and a staff engineer at a top-tier tech company, combined.

Given a candidate's FULL resume text, their currently-listed skills, and their target role, you do THREE things:

STEP 1 — SKILL SWEEP:
Read the entire resume text — bullets, project descriptions, titles, summary. List every technical skill, tool, framework, language, platform, database, cloud service, library, or technique that is EXPLICITLY mentioned. Technical only — NO soft skills, NO methodologies like "Agile" unless it's clearly a tooling claim ("Agile/Scrum" doesn't count; "Jira" does). Include the skills already in the candidate's skill groups. Deduplicate case-insensitively (e.g. "python" and "Python" are one).

STEP 2 — CATEGORISE:
Group the sweep results into tight recruiter-legible categories, 3-8 skills per group. Prefer canonical labels: Languages, Frameworks & Libraries, Data & Databases, Cloud & Infra, ML / AI, Frontend, Testing & Quality, Observability, Tools. Merge groups smaller than 3 items into a neighbouring category. NEVER output a "Misc" / "Other" bucket. If a skill genuinely doesn't fit, drop it rather than dumping it.

STEP 3 — MISSING:
For the target role, add 3-6 high-priority skills the candidate is missing. Only suggest skills appropriate to their seniority. Never suggest soft skills. Never suggest anything already in the sweep (step 1 output), even under a different name. One tight reason line per suggestion.

OUTPUT FORMAT — valid JSON only, no markdown fences:
{
  "currentGroups":       [{ "category": "string", "skills": ["..."] }],
  "recategorizedGroups": [{ "category": "string", "skills": ["..."] }],
  "missing": [
    { "skill": "Spark", "category": "Data & Databases", "reason": "80%+ of Senior DE JDs list Spark for distributed compute.", "priority": "high" }
  ],
  "chatLine": "For Senior Data Engineer roles you're already strong on Python + SQL. Add Spark, Airflow, dbt — those show up in 80%+ of target JDs."
}

"currentGroups" mirrors the candidate's CURRENT skill groups (what's in the resume's Skills section today, unchanged).
"recategorizedGroups" is the FULL sweep + categorisation from steps 1 and 2 — this is the proposed new skills section.
"chatLine" is what a smart friend would say. Direct, specific, no fluff. Max 220 chars.`;

interface SkillsGapRequest {
  extraction: ResumeExtraction;
  targetRole?: string | null;
  seniority?: string | null;
  // Full parsed resume text so the model can sweep for technical skills
  // mentioned in bullets / projects / titles that never made it into the
  // Skills section.
  resumeText?: string | null;
}

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 10, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  try {
    const body = (await req.json()) as SkillsGapRequest;
    if (!body.extraction) {
      return NextResponse.json({ error: "extraction is required" }, { status: 400 });
    }

    const currentSkills = (body.extraction.skillGroups ?? [])
      .map((g: SkillGroup) => `${g.category}: ${g.skills.join(", ")}`)
      .join("\n");

    // Cap raw text at ~12k chars to stay well under token budget.
    const rawText = (body.resumeText ?? "").slice(0, 12000);

    const userMessage = `Target role: ${body.targetRole ?? "not specified — infer from resume"}
Seniority: ${body.seniority ?? "not specified — infer from resume"}

Candidate's CURRENT skill groups (verbatim — preserve in currentGroups):
${currentSkills || "(no skills listed)"}

${rawText ? `FULL RESUME TEXT — sweep this for every technical skill mentioned:
---
${rawText}
---` : `Experience signal (no full resume text available — infer from bullets):
${(body.extraction.experience ?? []).slice(0, 5).map((e, i) =>
  `[${i}] ${e.title} at ${e.company}: ${(e.bullets ?? []).slice(0, 5).join(" | ")}`
).join("\n")}

Projects: ${(body.extraction.projects ?? []).slice(0, 5).map((p) => `${p.name}: ${p.description ?? ""}`).join(" | ")}

Summary: ${body.extraction.summary ?? "(none)"}`}

Return the JSON described. Do the sweep, categorise, and list missing.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
      const parsed = JSON.parse(jsonText);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON", raw }, { status: 500 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
