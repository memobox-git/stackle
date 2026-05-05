import Anthropic from "@anthropic-ai/sdk";
import { FINAL_SYNTHESIS_SYSTEM_PROMPT } from "../prompts/finalSynthesisPrompt";
import { WorkspaceViewModel } from "../schemas/workspaceViewModel";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSynthesisSystemPrompt(workspace: WorkspaceViewModel): string {
  const parts: string[] = [FINAL_SYNTHESIS_SYSTEM_PROMPT];

  // FIX 4: Resume builder mode context
  if (workspace.mode === "resume_builder") {
    parts.push("\n--- MODE: RESUME BUILDER ---");
    parts.push("The user is in Resume Builder mode. Keep ALL responses focused on the uploaded resume. Do not discuss general career topics, market trends, or interview prep unless directly related to improving the resume. Every response should reference specific parts of the resume.");
  }

  parts.push("\n--- ANALYSIS CONTEXT ---");

  if (workspace.orchestratorDecision) {
    parts.push(`\nOrchestrator decision:\n${JSON.stringify(workspace.orchestratorDecision, null, 2)}`);
  }

  if (workspace.resumeAnalysis) {
    parts.push(`\nResume intelligence analysis:\n${JSON.stringify(workspace.resumeAnalysis, null, 2)}`);
  } else {
    parts.push("\nResume intelligence analysis: not available");
  }

  if (workspace.marketAnalysis) {
    parts.push(`\nMarket intelligence analysis:\n${JSON.stringify(workspace.marketAnalysis, null, 2)}`);
  } else {
    parts.push("\nMarket intelligence analysis: not available");
  }

  if (workspace.interviewPrepPlan) {
    parts.push(`\nInterview prep plan:\n${JSON.stringify(workspace.interviewPrepPlan, null, 2)}`);
  } else {
    parts.push("\nInterview prep plan: not available");
  }

  // Structured snapshot — give the model the key facts up front so it
  // doesn't have to parse raw text to reference name/company/title.
  if (workspace.resumeExtraction) {
    const ext = workspace.resumeExtraction;
    const currentJob = ext.experience?.[0];
    const recentCompanies = (ext.experience ?? []).slice(0, 3).map((e) => e.company).filter(Boolean).join(", ");
    const topSkills = (ext.skillGroups ?? []).flatMap((g) => g.skills ?? []).slice(0, 12).join(", ");
    const firstName = (ext.name ?? "").trim().split(/\s+/)[0] ?? "";
    parts.push(`\nRESUME SNAPSHOT (use these details directly — do NOT ask who they are):
Name: ${ext.name ?? "unknown"} (first name: ${firstName})
Current role: ${currentJob?.title ?? "unknown"} at ${currentJob?.company ?? "unknown"}
Total experience: ${ext.totalYearsExperience ?? "unknown"} years
Location: ${ext.location ?? "unknown"}
Recent companies: ${recentCompanies || "unknown"}
Top skills: ${topSkills || "unknown"}
Summary: ${(ext.summary ?? "").slice(0, 400)}`);
  }

  if (workspace.resumeText) {
    parts.push(`\nResume text (full):\n${workspace.resumeText.slice(0, 6000)}`);
  } else if (workspace.resumeExtraction) {
    parts.push("\nResume text: not included in this request, but the structured snapshot above is authoritative — use it.");
  } else {
    parts.push("\nResume text: not uploaded yet.");
  }

  // The user told us their goal during onboarding. Surface it as a hard
  // constraint on the agent's framing so we don't drift into unrelated
  // career topics. If they said "Improve my resume", lean toward resume
  // suggestions; if "Prepare for interviews", lean toward prep tactics.
  if (workspace.careerGoal && workspace.careerGoal.trim()) {
    parts.push(`\nUser's stated goal: "${workspace.careerGoal.trim()}". Reference it naturally if relevant; never ignore it.`);
  }

  return parts.join("\n");
}

// Sonnet 4.5 for chat. Opus 4.7 was sharper but its time-to-first-token
// for short conversational replies (e.g. "hi") was 20-60s — felt broken.
// Sonnet streams the first token in 1-3s and finishes 4-line replies in
// under 10s, which is what live chat actually needs. Opus 4.7 only kicks
// in if Sonnet errors (rate limit / outage).
const CHAT_MODEL_PRIMARY = "claude-sonnet-4-5";
const CHAT_MODEL_FALLBACK = "claude-opus-4-7";

export async function runFinalSynthesis(workspace: WorkspaceViewModel): Promise<ReadableStream> {
  const systemPrompt = buildSynthesisSystemPrompt(workspace);

  // Try primary, fall through to the fallback on init failure (e.g. model
  // unavailable, rate limit on the premium tier). The fallback is the
  // model we know works because it's also serving the resume edit pipeline.
  let stream: Awaited<ReturnType<typeof client.messages.stream>>;
  let usedModel = CHAT_MODEL_PRIMARY;
  try {
    stream = await client.messages.stream({
      model: CHAT_MODEL_PRIMARY,
      max_tokens: 4000,
      system: systemPrompt,
      messages: workspace.conversationHistory,
    });
  } catch (err) {
    console.warn("[synthesis] primary model failed, falling back:", err instanceof Error ? err.message : err);
    usedModel = CHAT_MODEL_FALLBACK;
    stream = await client.messages.stream({
      model: CHAT_MODEL_FALLBACK,
      max_tokens: 4000,
      system: systemPrompt,
      messages: workspace.conversationHistory,
    });
  }
  console.log(`[synthesis] using model=${usedModel}`);

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let chunkCount = 0;
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            chunkCount++;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
        if (chunkCount === 0) {
          // Empty stream — surface to the client so the UI doesn't hang silently.
          console.error(`[synthesis] empty stream from ${usedModel}`);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: "(no response — try again)" })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error(`[synthesis] stream error on ${usedModel}:`, err);
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}
