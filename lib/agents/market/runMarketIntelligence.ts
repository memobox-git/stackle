import Anthropic from "@anthropic-ai/sdk";
import { MARKET_INTELLIGENCE_SYSTEM_PROMPT } from "../prompts/marketIntelligencePrompt";
import { MarketAnalysis } from "../schemas/marketIntelligence";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FALLBACK_ANALYSIS: MarketAnalysis = {
  targetRole: "Unknown",
  location: null,
  seniority: null,
  sampleJobTitles: [],
  topKeywords: [],
  commonTools: [],
  commonResponsibilities: [],
  commonQualifications: [],
  repeatedPhrases: [],
  salaryInsights: { junior: null, mid: null, senior: null, notes: "Analysis could not be completed." },
  demandSignal: "medium",
  marketNotes: ["Analysis could not be completed at this time."],
  resumeAlignmentTips: ["Try asking again with a specific role name."],
};

export async function runMarketIntelligence({
  targetRole,
  location,
  seniority,
  messages,
}: {
  targetRole: string;
  location?: string;
  seniority?: string;
  messages?: { role: string; content: string }[];
}): Promise<MarketAnalysis> {
  let recentMessagesContext = "";
  if (messages && Array.isArray(messages)) {
    const recentUserMessages = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.content)
      .join("\n");
    if (recentUserMessages) {
      recentMessagesContext = `\nRecent user messages (extract job description signals if any are present):\n${recentUserMessages}`;
    }
  }

  const userContext = `Analyze the job market for the following role.\n\nTarget role: ${targetRole}\n${location ? `Location / market: ${location}` : "Location: not specified — provide US/remote and global ranges"}\n${seniority ? `Seniority level: ${seniority}` : "Seniority: not specified — cover junior, mid, and senior levels"}${recentMessagesContext}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: MARKET_INTELLIGENCE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContext }],
    });
    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    return JSON.parse(rawText) as MarketAnalysis;
  } catch {
    return FALLBACK_ANALYSIS;
  }
}
