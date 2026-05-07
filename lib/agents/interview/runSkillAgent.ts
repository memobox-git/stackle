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
};

export type SkillAgentProfileSeed = {
  totalSessions: number;
  totalQuestions: number;
  perSkill: Record<string, { sessions: number; avgScore: number; weakestSubcategory?: string }>;
  lastDrilledSkill?: string;
  lastDrilledAt?: string;
};

export type SkillAgentInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  sessionState: SkillAgentSessionState;
  profileSeed?: SkillAgentProfileSeed | null;
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
