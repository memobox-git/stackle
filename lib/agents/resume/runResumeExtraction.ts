import Anthropic from "@anthropic-ai/sdk";
import { RESUME_EXTRACTION_SYSTEM_PROMPT } from "../prompts/resumeExtractionPrompt";
import { ResumeExtraction } from "../schemas/resumeExtraction";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sentinel fallback. name is intentionally empty (NOT "there") so the
// validation check `name.trim().length > 0` correctly rejects it. The
// extract API route also throws on this path so the client sees a 500
// instead of a misleading 200 with placeholder content.
const FALLBACK_EXTRACTION: ResumeExtraction = {
  name: "",
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
  // Cap extra-long resumes — first 10k chars cover ~3 pages.
  const cappedResume = resumeText.length > 10000 ? resumeText.slice(0, 10000) + "\n…[truncated]" : resumeText;
  const userMessage = `Extract all structured data from this resume.\n\n<resume>\n${cappedResume}\n</resume>`;

  try {
    const startedAt = Date.now();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      // Prompt caching — system prompt is static across calls. Saves
      // ~50% of input-token reprocessing on cache hits within 5 min.
      system: [
        { type: "text", text: RESUME_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
    console.log("[extraction]", `${((Date.now() - startedAt) / 1000).toFixed(1)}s`, "usage:", response.usage);
    let rawText = response.content[0].type === "text" ? response.content[0].text : "";
    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    // Tolerant JSON: strict parse first, then trim to first {…last }.
    try {
      return JSON.parse(rawText) as ResumeExtraction;
    } catch (parseErr) {
      const first = rawText.indexOf("{");
      const last = rawText.lastIndexOf("}");
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(rawText.slice(first, last + 1)) as ResumeExtraction;
        } catch (innerErr) {
          console.error("[extraction] tolerant JSON parse failed:", innerErr, "raw start:", rawText.slice(0, 500));
        }
      } else {
        console.error("[extraction] strict JSON parse failed:", parseErr, "raw start:", rawText.slice(0, 500));
      }
      return FALLBACK_EXTRACTION;
    }
  } catch (err) {
    console.error("[extraction] API/runtime error:", err instanceof Error ? err.message : err);
    return FALLBACK_EXTRACTION;
  }
}
