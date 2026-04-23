// Bumped from default 10s to 60s — LLM calls routinely take 15-45s.
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

const anthropic = new Anthropic();

// Service-role Supabase client for server-side inserts. Bypasses RLS so the
// benchmark records never depend on whether the current user is authenticated.
// If the service role key is missing, return null — callers must handle the
// "no DB persistence" case gracefully instead of silently falling back to the
// anon key (which would then fail RLS anyway and hide the real misconfig).
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!key && process.env.NODE_ENV !== "production") {
      console.warn("[benchmark] SUPABASE_SERVICE_ROLE_KEY is not set — benchmark rows will NOT be persisted");
    }
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type ConvMsg = { role: "user" | "assistant"; content: string };

interface ShadowBenchmarkRequest {
  chatId?: string | null;
  userId?: string | null;
  userMessage: string;
  conversationHistory: ConvMsg[]; // full history up to and including userMessage
  stackleResponse: string;
  stackleLatencyMs?: number;
  resumeText?: string | null;
  resumeExtraction?: ResumeExtraction | null;
}

function buildResumeBlock(resumeText: string | null | undefined, ext: ResumeExtraction | null | undefined) {
  if (!resumeText && !ext) return "";
  const parts: string[] = [];
  if (ext) {
    const job = ext.experience?.[0];
    parts.push(`RESUME SNAPSHOT:
Name: ${ext.name ?? "unknown"}
Current: ${job?.title ?? "?"} at ${job?.company ?? "?"}
Experience: ${ext.totalYearsExperience ?? "?"} years
Skills: ${(ext.skillGroups ?? []).flatMap((g) => g.skills ?? []).slice(0, 12).join(", ")}
Summary: ${(ext.summary ?? "").slice(0, 400)}`);
  }
  if (resumeText) parts.push(`RESUME TEXT:\n${resumeText.slice(0, 6000)}`);
  return parts.join("\n\n");
}

async function callRawClaude(
  history: ConvMsg[],
  resumeBlock: string
): Promise<{ text: string; latencyMs: number }> {
  const systemPrompt = resumeBlock
    ? `You are a career advisor for data and AI professionals. The user's resume is on file — use it directly.\n\n${resumeBlock}\n\nAnswer naturally and helpfully.`
    : "You are a career advisor for data and AI professionals. Answer naturally and helpfully.";
  const start = Date.now();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    system: systemPrompt,
    messages: history,
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return { text, latencyMs: Date.now() - start };
}

async function callJudge(params: {
  userMessage: string;
  lastTurns: ConvMsg[];
  resumeSummary: string;
  responseA: string;
  responseB: string;
}): Promise<{ winner: "A" | "B" | "tie"; reasoning: string; scores: unknown; model: string }> {
  const { userMessage, lastTurns, resumeSummary, responseA, responseB } = params;
  const turnsPreview = lastTurns
    .slice(-4)
    .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 400)}`)
    .join("\n");
  const prompt = `You are a blind evaluator of two career-advisor responses. You do NOT know which system wrote which.

USER'S LATEST MESSAGE:
${userMessage}

RECENT CONVERSATION:
${turnsPreview || "(none)"}

USER'S RESUME:
${resumeSummary || "(none provided)"}

RESPONSE A:
${responseA}

RESPONSE B:
${responseB}

Rate each response 1-10 on these criteria:
- specificity: uses the user's actual details (companies, skills, years) vs generic
- empathy: reads emotional tone before jumping to tactics
- depth: substantive help vs hedging, one-liners, or over-padding
- no_bs: avoids corporate speak, fake-concern questions, filler
- usefulness: genuinely moves the user forward

Return ONLY valid JSON, no prose around it:
{
  "winner": "A" | "B" | "tie",
  "reasoning": "1-2 sentences explaining the call",
  "scores": {
    "A": {"specificity": N, "empathy": N, "depth": N, "no_bs": N, "usefulness": N},
    "B": {"specificity": N, "empathy": N, "depth": N, "no_bs": N, "usefulness": N}
  }
}`;
  const model = "claude-sonnet-4-5";
  const res = await anthropic.messages.create({
    model,
    max_tokens: 1500,
    system: "You are a strict, blind response evaluator. Output only JSON.",
    messages: [{ role: "user", content: prompt }],
  });
  const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    const parsed = match ? JSON.parse(match[0]) : JSON.parse(raw);
    const winner = parsed.winner === "A" || parsed.winner === "B" ? parsed.winner : "tie";
    return { winner, reasoning: parsed.reasoning ?? "", scores: parsed.scores ?? null, model };
  } catch {
    return { winner: "tie", reasoning: "Judge output did not parse.", scores: null, model };
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ShadowBenchmarkRequest;
  const {
    chatId,
    userId,
    userMessage,
    conversationHistory,
    stackleResponse,
    stackleLatencyMs,
    resumeText,
    resumeExtraction,
  } = body;

  if (!userMessage || !stackleResponse || !Array.isArray(conversationHistory)) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  const resumeBlock = buildResumeBlock(resumeText, resumeExtraction);
  const resumeSnapshotForDb = resumeExtraction
    ? {
        name: resumeExtraction.name,
        currentTitle: resumeExtraction.experience?.[0]?.title ?? null,
        currentCompany: resumeExtraction.experience?.[0]?.company ?? null,
        totalYearsExperience: resumeExtraction.totalYearsExperience,
      }
    : null;

  // 1. Call raw Claude with same context
  let claude: { text: string; latencyMs: number };
  try {
    claude = await callRawClaude(conversationHistory, resumeBlock);
  } catch (err) {
    return NextResponse.json(
      { ok: false, stage: "claude", error: (err as Error).message },
      { status: 500 }
    );
  }

  // 2. Blind A/B — randomise slot so the judge can't cheat
  const stackleInA = Math.random() < 0.5;
  const responseA = stackleInA ? stackleResponse : claude.text;
  const responseB = stackleInA ? claude.text : stackleResponse;

  // 3. Judge
  const judgement = await callJudge({
    userMessage,
    lastTurns: conversationHistory,
    resumeSummary: resumeBlock,
    responseA,
    responseB,
  });

  // Translate judge's A/B verdict back to stackle/claude
  let winner: "stackle" | "claude" | "tie" = "tie";
  if (judgement.winner === "A") winner = stackleInA ? "stackle" : "claude";
  else if (judgement.winner === "B") winner = stackleInA ? "claude" : "stackle";

  const scoresMapped = remapScores(judgement.scores, stackleInA);

  // 4. Store run + judgment. Fails are non-fatal — we still return to the client.
  const supabase = getServiceClient();
  let runId: string | null = null;
  if (supabase) {
    const { data: run, error: runErr } = await supabase
      .from("benchmark_runs")
      .insert({
        chat_id: chatId ?? null,
        user_id: userId ?? null,
        user_message: userMessage,
        conversation_history: conversationHistory,
        resume_snapshot: resumeSnapshotForDb,
        stackle_response: stackleResponse,
        claude_response: claude.text,
        stackle_latency_ms: stackleLatencyMs ?? null,
        claude_latency_ms: claude.latencyMs,
      })
      .select("id")
      .single();
    if (!runErr && run) {
      runId = run.id;
      await supabase.from("benchmark_judgments").insert({
        run_id: run.id,
        stackle_slot: stackleInA ? "A" : "B",
        winner,
        reasoning: judgement.reasoning,
        scores: scoresMapped,
        judge_model: judgement.model,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    runId,
    winner,
    reasoning: judgement.reasoning,
    scores: scoresMapped,
    claudeLatencyMs: claude.latencyMs,
  });
}

// Remap judge's {A,B} scores into {stackle, claude} keys
function remapScores(scores: unknown, stackleInA: boolean) {
  if (!scores || typeof scores !== "object") return null;
  const s = scores as Record<string, unknown>;
  const a = s.A ?? null;
  const b = s.B ?? null;
  return stackleInA ? { stackle: a, claude: b } : { stackle: b, claude: a };
}
