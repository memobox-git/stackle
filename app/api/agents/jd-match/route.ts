// Vercel Pro allows up to 300s — JD match is a single Sonnet call (~30-60s).
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { JDMatchReport } from "@/lib/agents/schemas/jdMatch";
import { JD_MATCH_SYSTEM_PROMPT } from "@/lib/agents/prompts/jdMatchPrompt";
import { rateLimit } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface JDMatchRequest {
  extraction: ResumeExtraction;
  jobDescription: string;
}

// Compact resume summary so the model has full structural context but we
// don't blow the prompt budget on long bullet bodies. Mirrors the helpers
// in cover-letter and resume/edit routes for consistency.
function summarizeExtraction(ext: ResumeExtraction): string {
  const lines: string[] = [];
  lines.push(`Name: ${ext.name ?? "unknown"}`);
  if (typeof ext.totalYearsExperience === "number") lines.push(`Total years: ${ext.totalYearsExperience}`);
  if (ext.summary) lines.push(`Summary: ${ext.summary}`);

  if (ext.experience?.length) {
    lines.push("Experience:");
    ext.experience.forEach((e, i) => {
      lines.push(`  experience.${i}: ${e.title} at ${e.company} (${e.startDate}–${e.endDate ?? "present"})`);
      (e.bullets ?? []).forEach((b, j) => {
        lines.push(`    experience.${i}.bullets.${j}: ${b}`);
      });
    });
  }

  if (ext.skillGroups?.length) {
    lines.push("skillGroups:");
    ext.skillGroups.forEach((g, i) => {
      lines.push(`  [${i}] ${g.category}: ${g.skills.join(", ")}`);
    });
  }

  if (ext.education?.length) {
    lines.push("Education:");
    ext.education.forEach((e, i) => {
      lines.push(`  education.${i}: ${e.degree}${e.field ? `, ${e.field}` : ""} at ${e.institution}`);
    });
  }

  if (ext.projects?.length) {
    lines.push("Projects:");
    ext.projects.forEach((p, i) => {
      lines.push(`  projects.${i}: ${p.name} — ${p.description ?? ""}`);
    });
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 10, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;

  try {
    const body = (await req.json()) as JDMatchRequest;
    if (!body.extraction) {
      return NextResponse.json({ error: "extraction is required" }, { status: 400 });
    }
    if (!body.jobDescription || body.jobDescription.trim().length < 50) {
      return NextResponse.json(
        { error: "jobDescription is too short — paste at least 50 characters." },
        { status: 400 },
      );
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    // Cap JD at 12k chars — well above any real posting and well under
    // model context. Anything longer is almost always boilerplate boilerplate.
    const jd = body.jobDescription.trim().slice(0, 12000);

    const userMessage = `RESUME (structured):
${summarizeExtraction(body.extraction)}

JOB DESCRIPTION:
---
${jd}
---

Produce the structured match report. Respond with JSON only, no commentary.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: JD_MATCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: JDMatchReport;
    try {
      parsed = JSON.parse(jsonText) as JDMatchReport;
    } catch {
      console.error("[jd-match] AI returned invalid JSON:", raw.slice(0, 500));
      return NextResponse.json(
        { error: "AI returned invalid JSON. Try again." },
        { status: 500 },
      );
    }

    // Cheap defensive normalisation — never trust the model's bounds.
    if (typeof parsed.matchScore !== "number") parsed.matchScore = 0;
    parsed.matchScore = Math.max(0, Math.min(100, Math.round(parsed.matchScore)));
    parsed.keywordsPresent = parsed.keywordsPresent ?? [];
    parsed.keywordsMissing = parsed.keywordsMissing ?? [];
    parsed.rewriteRecommendations = parsed.rewriteRecommendations ?? [];

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[jd-match] Route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
