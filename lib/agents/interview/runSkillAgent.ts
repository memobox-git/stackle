// Skill Agent runner. Sonnet 4.5 with tool use, streams SSE frames.
// Mirrors the runResumeOrchestrator pattern.

import Anthropic from "@anthropic-ai/sdk";
import { SKILL_AGENT_SYSTEM_PROMPT } from "./prompts/skillAgentPrompt";
import { SKILL_AGENT_TOOLS } from "./skillAgentTools";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type SkillAgentSessionState = {
  phase: "lens" | "skill" | "level" | "count" | "running" | "evaluating" | "verdict" | "done";
  config: { skill?: string; difficulty?: string; count?: number };
  questionIdx?: number;
  totalQuestions?: number;
  currentQuestion?: { subcategory: string; difficulty: string; prompt: string };
  candidateName?: string | null;
  // Optional company persona (Phase 3). When set, the Skill Agent tilts
  // tone + question preference toward the company's interview style.
  companyPersona?: {
    name: string;
    interviewStyle: string;
    questionEmphasis: { sql: number; distributedSystems: number; realTimeScenarios: number };
    culturalSignals: string[];
    redFlagsInAnswers: string[];
  } | null;
};

export type SkillAgentProfileSeed = {
  totalSessions: number;
  totalQuestions: number;
  perSkill: Record<string, { sessions: number; avgScore: number; weakestSubcategory?: string }>;
  lastDrilledSkill?: string;
  lastDrilledAt?: string;
};

// Resume context shape — the slice of the user's resume the Skill Agent
// uses to ground its questions in real projects ("Walk me through the
// dedup strategy in your Medallia pipeline" instead of generic SQL).
// Kept loose; the agent reads what's there and adapts.
export type SkillAgentResumeContext = {
  topRole?: string | null;
  topCompany?: string | null;
  yearsExperience?: number | null;
  // Up to ~5 most-recent experience entries, each with a title, company,
  // and 2-3 bullet snippets — enough for the agent to ask about
  // specific past work without leaking the full resume.
  experiences?: Array<{
    title: string;
    company: string;
    bullets: string[];
  }>;
  topSkills?: string[];
};

export type SkillAgentInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  sessionState: SkillAgentSessionState;
  profileSeed?: SkillAgentProfileSeed | null;
  // When the user has a parsed resume loaded, pass it through so the
  // agent can reference their actual projects in question prompts.
  resumeContext?: SkillAgentResumeContext | null;
  // Previous question's verdict — drives adaptive difficulty. If null,
  // the agent uses the configured difficulty as-is. If "strong_hire" or
  // "hire", it nudges next question harder. If "soft_pass" or
  // "no_hire", it eases back / drops to a clarifier.
  lastVerdict?: "strong_hire" | "hire" | "soft_pass" | "no_hire" | null;
};

export async function runSkillAgent(input: SkillAgentInput): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const liveContext = renderLiveContext(input);

  const apiMessages = input.messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .filter((m) => !m.content.startsWith("__"))
    .map((m) => ({ role: m.role, content: m.content }));

  // Anchor the latest user turn with live state.
  if (apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === "user") {
    const last = apiMessages[apiMessages.length - 1];
    apiMessages[apiMessages.length - 1] = {
      role: "user",
      content: `${liveContext}\n\n${last.content}`,
    };
  } else if (apiMessages.length === 0) {
    // First turn — seed an opener.
    apiMessages.push({
      role: "user",
      content: `${liveContext}\n\nSTART: greet me and ask what to drill.`,
    });
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      try {
        const stream = await client.messages.stream({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          system: SKILL_AGENT_SYSTEM_PROMPT,
          tools: SKILL_AGENT_TOOLS,
          messages: apiMessages,
        });

        let textBuf = "";
        for await (const event of stream) {
          if (event.type === "content_block_delta") {
            const d = event.delta;
            if (d.type === "text_delta") {
              textBuf += d.text;
              const chipsIdx = textBuf.indexOf("[CHIPS]");
              if (chipsIdx === -1) {
                send({ kind: "text", text: d.text });
              }
            }
          }
        }

        const finalMessage = await stream.finalMessage();

        for (const block of finalMessage.content) {
          if (block.type === "tool_use") {
            send({ kind: "tool", name: block.name, input: block.input, id: block.id });
          }
        }

        const chips = parseChips(textBuf);
        if (chips.length > 0) send({ kind: "chips", chips });
        send({ kind: "done", stop_reason: finalMessage.stop_reason });
      } catch (err) {
        console.error("[skill-agent] error:", err);
        send({ kind: "error", message: err instanceof Error ? err.message : "unknown" });
      } finally {
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    },
  });
}

function parseChips(text: string): string[] {
  const idx = text.lastIndexOf("[CHIPS]");
  if (idx === -1) return [];
  const line = text.slice(idx + "[CHIPS]".length).split("\n")[0] ?? "";
  return line.split("|").map((s) => s.trim()).filter((s) => s.length > 0 && s.length < 60).slice(0, 4);
}

function renderLiveContext(input: SkillAgentInput): string {
  const parts: string[] = ["<conversation_state>"];
  const s = input.sessionState;
  parts.push(`phase: ${s.phase}`);
  if (s.candidateName) parts.push(`candidate: ${s.candidateName}`);
  if (s.config.skill) parts.push(`config.skill: ${s.config.skill}`);
  if (s.config.difficulty) parts.push(`config.difficulty: ${s.config.difficulty}`);
  if (typeof s.config.count === "number") parts.push(`config.count: ${s.config.count}`);
  if (typeof s.questionIdx === "number" && typeof s.totalQuestions === "number") {
    parts.push(`progress: question ${s.questionIdx + 1} of ${s.totalQuestions}`);
  }
  if (s.currentQuestion) {
    parts.push(`current_question: ${s.currentQuestion.subcategory} (${s.currentQuestion.difficulty})`);
  }

  // Company persona injection (Phase 3). When the user picked a target
  // company, the Skill Agent leans into that company's interview style
  // and red-flags. Tone shifts with persona — Stripe wants idempotency
  // mentions, Snowflake wants concurrency awareness, etc.
  const persona = s.companyPersona;
  if (persona) {
    parts.push("");
    parts.push(`company_persona: ${persona.name}`);
    parts.push(`  interview_style: ${persona.interviewStyle}`);
    parts.push(`  question_emphasis: SQL ${persona.questionEmphasis.sql}% · DistSys ${persona.questionEmphasis.distributedSystems}% · RealTime ${persona.questionEmphasis.realTimeScenarios}%`);
    if (persona.culturalSignals.length > 0) parts.push(`  cultural_signals: ${persona.culturalSignals.join(", ")}`);
    if (persona.redFlagsInAnswers.length > 0) parts.push(`  red_flags_to_warn_about: ${persona.redFlagsInAnswers.join("; ")}`);
  }

  // Resume context — drives "ask about THIS user's actual projects"
  // questions. The agent prompt (skillAgentPrompt) instructs it to mix
  // resume-grounded questions in alongside the generic-skill ones.
  const r = input.resumeContext;
  if (r) {
    parts.push("");
    parts.push("candidate_resume_context:");
    if (r.topRole && r.topCompany) parts.push(`  current: ${r.topRole} at ${r.topCompany}`);
    if (typeof r.yearsExperience === "number" && r.yearsExperience > 0) {
      parts.push(`  years_experience: ${r.yearsExperience}`);
    }
    if (r.topSkills && r.topSkills.length > 0) {
      parts.push(`  top_skills: ${r.topSkills.slice(0, 12).join(", ")}`);
    }
    if (r.experiences && r.experiences.length > 0) {
      parts.push("  experiences:");
      for (const exp of r.experiences.slice(0, 5)) {
        parts.push(`    - ${exp.title} at ${exp.company}`);
        for (const b of exp.bullets.slice(0, 3)) {
          parts.push(`      • ${b.slice(0, 180)}`);
        }
      }
    }
  }

  // Adaptive difficulty — the previous question's verdict tells the
  // agent how to pitch the next question. Hard rule: read this, adjust
  // pitch accordingly, don't ignore it.
  if (input.lastVerdict) {
    parts.push("");
    parts.push(`last_verdict: ${input.lastVerdict}`);
    parts.push("  adjust_next: " + (
      input.lastVerdict === "strong_hire" ? "ESCALATE — go one notch harder, introduce a curveball or follow-up depth"
      : input.lastVerdict === "hire" ? "SAME LEVEL — different sub-topic to broaden coverage"
      : input.lastVerdict === "soft_pass" ? "EASE BACK — clarifier or definitional setup before the next probe"
      : "STEP DOWN — one notch easier, simpler scenario; offer Foundations link if appropriate"
    ));
  }

  const seed = input.profileSeed;
  if (seed && seed.totalSessions > 0) {
    parts.push("");
    parts.push(`profile_seed:`);
    parts.push(`  total_sessions: ${seed.totalSessions}`);
    parts.push(`  total_questions: ${seed.totalQuestions}`);
    if (seed.lastDrilledSkill) parts.push(`  last_drilled: ${seed.lastDrilledSkill} (${seed.lastDrilledAt ?? ""})`);
    for (const [skill, data] of Object.entries(seed.perSkill)) {
      parts.push(`  ${skill}: ${data.sessions} sessions, ${data.avgScore} avg${data.weakestSubcategory ? `, weakest=${data.weakestSubcategory}` : ""}`);
    }
  } else {
    parts.push("");
    parts.push(`profile_seed: (first session — no history)`);
  }

  parts.push("</conversation_state>");
  return parts.join("\n");
}
