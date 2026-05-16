// Vercel Pro allows up to 300s — gives Sonnet room to finish full analyses without cutoff.
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { rateLimit } from "@/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a senior recruiter who has read 10,000+ cover letters and knows which ones get replied to.

You write a cover letter using ONLY the candidate's actual resume data. The user is REAL. Their name, email, LinkedIn, location, role, stack, accomplishments — ALL of this comes from the resume block below. You never ask the user to fill anything in.

ABSOLUTE RULES — VIOLATING ANY OF THESE = REJECTION:
1. NEVER output bracketed placeholders like [Your Name], [Email], [Phone], [LinkedIn], [Location], [Company], [stack], [briefly describe...], [mention one specific thing], etc. If you don't have data for something, OMIT THE LINE ENTIRELY. The user will not fill anything in.
2. Use the candidate's REAL name from the resume. Real email. Real LinkedIn. Real location. If a field is empty in the resume, skip that line — don't insert a placeholder.
3. Pull at least ONE specific accomplishment verbatim or near-verbatim from the candidate's experience bullets. Quote the real number or impact. Don't fabricate.
4. Don't invent stack details ("Spark, Airflow, Kafka"). Only mention tools the resume lists.

STRUCTURE:
- Header block: candidate name + contact (only fields present in resume).
- Date.
- Recipient: "Hiring Manager" + Company name (when given) + Location (when known).
- Subject line: "Re: {role}".
- Body: 4 short paragraphs, max ~250 words total.
  • Open with something specific about the role or company, not "I am writing to apply."
  • Middle 2 paragraphs: what they've done + why it maps to this role. Use ONE concrete quantified example from the resume.
  • Close with a confident one-liner, not a plea.
- Sign with the candidate's name.

TONE: when a tone is specified ("Formal" / "Warm + professional" / "Confident + direct"), MATCH IT. Default to warm + professional.

DO NOT:
- "I am a results-driven professional"
- "I would be thrilled to"
- Buzzword soup
- Markdown, bold, headers, asterisks
- "Dear Hiring Manager" — use "Hiring Manager" only

Output ONLY the letter. No preamble, no commentary.`;

interface CoverLetterRequest {
  extraction: ResumeExtraction;
  jobDescription?: string;
  companyName?: string;
  roleTitle?: string;
  // The questionnaire collects tone — pass it through so the model
  // honors "Formal" vs "Warm + professional" vs "Confident + direct".
  tone?: string;
  // Map of role aliases — when the questionnaire collected
  // targetRole separately, callers may pass it under multiple keys.
  targetRole?: string;
  // Previous letter drafts the user rejected via Regenerate. Feed them back
  // so the next attempt picks a different angle / opening / emphasis.
  previousAttempts?: string[];
}

function summarizeExtraction(ext: ResumeExtraction): string {
  const lines: string[] = [];
  // Contact block — every field the cover letter header might need.
  // Empty values are not emitted, so the model can't see "[Email]" or
  // similar as a placeholder pattern.
  if (ext.name) lines.push(`Name: ${ext.name}`);
  if (ext.email) lines.push(`Email: ${ext.email}`);
  if (ext.phone) lines.push(`Phone: ${ext.phone}`);
  if (ext.linkedin) lines.push(`LinkedIn: ${ext.linkedin}`);
  if (ext.location) lines.push(`Location: ${ext.location}`);
  if (ext.summary) lines.push(`Summary: ${ext.summary}`);
  if (ext.experience?.length) {
    lines.push("Experience:");
    ext.experience.forEach((e, i) => {
      lines.push(`  [${i}] ${e.title} at ${e.company} (${e.startDate}–${e.endDate ?? "present"})`);
      (e.bullets ?? []).slice(0, 5).forEach((b) => lines.push(`      - ${b}`));
    });
  }
  if (ext.skillGroups?.length) {
    lines.push("Skills: " + ext.skillGroups.map((g) => `${g.category}: ${(g.skills ?? []).join(", ")}`).join(" | "));
  }
  return lines.join("\n");
}

// Reject output that smuggled in placeholder brackets like [Your Name],
// [Phone], [stack], [briefly describe…]. We allow short legitimate
// brackets that aren't placeholders (e.g. "[1] note"), so the test is
// specifically: brackets that contain a phrase the user would be asked
// to fill in.
const PLACEHOLDER_RX = /\[(your name|email|phone|linkedin|location|company|role|stack|briefly|mention|insert|describe|specific thing|primary stack|date|address|city|state)[^\]]*\]/i;

function containsPlaceholder(text: string): boolean {
  return PLACEHOLDER_RX.test(text);
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
    const role = body.roleTitle || body.targetRole;
    const roleBlock = role ? `\nRole: ${role}` : "";
    const toneBlock = body.tone ? `\nTone requested: ${body.tone}` : "";
    const previousBlock = body.previousAttempts && body.previousAttempts.length > 0
      ? `\n\nPrevious drafts the user REJECTED. Produce something substantively different — different opening angle, different emphasis, different tone. Do not paraphrase these:\n${body.previousAttempts.map((p, i) => `  [${i + 1}] ${p}`).join("\n\n")}`
      : "";

    const userMessage = `Resume:\n${summarizeExtraction(body.extraction)}${companyBlock}${roleBlock}${toneBlock}${jdBlock}${previousBlock}

Write the cover letter. Remember: NO placeholders. Use real values from the resume above, or omit the line.`;

    async function callWriter(retryNote?: string): Promise<string> {
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: userMessage + (retryNote ? `\n\n${retryNote}` : "") },
      ];
      const msg = await client.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages,
      });
      return msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    }

    let letter = await callWriter();
    // Reject + retry once if placeholders smuggled through.
    if (containsPlaceholder(letter)) {
      letter = await callWriter(
        "YOUR PREVIOUS DRAFT CONTAINED PLACEHOLDER BRACKETS (like [Your Name] or [stack]). This is forbidden. Re-write using ONLY real values from the resume. If a value is missing, OMIT the line entirely. Do not include brackets."
      );
    }

    // Return BOTH field names — `letter` (legacy) and `coverLetter`
    // (what new client code expects). Avoids the "letter on the floor"
    // bug the user just hit.
    return NextResponse.json({ letter, coverLetter: letter });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
