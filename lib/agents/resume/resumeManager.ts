// Resume Manager (Layer 2). Thin wrapper around the existing Resume
// Orchestrator + its sub-agents (extract, analyze, writer, rewrite-all).
//
// This commit doesn't change Resume's internal wiring — that's a follow-up
// migration. The Manager classification exists so the top-level Stackle
// Orchestrator (Layer 1) has a formal entry point to route to.
//
// When the Resume Manager is the active Manager for a chat, the existing
// Resume Builder UI + Resume Orchestrator handle everything as before.
// The Manager only matters at routing time.

export const RESUME_MANAGER_KEY = "resume" as const;

// Sub-agents under Resume Manager (already exist; classified here):
//   - lib/agents/resume/runResumeExtraction.ts      — extract structured fields
//   - lib/agents/resume/runResumeIntelligence.ts    — analyze + score
//   - app/api/agents/resume/edit                    — single-section writer
//   - lib/agents/resume/runRewriteAll.ts            — full-resume rewrite
//   - lib/agents/orchestrator/runResumeOrchestrator.ts — chat orchestrator
//                                                       inside Resume Builder
//   - lib/agents/synthesize/runFinalSynthesis.ts    — chat synthesizer
//   - lib/agents/validation/{rewriteValidator,traceabilityCheck}.ts
//                                                       quality guardrails
//
// Future: rewire the Layer-2 entry to dispatch to these explicitly. Today
// the Resume Builder UI calls them directly.

export const RESUME_MANAGER_DESCRIPTION = "Resume Builder. Upload, analyse, fix, and rewrite resumes.";
