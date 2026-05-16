// Claude-style multi-step questionnaire framework for artifact intake.
//
// When the user expresses intent ("draft a cover letter"), some
// artifacts need clarification before generation can start (company,
// tone, JD or not). This file defines those questionnaires per
// artifact kind. The chat surface walks the user through the steps,
// each step shows pills + accepts free-text, and only when all
// answers are collected does the generator fire.
//
// Adding a new artifact's questionnaire is one entry in the registry
// below. No changes to the engine.

import type { ArtifactKind } from "@/lib/artifacts";

// ── Types ─────────────────────────────────────────────────────────

export interface QuestionnaireContext {
  // Hydrated when the questionnaire starts. The engine passes this to
  // each step's `pills` callback so pills can pull smart defaults
  // (past chats, resume skills, etc).
  resumeFirstName: string | null;
  resumeSkills: string[];
  recentChatTitles: string[];   // for "which company?" defaults from past Job Match chats
  recentCompanies: string[];    // distinct companies from past chats / Drive
}

export interface QuestionnaireStep {
  // Stored key for this step's answer in the answers map.
  key: string;
  // Assistant prompt shown for this step. Can include {{name}} for the
  // user's first name (engine substitutes).
  prompt: string;
  // Optional pills. Static array OR function that pulls from context.
  // Pills are suggestions; free-text input is also always accepted.
  pills?: string[] | ((ctx: QuestionnaireContext) => string[]);
  // Optional: skip this step entirely when the predicate returns true.
  // Used for branching ("if user picked 'No specific JD' on step 2,
  // skip step 3 'paste the JD'").
  skipWhen?: (answers: Record<string, string>) => boolean;
}

export interface Questionnaire {
  artifactKind: ArtifactKind;
  // Short narration shown when the questionnaire kicks off.
  intro?: string;
  steps: QuestionnaireStep[];
}

// ── Registry ──────────────────────────────────────────────────────
//
// Each entry maps an artifact kind to its questionnaire. The framework
// looks up the kind, runs the steps, then dispatches to the generator
// (wired separately in app/page.tsx chip handlers).

export const QUESTIONNAIRES: Partial<Record<ArtifactKind, Questionnaire>> = {
  // Cover Letter — three questions. Company is dynamic (past chats),
  // tone is static, JD/no-JD branches the third step.
  cover_letter: {
    artifactKind: "cover_letter",
    intro: "Let me ask a few quick things so the cover letter actually fits.",
    steps: [
      {
        key: "company",
        prompt: "Which company is this for?",
        pills: (ctx) => {
          const fromChats = ctx.recentCompanies.slice(0, 3);
          // Always offer "no specific" so the user can write a generic
          // resume-grounded letter without naming a company.
          return [...fromChats, "No specific company"];
        },
      },
      {
        key: "tone",
        prompt: "What tone fits this company?",
        pills: ["Formal", "Warm + professional", "Confident + direct"],
      },
      {
        key: "jdSource",
        prompt: "Want it tuned to the actual JD?",
        pills: ["Paste the JD", "Skip — resume only"],
      },
      {
        key: "jdText",
        prompt: "Paste the JD text (or URL):",
        skipWhen: (answers) => answers.jdSource !== "Paste the JD",
      },
    ],
  },

  // Other artifacts get their questionnaires layered in subsequent
  // commits. Empty here means: existing flow (chip-driven) continues
  // to work unchanged.
};

// ── Engine helpers ────────────────────────────────────────────────

export function getQuestionnaire(kind: ArtifactKind): Questionnaire | null {
  return QUESTIONNAIRES[kind] ?? null;
}

// Resolve pills for a step, given the current context. Handles both
// static arrays and dynamic callbacks.
export function resolvePills(step: QuestionnaireStep, ctx: QuestionnaireContext): string[] {
  if (!step.pills) return [];
  if (typeof step.pills === "function") {
    try {
      return step.pills(ctx).filter((p) => p && p.length > 0);
    } catch (err) {
      console.warn("[questionnaire] pill resolver threw:", err);
      return [];
    }
  }
  return step.pills.filter((p) => p && p.length > 0);
}

// Substitute placeholders in a prompt with context values.
export function substitutePrompt(prompt: string, ctx: QuestionnaireContext): string {
  return prompt
    .replace(/\{\{\s*name\s*\}\}/gi, ctx.resumeFirstName ?? "");
}

// Find the next non-skipped step index. Returns -1 if all remaining
// steps are skipped (done).
export function nextStepIdx(
  steps: QuestionnaireStep[],
  currentIdx: number,
  answers: Record<string, string>,
): number {
  for (let i = currentIdx + 1; i < steps.length; i++) {
    const step = steps[i];
    if (step.skipWhen && step.skipWhen(answers)) continue;
    return i;
  }
  return -1;
}
