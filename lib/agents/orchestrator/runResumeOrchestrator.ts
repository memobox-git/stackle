import Anthropic from "@anthropic-ai/sdk";
import { RESUME_ORCHESTRATOR_SYSTEM_PROMPT } from "./resumeOrchestratorPrompt";
import { RESUME_ORCHESTRATOR_TOOLS } from "./resumeOrchestratorTools";
import type { ResumeExtraction } from "../schemas/resumeExtraction";
import type { ResumeAnalysis } from "../schemas/resumeIntelligence";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type ConversationState = {
  acceptedFixes: string[];      // section keys or priority indices
  rejectedFixes: string[];
  acceptedPriorityIndices: number[];
  preferredStyle: "modern" | "conservative" | "senior" | "casual" | "punchy" | "default" | null;
  styleNote: string | null;
  customInstructions: string[]; // free-text preferences user expressed
  scoreJourney: { at: number; score: number }[];
  pendingConfirmation?: { kind: string; payload: unknown } | null;
};

export type ResumeOrchestratorInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  extraction: ResumeExtraction | null;
  analysis: ResumeAnalysis | null;
  state: ConversationState;
  currentScore: number | null;
  originalScore: number | null;
};

// Yields Server-Sent-Events-shaped frames as ReadableStream chunks.
// Client decodes `data: {json}\n\n` lines and dispatches by `kind`:
//   { kind: "text", text: string }   → append to streaming bubble
//   { kind: "tool", name, input }    → execute panel/agent tool
//   { kind: "done" }                 → close stream
export async function runResumeOrchestrator(input: ResumeOrchestratorInput): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();

  const conversationState = renderConversationState(input);
  const resumeContext = renderResumeContext(input);

  const apiMessages = input.messages
    .filter((m) => m.content && m.content.trim().length > 0)
    // Strip our internal sentinels (rendering hints, not real content) from
    // history before sending — the orchestrator shouldn't see them.
    .filter((m) => !m.content.startsWith("__"))
    .map((m) => ({ role: m.role, content: m.content }));

  // Anchor the latest user turn with live state. We append it as system-style
  // context to the LAST user message rather than spawning a synthetic message,
  // so the model treats it as fresh ground truth.
  if (apiMessages.length > 0 && apiMessages[apiMessages.length - 1].role === "user") {
    const last = apiMessages[apiMessages.length - 1];
    apiMessages[apiMessages.length - 1] = {
      role: "user",
      content: `<live_context>\n${conversationState}\n\n${resumeContext}\n</live_context>\n\n${last.content}`,
    };
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
          system: RESUME_ORCHESTRATOR_SYSTEM_PROMPT,
          tools: RESUME_ORCHESTRATOR_TOOLS,
          messages: apiMessages,
        });

        // Buffer the running text-block content so we can extract a [CHIPS] line
        // at the end. We forward tokens to the client as they arrive (preserving
        // streaming UX) and emit a chips frame once the block finishes.
        let textBuf = "";

        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block.type === "tool_use") {
              // Tool name + id arrive at start; input streams in deltas, but
              // for our small tools we wait for content_block_stop and read
              // the assembled input from the final message.
              // We DO send a "tool_intent" so the client can show a spinner.
              send({ kind: "tool_intent", name: block.name });
            }
          } else if (event.type === "content_block_delta") {
            const delta = event.delta;
            if (delta.type === "text_delta") {
              textBuf += delta.text;
              // Don't stream the [CHIPS] line — buffer until block end.
              // Naive split: if we see "[CHIPS]" we stop streaming text.
              const chipsIdx = textBuf.indexOf("[CHIPS]");
              if (chipsIdx === -1) {
                send({ kind: "text", text: delta.text });
              } else {
                // First time we hit the marker: clip the buffer at the marker
                // and stop forwarding. Re-emit nothing; chips frame goes out
                // at content_block_stop.
              }
            }
          } else if (event.type === "content_block_stop") {
            // No-op; final message has the assembled tool inputs we need.
          }
        }

        const finalMessage = await stream.finalMessage();

        // Dispatch tool_use blocks to the client.
        for (const block of finalMessage.content) {
          if (block.type === "tool_use") {
            send({ kind: "tool", name: block.name, input: block.input, id: block.id });
          }
        }

        // Parse [CHIPS] line from the assembled text.
        const chips = parseChips(textBuf);
        if (chips.length > 0) {
          send({ kind: "chips", chips });
        }

        send({ kind: "done", stop_reason: finalMessage.stop_reason });
      } catch (err) {
        console.error("[resume-orchestrator] error:", err);
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
  return line
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 60)
    .slice(0, 4);
}

function renderConversationState(input: ResumeOrchestratorInput): string {
  const s = input.state;
  const parts: string[] = ["<conversation_state>"];
  parts.push(`current_score: ${input.currentScore ?? "unknown"}/100`);
  if (input.originalScore !== null && input.originalScore !== input.currentScore) {
    parts.push(`original_score: ${input.originalScore}/100`);
  }
  if (s.acceptedFixes.length > 0) parts.push(`accepted_fixes: ${s.acceptedFixes.join(", ")}`);
  if (s.rejectedFixes.length > 0) parts.push(`rejected_fixes: ${s.rejectedFixes.join(", ")}`);
  if (s.preferredStyle) parts.push(`preferred_style: ${s.preferredStyle}${s.styleNote ? ` (${s.styleNote})` : ""}`);
  if (s.customInstructions.length > 0) parts.push(`user_preferences: ${s.customInstructions.join("; ")}`);
  parts.push("</conversation_state>");
  return parts.join("\n");
}

function renderResumeContext(input: ResumeOrchestratorInput): string {
  const ext = input.extraction;
  const a = input.analysis;
  const parts: string[] = ["<resume_context>"];
  if (ext?.name) parts.push(`name: ${ext.name}`);
  if (a?.likelyTargetRole) parts.push(`target_role: ${a.likelyTargetRole}`);
  if (a?.seniorityEstimate) parts.push(`seniority: ${a.seniorityEstimate}`);
  if (a?.rewritePriorities && a.rewritePriorities.length > 0) {
    parts.push(`action_plan:`);
    a.rewritePriorities.slice(0, 8).forEach((p, i) => parts.push(`  ${i}. ${p}`));
  }
  if (a?.weaknesses && a.weaknesses.length > 0) {
    parts.push(`top_weaknesses: ${a.weaknesses.slice(0, 3).join("; ")}`);
  }
  if (a?.strengths && a.strengths.length > 0) {
    parts.push(`top_strengths: ${a.strengths.slice(0, 2).join("; ")}`);
  }
  parts.push("</resume_context>");
  return parts.join("\n");
}

export const DEFAULT_CONVERSATION_STATE: ConversationState = {
  acceptedFixes: [],
  rejectedFixes: [],
  acceptedPriorityIndices: [],
  preferredStyle: null,
  styleNote: null,
  customInstructions: [],
  scoreJourney: [],
  pendingConfirmation: null,
};
