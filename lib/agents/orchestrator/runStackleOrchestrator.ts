// Layer-1 Orchestrator runner. Haiku 4.5, JSON-only output, defensive
// parsing, fallbacks to "ambiguous" on parse failure so the user never
// sees a broken state.

import Anthropic from "@anthropic-ai/sdk";
import { STACKLE_ORCHESTRATOR_SYSTEM_PROMPT } from "./stackleOrchestratorPrompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ManagerKey = "resume" | "interview" | "cover_letter" | "career_strategy" | "ambiguous";

export interface OrchestratorRoute {
  managerKey: ManagerKey;
  narration: string;
  chips?: string[];
}

const VALID_KEYS: ManagerKey[] = ["resume", "interview", "cover_letter", "career_strategy", "ambiguous"];
const DEFAULT_AMBIGUOUS_CHIPS = ["Resume", "Interview Prep", "Cover Letter", "Career Strategy"];

export async function runStackleOrchestrator(opts: {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}): Promise<OrchestratorRoute> {
  const trimmed = opts.message.trim();
  if (!trimmed) {
    return {
      managerKey: "ambiguous",
      narration: "What do you want to work on first?",
      chips: DEFAULT_AMBIGUOUS_CHIPS,
    };
  }

  // Cheap pre-routing on obvious keywords — saves an LLM call for the
  // 80% case where the user clicks a clear chip ("Resume" / "Interview").
  const lower = trimmed.toLowerCase();
  if (/^(resume|cv)\b/i.test(trimmed)) {
    return { managerKey: "resume", narration: "Resume Builder it is." };
  }
  if (/^interview/i.test(trimmed)) {
    return { managerKey: "interview", narration: "Got it — opening Interview Prep." };
  }
  if (/^cover\s+letter/i.test(lower)) {
    return { managerKey: "cover_letter", narration: "Cover Letter, on it." };
  }
  if (/^career\s+strategy/i.test(lower)) {
    return { managerKey: "career_strategy", narration: "Career Strategy, opening up." };
  }

  // Otherwise consult Haiku for nuanced intent.
  const userMsg = [
    `Latest user message: "${trimmed}"`,
    opts.history && opts.history.length > 0
      ? `\nRecent history (last 5):\n${opts.history.slice(-5).map((m) => `${m.role}: ${m.content}`).join("\n")}`
      : "",
    "\nReturn JSON only.",
  ].join("\n");

  try {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: STACKLE_ORCHESTRATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });
    let raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(raw) as Partial<OrchestratorRoute>;

    const managerKey: ManagerKey = VALID_KEYS.includes(parsed.managerKey as ManagerKey)
      ? (parsed.managerKey as ManagerKey)
      : "ambiguous";
    const narration = typeof parsed.narration === "string" && parsed.narration.trim()
      ? parsed.narration.trim()
      : managerKey === "ambiguous" ? "What do you want to work on first?" : "Routing.";
    const chips = managerKey === "ambiguous"
      ? (Array.isArray(parsed.chips) && parsed.chips.length > 0 ? parsed.chips.slice(0, 4) : DEFAULT_AMBIGUOUS_CHIPS)
      : undefined;

    return { managerKey, narration, ...(chips ? { chips } : {}) };
  } catch (err) {
    console.error("[stackle-orchestrator] failed:", err);
    return {
      managerKey: "ambiguous",
      narration: "What do you want to work on first?",
      chips: DEFAULT_AMBIGUOUS_CHIPS,
    };
  }
}
