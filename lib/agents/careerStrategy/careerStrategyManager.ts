// Career Strategy Manager (Layer 2) — V2 placeholder.
// Future scope: target-role advisory, market positioning, pivot guidance,
// salary benchmarking. Today: stub that routes the user back to the
// Orchestrator after a friendly "coming soon".

export const CAREER_STRATEGY_MANAGER_KEY = "career_strategy" as const;
export const CAREER_STRATEGY_MANAGER_DESCRIPTION = "Career Strategy. (Coming soon — placeholder for V2.)";

export interface ManagerReply {
  text: string;
  chips?: string[];
  bounceToOrchestrator?: boolean;
}

export function handleCareerStrategyMessage(): ManagerReply {
  return {
    text: "Career Strategy is coming soon — that's the Manager for target-role advisory, market positioning, and pivot planning. For now I can help with your resume or run interview practice. Want to start there?",
    chips: ["Resume Builder", "Interview Prep", "Tell me when it's ready"],
    bounceToOrchestrator: true,
  };
}
