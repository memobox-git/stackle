import Anthropic from "@anthropic-ai/sdk";
import { RESUME_EXTRACTION_SYSTEM_PROMPT } from "../prompts/resumeExtractionPrompt";
import { ResumeExtraction } from "../schemas/resumeExtraction";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FALLBACK_EXTRACTION: ResumeExtraction = {
  name: "there",
  email: null,
  phone: null,
  linkedin: null,
  location: null,
  summary: null,
  totalYearsExperience: null,
  experience: [],
  education: [],
  skillGroups: [],
  projects: [],
  certifications: [],
  awards: [],
  volunteer: [],
  publications: [],
  links: [],
  languages: [],
};

export async function runResumeExtraction({
  resumeText,
}: {
  resumeText: string;
}): Promise<ResumeExtraction> {
  const userMessage = `Extract all structured data from this resume.\n\n<resume>\n${resumeText}\n</resume>`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system: RESUME_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    let rawText = response.content[0].type === "text" ? response.content[0].text : "";
    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    return JSON.parse(rawText) as ResumeExtraction;
  } catch (err) {
    console.error("[extraction] Error:", err);
    return FALLBACK_EXTRACTION;
  }
}
