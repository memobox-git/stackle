export interface OrchestratorDecision {
  runResumeIntelligence: boolean;
  runMarketIntelligence: boolean;
  runInterviewPrep: boolean;
  primaryNeed: "resume_review" | "market_match" | "both" | "general_guidance" | "interview_prep";
  detectedCurrentRole: string | null;
  detectedTargetRole: string | null;
  detectedSeniority: string | null;
  detectedLocation: string | null;
  detectedInterviewType: string | null;
  startTab: "overview" | "resume_review" | "market_match" | "chat";
  nextActions: string[];
  reasoningSummary: string;
}

export const DEFAULT_ORCHESTRATOR_DECISION: OrchestratorDecision = {
  runResumeIntelligence: false,
  runMarketIntelligence: false,
  runInterviewPrep: false,
  primaryNeed: "general_guidance",
  detectedCurrentRole: null,
  detectedTargetRole: null,
  detectedSeniority: null,
  detectedLocation: null,
  detectedInterviewType: null,
  startTab: "chat",
  nextActions: [],
  reasoningSummary: "Fallback: orchestrator did not respond.",
};
