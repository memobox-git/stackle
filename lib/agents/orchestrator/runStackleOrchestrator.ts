// Stackle Top-Level Orchestrator (Layer 1) runner.
//
// Sonnet 4.5 with FORCED TOOL USE. The model must emit a single
// `respond` tool call with the structured route — no JSON-text mode,
// no "wrapped in conversational preamble" failures. Anthropic's
// constrained-decoding for tool inputs guarantees the schema is honoured.

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
  narration: "Hit a snag on my end — try saying that again, or pick one of these:",
  chips: ["Run a resume review", "Prep for interviews", "Tailor for a JD"],
  extractedSignals: { role: null, seniority: null, focus: null },
};

// Tool schema. The model MUST call this tool — that's enforced via
// tool_choice. Constrained decoding guarantees valid types.
const RESPOND_TOOL: Anthropic.Tool = {
  name: "respond",
  description: "Reply to the user. ALWAYS call this exactly once per turn — never speak outside this tool.",
  input_schema: {
    type: "object",
    properties: {
      managerKey: {
        type: "string",
        enum: ["resume", "interview", "cover_letter", "career_strategy", "more_info_needed"],
        description: "Which manager to route the user to. 'more_info_needed' if you need another turn to figure it out.",
      },
      narration: {
        type: "string",
        description: "What you say to the user. 1-3 sentences. No JSON, no markdown headers. Use **bold** sparingly. Reference specifics from <resume_context> when natural to prove you read it.",
      },
      chips: {
        type: "array",
        items: { type: "string" },
        description: "2-4 short tap-to-act chip labels (each <5 words), tailored to your narration.",
      },
      extractedSignals: {
        type: "object",
        properties: {
          role: { type: ["string", "null"], description: "Target role if known, e.g. 'Data Engineer'." },
          seniority: { type: ["string", "null"], enum: ["entry", "mid", "senior", "lead", null], description: "Seniority level if known." },
          focus: { type: ["string", "null"], enum: ["resume", "interview", "tailor_jd", "cover_letter", "career_strategy", null], description: "What the user wants to work on if known." },
        },
        required: ["role", "seniority", "focus"],
      },
    },
    required: ["managerKey", "narration", "chips", "extractedSignals"],
  },
};

export interface OrchestratorInput {
  /** Conversation so far (latest message LAST). Empty array on first turn. */
  messages: { role: "user" | "assistant"; content: string }[];
  /** Resume context — observable facts the orchestrator references in
   *  greetings ("Senior Analyst at Medallia, 4.8 years…") and in
   *  recommendations. */
  resumeContext?: {
    firstName?: string | null;
    fullName?: string | null;
    targetRoleFromUpload?: string | null;
    yearsExperience?: number | null;
    inferredSeniority?: string | null;
    summary?: string | null;
    topRole?: string | null;
    topCompany?: string | null;
    topSkills?: string[];
    location?: string | null;
  };
  /** Signals already extracted across prior turns. Persisted client-side. */
  priorSignals?: Partial<ExtractedSignals>;
}

function renderResumeContext(ctx: OrchestratorInput["resumeContext"], priorSignals?: Partial<ExtractedSignals>): string {
  const parts: string[] = ["<resume_context>"];
  if (ctx?.firstName) parts.push(`first_name: ${ctx.firstName}`);
  if (ctx?.fullName) parts.push(`full_name: ${ctx.fullName}`);
  if (ctx?.targetRoleFromUpload) parts.push(`target_role_from_upload: ${ctx.targetRoleFromUpload}`);
  if (typeof ctx?.yearsExperience === "number") parts.push(`years_experience: ${ctx.yearsExperience}`);
  if (ctx?.inferredSeniority) parts.push(`inferred_seniority: ${ctx.inferredSeniority}`);
  if (ctx?.topRole && ctx?.topCompany) parts.push(`current_or_recent: ${ctx.topRole} at ${ctx.topCompany}`);
  else if (ctx?.topRole) parts.push(`current_or_recent_role: ${ctx.topRole}`);
  if (ctx?.location) parts.push(`location: ${ctx.location}`);
  if (ctx?.topSkills && ctx.topSkills.length > 0) parts.push(`top_skills: ${ctx.topSkills.slice(0, 8).join(", ")}`);
  if (ctx?.summary) parts.push(`summary: ${ctx.summary.slice(0, 300)}`);
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

  // Empty conversation = first turn. Send a synthetic prompt that anchors
  // the resume context and asks the orchestrator to greet observation-led.
  const apiMessages = messages.length === 0
    ? [{ role: "user" as const, content: `${liveContext}\n\nThis is the user's first turn. Greet them by first name and reference ONE specific observation from <resume_context> (their current/recent role + company, OR years of experience, OR a notable skill) before asking what they're targeting. Make it feel like you've actually read their resume — not a generic "thanks for sending it over". Then call respond().` }]
    : (() => {
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
      tools: [RESPOND_TOOL],
      tool_choice: { type: "tool", name: "respond" },  // FORCE the tool — no free-form output
      messages: apiMessages,
    });
    console.log("[stackle-orch]", `${((Date.now() - startedAt) / 1000).toFixed(1)}s`, "usage:", res.usage);

    // Find the tool_use block. With tool_choice forced, this is guaranteed
    // to be present and to match the schema.
    const toolBlock = res.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      console.warn("[stackle-orch] no tool_use block in response, falling back");
      return FALLBACK;
    }

    const parsed = toolBlock.input as Partial<OrchestratorRoute>;

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

    // extractedSignals — merge with priorSignals so we never lose
    // earlier extractions.
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
