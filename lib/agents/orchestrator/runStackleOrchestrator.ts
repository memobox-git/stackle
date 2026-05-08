// Stackle Top-Level Orchestrator (Layer 1) runner.
//
// Sonnet 4.5 with plain JSON output (no tool use — that added a schema-
// validation surface that kept failing). Tolerant JSON parsing handles
// conversational preambles. Most importantly: the FALLBACK itself is
// now built from the resume context — so even when the API hiccups,
// the user gets an observation-led greeting using their name + recent
// role, NOT a generic "hit a snag" router menu.

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
const VALID_SENIORITY = ["entry", "mid", "senior", "lead"] as const;
const VALID_FOCUS = ["resume", "interview", "tailor_jd", "cover_letter", "career_strategy"] as const;

export interface OrchestratorInput {
  messages: { role: "user" | "assistant"; content: string }[];
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
  priorSignals?: Partial<ExtractedSignals>;
}

// Smart fallback. When Sonnet fails for any reason, build a contextual
// greeting from what we know about the resume. Way better than a
// generic "hit a snag" — uses the user's name + observable facts.
function buildSmartFallback(input: OrchestratorInput): OrchestratorRoute {
  const ctx = input.resumeContext;
  const firstName = ctx?.firstName?.trim() || null;

  // Compose an observation-led greeting from resume facts.
  let narration: string;
  if (firstName && ctx?.topRole && ctx?.topCompany) {
    const yrs = ctx.yearsExperience;
    const yrsPhrase = typeof yrs === "number" && yrs > 0
      ? ` ${yrs >= 1 ? Math.round(yrs) : "<1"}+ years.`
      : "";
    narration = `Hey ${firstName} — ${ctx.topRole} at ${ctx.topCompany}.${yrsPhrase} What role are you targeting?`;
  } else if (firstName && ctx?.topRole) {
    narration = `Hey ${firstName} — ${ctx.topRole} background. What role are you targeting?`;
  } else if (firstName) {
    narration = `Hey ${firstName}. What role are you targeting?`;
  } else {
    narration = "What role are you targeting?";
  }

  // Default role chips, with the upload-page choice leading if present.
  const defaultRoles = ["Data Engineer", "ML Engineer", "Software Engineer", "Data Scientist", "Other"];
  const chips = ctx?.targetRoleFromUpload && !defaultRoles.includes(ctx.targetRoleFromUpload)
    ? [ctx.targetRoleFromUpload, ...defaultRoles].slice(0, 5)
    : defaultRoles.slice(0, 4);

  return {
    managerKey: "more_info_needed",
    narration,
    chips,
    extractedSignals: {
      role: input.priorSignals?.role ?? null,
      seniority: (input.priorSignals?.seniority ?? null) as SeniorityLevel,
      focus: (input.priorSignals?.focus ?? null) as FocusKey,
    },
  };
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

// Tolerant JSON extraction. Tries strict parse first; if that fails,
// finds the first { ... last } substring and parses that.
function extractJSON(raw: string): unknown | null {
  let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* keep going */ }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
    try { return JSON.parse(cleaned); } catch (err) {
      console.warn("[stackle-orch] tolerant JSON parse failed:", err, "raw:", raw.slice(0, 400));
    }
  }
  return null;
}

export async function runStackleOrchestrator(input: OrchestratorInput): Promise<OrchestratorRoute> {
  const { messages, resumeContext, priorSignals } = input;
  const liveContext = renderResumeContext(resumeContext, priorSignals);

  // First-turn synthetic prompt anchors the resume context and asks for
  // an observation-led greeting.
  const apiMessages = messages.length === 0
    ? [{ role: "user" as const, content: `${liveContext}\n\nThis is the user's first turn. Greet them by first name and reference ONE specific observation from <resume_context> (their current/recent role + company, OR years of experience, OR a notable skill) before asking what they're targeting. Make it feel like you've actually read their resume — not a generic "thanks for sending it over". Output JSON only.` }]
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
      messages: apiMessages,
    });
    console.log("[stackle-orch]", `${((Date.now() - startedAt) / 1000).toFixed(1)}s`, "usage:", res.usage);

    const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    const parsed = extractJSON(raw) as Partial<OrchestratorRoute> | null;
    if (!parsed) {
      console.warn("[stackle-orch] couldn't extract JSON; using smart fallback. raw start:", raw.slice(0, 300));
      return buildSmartFallback(input);
    }

    const managerKey: ManagerKey = VALID_KEYS.includes(parsed.managerKey as ManagerKey)
      ? (parsed.managerKey as ManagerKey)
      : "more_info_needed";
    const narration = typeof parsed.narration === "string" && parsed.narration.trim().length > 0
      ? parsed.narration.trim()
      : buildSmartFallback(input).narration;
    const chips = Array.isArray(parsed.chips)
      ? parsed.chips.filter((c): c is string => typeof c === "string" && c.length < 60).slice(0, 4)
      : buildSmartFallback(input).chips;

    const sigParsed = (parsed.extractedSignals ?? {}) as Record<string, unknown>;
    const seniorityRaw = typeof sigParsed.seniority === "string" ? sigParsed.seniority : "";
    const focusRaw = typeof sigParsed.focus === "string" ? sigParsed.focus : "";
    const extractedSignals: ExtractedSignals = {
      role: typeof sigParsed.role === "string" && sigParsed.role.trim().length > 0
        ? sigParsed.role.trim()
        : (priorSignals?.role ?? null),
      seniority: (VALID_SENIORITY as readonly string[]).includes(seniorityRaw)
        ? (seniorityRaw as SeniorityLevel)
        : (priorSignals?.seniority ?? null),
      focus: (VALID_FOCUS as readonly string[]).includes(focusRaw)
        ? (focusRaw as FocusKey)
        : (priorSignals?.focus ?? null),
    };

    return { managerKey, narration, chips, extractedSignals };
  } catch (err) {
    console.error("[stackle-orch] failed:", err instanceof Error ? err.message : err);
    return buildSmartFallback(input);
  }
}
