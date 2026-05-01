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

  return parts.join("\n");
}

export async function runFinalSynthesis(workspace: WorkspaceViewModel): Promise<ReadableStream> {
  const systemPrompt = buildSynthesisSystemPrompt(workspace);

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,
    system: systemPrompt,
    messages: workspace.conversationHistory,
  });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}
