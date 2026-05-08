// Stackle Top-Level Orchestrator (Layer 1) runner.
//
// Sonnet 4.5 — full-conversation intelligence, not Haiku one-shot
// classification. Costs more per turn (~5s, ~$0.005) but earns it by
// extracting multi-signal intent from natural language and producing
// contextual chips + recommendations.

import Anthropic from "@anthropic-ai/sdk";
import { STACKLE_ORCHESTRATOR_SYSTEM_PROMPT } from "./stackleOrchestratorPrompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ManagerKey =
  | "resume"
  | "interview"
  | "cover_letter"
  | "career_strategy"
  | "more_info_needed";

export type SeniorityLevel = "entry" | "mid" | "senior" | "lead" | null;
export type FocusKey = "resume" | "interview" | "tailor_jd" | "cover_letter" | "career_strategy" | null;

export interface ExtractedSignals {
  role: string | null;
  seniority: SeniorityLevel;
  focus: FocusKey;
}

export interface OrchestratorRoute {
  managerKey: ManagerKey;
  narration: string;
  chips: string[];
  extractedSignals: ExtractedSignals;
}

const VALID_KEYS: ManagerKey[] = [
  "resume", "interview", "cover_letter", "career_strategy", "more_info_needed",
];
const VALID_SENIORITY: SeniorityLevel[] = ["entry", "mid", "senior", "lead", null];
const VALID_FOCUS: FocusKey[] = ["resume", "interview", "tailor_jd", "cover_letter", "career_strategy", null];

const FALLBACK: OrchestratorRoute = {
  managerKey: "more_info_needed",
  narration: "What do you want to work on first?",
  chips: ["Resume review", "Interview prep", "Tailor for a JD"],
  extractedSignals: { role: null, seniority: null, focus: null },
};

export interface OrchestratorInput {
  /** Conversation so far (latest message LAST). Empty array on first turn. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** Resume context — name, target_role, totalYears, seniorityEstimate, etc.
   *  The orchestrator references these in its greeting and inference. */
  resumeContext?: {
    firstName?: string | null;
    targetRoleFromUpload?: string | null;
    yearsExperience?: number | null;
    inferredSeniority?: string | null;
    summary?: string | null;
  };
  /** Signals already extracted across prior turns. Persisted client-side
   *  and fed back so the orchestrator doesn't re-ask. */
  priorSignals?: Partial<ExtractedSignals>;
}

function renderResumeContext(ctx: OrchestratorInput["resumeContext"], priorSignals?: Partial<ExtractedSignals>): string {
  const parts: string[] = ["<resume_context>"];
  if (ctx?.firstName) parts.push(`first_name: ${ctx.firstName}`);
  if (ctx?.targetRoleFromUpload) parts.push(`target_role_from_upload: ${ctx.targetRoleFromUpload}`);
  if (typeof ctx?.yearsExperience === "number") parts.push(`years_experience: ${ctx.yearsExperience}`);
  if (ctx?.inferredSeniority) parts.push(`inferred_seniority: ${ctx.inferredSeniority}`);
  if (priorSignals) {
    const known: string[] = [];
    if (priorSignals.role) known.push(`role=${priorSignals.role}`);
    if (priorSignals.seniority) known.push(`seniority=${priorSignals.seniority}`);
    if (priorSignals.focus) known.push(`focus=${priorSignals.focus}`);
    if (known.length > 0) parts.push(`already_known: ${known.join(", ")}`);
  }
  parts.push("</resume_context>");
  return parts.join("\n");
}

export async function runStackleOrchestrator(input: OrchestratorInput): Promise<OrchestratorRoute> {
  const { messages, resumeContext, priorSignals } = input;
  const liveContext = renderResumeContext(resumeContext, priorSignals);

  // Special case: empty conversation. Send a "start" sentinel as the user
  // message so the orchestrator generates the warm greeting from scratch.
  // The system prompt teaches it how to open.
  const apiMessages = messages.length === 0
    ? [{ role: "user" as const, content: `${liveContext}\n\nSTART: greet the candidate by first name, then ask what role they're targeting. Pre-fill chips with the upload-page role if present.` }]
    : (() => {
        // Anchor the latest user turn with the live context so the model
        // sees current signals on every reply. (Not the assistant turns.)
        const arr = messages.map((m) => ({ role: m.role, content: m.content }));
        const lastIdx = arr.length - 1;
        if (arr[lastIdx]?.role === "user") {
          arr[lastIdx] = { role: "user", content: `${liveContext}\n\n${arr[lastIdx].content}` };
        }
        return arr;
      })();

  try {
    const startedAt = Date.now();
    const res = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 600,
      system: [
        { type: "text", text: STACKLE_ORCHESTRATOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: apiMessages,
    });
    console.log("[stackle-orch]", `${((Date.now() - startedAt) / 1000).toFixed(1)}s`, "usage:", res.usage);

    let raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = JSON.parse(raw) as Partial<OrchestratorRoute>;

    // Defensive shape validation. Coerce invalid values to safe defaults.
    const managerKey: ManagerKey = VALID_KEYS.includes(parsed.managerKey as ManagerKey)
      ? (parsed.managerKey as ManagerKey)
      : "more_info_needed";
    const narration = typeof parsed.narration === "string" && parsed.narration.trim().length > 0
      ? parsed.narration.trim()
      : FALLBACK.narration;
    const chips = Array.isArray(parsed.chips)
      ? parsed.chips.filter((c): c is string => typeof c === "string" && c.length < 60).slice(0, 4)
      : FALLBACK.chips;

    // extractedSignals — merge with priorSignals so the client never
    // loses earlier extractions even if the model omits them this turn.
    const sigParsed = (parsed.extractedSignals ?? {}) as Partial<ExtractedSignals>;
    const extractedSignals: ExtractedSignals = {
      role: typeof sigParsed.role === "string" ? sigParsed.role : (priorSignals?.role ?? null),
      seniority: VALID_SENIORITY.includes(sigParsed.seniority as SeniorityLevel)
        ? (sigParsed.seniority as SeniorityLevel)
        : (priorSignals?.seniority ?? null),
      focus: VALID_FOCUS.includes(sigParsed.focus as FocusKey)
        ? (sigParsed.focus as FocusKey)
        : (priorSignals?.focus ?? null),
    };

    return { managerKey, narration, chips, extractedSignals };
  } catch (err) {
    console.error("[stackle-orch] failed:", err);
    return FALLBACK;
  }
}
