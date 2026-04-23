import Anthropic from "@anthropic-ai/sdk";
import { RESUME_INTELLIGENCE_SYSTEM_PROMPT } from "../prompts/resumeIntelligencePrompt";
import { ResumeAnalysis } from "../schemas/resumeIntelligence";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FALLBACK_ANALYSIS: ResumeAnalysis = {
  overallAssessment: "Unable to complete analysis at this time.",
  currentPositioning: "Unknown",
  likelyTargetRole: null,
  seniorityEstimate: null,
  scores: {
    atsCompatibility: { score: 0, max: 20, status: "WEAK", deductions: [] },
    contentImpact: { score: 0, max: 25, status: "WEAK", deductions: [] },
    structureFormatting: { score: 0, max: 20, status: "WEAK", deductions: [] },
    keywordCoverage: { score: 0, max: 20, status: "WEAK", deductions: [] },
    senioritySignal: { score: 0, max: 15, status: "WEAK", deductions: [] },
    total: 0,
    projectedPostFix: "N/A",
  },
  strengths: [],
  weaknesses: [],
  weakBullets: [],
  missingSignals: [],
  keywordsPresent: [],
  keywordGaps: [],
  atsHeuristics: {
    score: 0,
    formattingRisk: "medium",
    scanabilityRisk: "medium",
    notes: ["Analysis could not be completed."],
  },
  rewritePriorities: [],
  suggestedNextSteps: ["Try uploading your resume again or paste the text directly."],
};

export async function runResumeIntelligence({
  resumeText,
  targetRole,
  messages,
  reviewType,
  targetMarket,
  seniorityLevel,
  jobDescription,
}: {
  resumeText: string;
  targetRole?: string;
  messages?: { role: string; content: string }[];
  reviewType?: string;
  targetMarket?: string;
  seniorityLevel?: string;
  jobDescription?: string;
}): Promise<ResumeAnalysis> {
  let targetRoleHint = "";
  if (targetRole) {
    targetRoleHint = `Target role specified by user: ${targetRole}`;
  } else if (messages && Array.isArray(messages)) {
    const recentUserMessages = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content)
      .join("\n");
    if (recentUserMessages) {
      targetRoleHint = `Recent user messages for context (infer target role if possible):\n${recentUserMessages}`;
    }
  }

  const hasJD = !!jobDescription && jobDescription.trim().length > 0;
  const reviewContextBlock = (reviewType || targetMarket || seniorityLevel || hasJD)
    ? `\n--- REVIEW CONTEXT ---\nReview type: ${reviewType ?? "Full Review"}\nTarget market: ${targetMarket ?? "US General"}\nSeniority level targeting: ${seniorityLevel ?? "Senior"}\nJob description provided: ${hasJD ? "yes" : "no"}${hasJD ? `\n\nJob description (first 1500 chars):\n${jobDescription!.trim().slice(0, 1500)}` : ""}\n--- END REVIEW CONTEXT ---\n`
    : "";

  const userContext = `Please analyze the following resume.\n\n${reviewContextBlock}${targetRoleHint ? targetRoleHint + "\n\n" : ""}Resume text:\n<resume>\n${resumeText}\n</resume>`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8192,
      system: RESUME_INTELLIGENCE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContext }],
    });
    console.log("[intelligence] stop_reason:", response.stop_reason, "usage:", response.usage);
    let rawText = response.content[0].type === "text" ? response.content[0].text : "";
    rawText = rawText.trim();
    rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    // If truncated, try to repair by closing open strings/arrays/objects
    if (response.stop_reason === "max_tokens") {
      console.warn("[intelligence] Response truncated, attempting JSON repair");
      // Find last complete property by looking for last complete key-value
      const lastGoodComma = rawText.lastIndexOf('",');
      if (lastGoodComma > 0) {
        rawText = rawText.slice(0, lastGoodComma + 1);
        // Count open braces/brackets and close them
        const opens = (rawText.match(/[\[{]/g) || []).length;
        const closes = (rawText.match(/[\]}]/g) || []).length;
        for (let i = 0; i < opens - closes; i++) {
          // Determine if we need ] or }
          const lastOpen = rawText.lastIndexOf('[') > rawText.lastIndexOf('{') ? ']' : '}';
          rawText += lastOpen;
        }
      }
    }
    return JSON.parse(rawText) as ResumeAnalysis;
  } catch (err) {
    console.error("[intelligence] Error:", err);
    return FALLBACK_ANALYSIS;
  }
}
