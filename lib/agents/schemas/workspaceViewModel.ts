import { OrchestratorDecision } from "./orchestrator";
import { ResumeAnalysis } from "./resumeIntelligence";
import { ResumeExtraction } from "./resumeExtraction";
import { MarketAnalysis } from "./marketIntelligence";
import { InterviewPrepPlan } from "./interviewPrep";

export interface WorkspaceViewModel {
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  resumeText: string | null;
  resumeExtraction: ResumeExtraction | null;
  orchestratorDecision: OrchestratorDecision | null;
  resumeAnalysis: ResumeAnalysis | null;
  marketAnalysis: MarketAnalysis | null;
  interviewPrepPlan: InterviewPrepPlan | null;
  mode: "chat" | "resume_builder";
}
