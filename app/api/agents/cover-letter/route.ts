// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { rateLimit } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior recruiter who has read 10,000+ cover letters and knows which ones get replied to.

Write a cover letter that sounds like a real human wrote it — not a corporate template.

Rules:
- 4 short paragraphs, max ~250 words total
- Open with something specific about the role or company, not "I am writing to apply"
- Middle 2 paragraphs: what you've done + why it maps to this role. Use ONE concrete quantified example from the resume.
- Close with a confident one-liner, not a plea
- NO "I am a results-driven professional". NO "I would be thrilled to". NO buzzword soup.
- Don't invent facts. If the resume doesn't have a specific number or claim, don't manufacture one.
- Plain text. No markdown. No headers. No "Dear Hiring Manager" unless the user requested it.

If the job description is empty, write a general but confident letter that highlights the strongest parts of the resume.

Output ONLY the letter body. No preamble, no commentary, no sign-off name (the UI appends that).`;

interface CoverLetterRequest {
  extraction: ResumeExtraction;
  jobDescription?: string;
  companyName?: string;
  roleTitle?: string;
}

function summarizeExtraction(ext: ResumeExtraction): string {
  const lines: string[] = [];
  lines.push(`Name: ${ext.name ?? "unknown"}`);
  if (ext.summary) lines.push(`Summary: ${ext.summary}`);
  if (ext.experience?.length) {
    lines.push("Experience:");
    ext.experience.forEach((e, i) => {
      lines.push(`  [${i}] ${e.title} at ${e.company} (${e.startDate}–${e.endDate ?? "present"})`);
      (e.bullets ?? []).slice(0, 4).forEach((b) => lines.push(`      - ${b}`));
    });
  }
  if (ext.skillGroups?.length) {
    lines.push("Skills: " + ext.skillGroups.map((g) => `${g.category}: ${g.skills.join(", ")}`).join(" | "));
  }
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const __rl = rateLimit(req, { limit: 8, windowMs: 60000 });
  if (__rl.blocked) return __rl.response;
  try {
    const body = (await req.json()) as CoverLetterRequest;
    if (!body.extraction) {
      return NextResponse.json({ error: "extraction is required" }, { status: 400 });
    }

    const jdBlock = body.jobDescription
      ? `\n\nJob description:\n${body.jobDescription.slice(0, 6000)}`
      : "";
    const companyBlock = body.companyName ? `\nCompany: ${body.companyName}` : "";
    const roleBlock = body.roleTitle ? `\nRole: ${body.roleTitle}` : "";

    const userMessage = `Resume:\n${summarizeExtraction(body.extraction)}${companyBlock}${roleBlock}${jdBlock}

Write the cover letter.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const letter = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    return NextResponse.json({ letter });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
