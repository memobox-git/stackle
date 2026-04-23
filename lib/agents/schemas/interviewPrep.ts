export interface InterviewPrepPlan {
  role: string;
  level: string;
  interviewType: "behavioral" | "technical" | "system_design" | "case_study" | "mixed";
  topicsToStudy: { topic: string; priority: "high" | "medium" | "low"; notes: string }[];
  practiceQuestions: { question: string; category: string; difficulty: string; modelAnswer: string }[];
  tips: string[];
  starExamples: { situation: string; task: string; action: string; result: string }[];
}

export const FALLBACK_INTERVIEW_PREP: InterviewPrepPlan = {
  role: "Unknown",
  level: "mid",
  interviewType: "mixed",
  topicsToStudy: [],
  practiceQuestions: [],
  tips: ["Unable to generate prep plan at this time. Please try again."],
  starExamples: [],
};
