import Anthropic from "@anthropic-ai/sdk";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "../prompts/orchestratorPrompt";
import { OrchestratorDecision, DEFAULT_ORCHESTRATOR_DECISION } from "../schemas/orchestrator";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runOrchestrator({
  messages,
  resumeText,
}: {
  messages: { role: string; content: string }[];
  resumeText: string | null;
}): Promise<OrchestratorDecision> {
  const recentMessages = messages.slice(-12);
  const contextLines = recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const latestUserMessage = recentMessages.filter((m) => m.role === "user").pop()?.content ?? "";

  const userContext = `Latest user message: "${latestUserMessage}"

Full conversation history (last ${recentMessages.length} messages — scan all of it for role, location, seniority, and intent signals):
${contextLines}

Resume provided: ${resumeText ? "yes" : "no"}
${resumeText ? `\nResume text (excerpt — use for current role, target role, seniority, and location signals):\n${resumeText.slice(0, 2000)}` : ""}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContext }],
    });
    let rawText = response.content[0].type === "text" ? response.content[0].text : "";
    rawText = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return JSON.parse(rawText) as OrchestratorDecision;
  } catch (err) {
    console.error("[orchestrator] Error:", err);
    return DEFAULT_ORCHESTRATOR_DECISION;
  }
}
