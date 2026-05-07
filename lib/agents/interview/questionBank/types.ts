// Shared types for the interview question bank.

export type Difficulty = "easy" | "medium" | "hard";

export interface InterviewQuestionRubric {
  correctApproach: string;
  commonMistakes: string[];
  bonusPoints: string[];
  traps: string[];
}

export interface InterviewQuestion {
  id: string;
  category: string;          // e.g. "SQL", "Python", "Spark"
  subcategory: string;       // e.g. "Window Functions", "JOIN"
  difficulty: Difficulty;
  prompt: string;            // the question text shown to the candidate
  contextSetup: string;      // schema, table definitions
  starterCode: string;       // pre-filled in the editor
  sampleData: string;        // human-readable description of sample data
  rubric: InterviewQuestionRubric;
  expectedKeywords: string[];
  followUps: string[];
  relatedConcepts: string[];
  companiesUse: string[];
  timeBenchmarkSeconds: number;
}

export type Verdict = "strong_hire" | "hire" | "soft_pass" | "no_hire";

export interface InterviewEvaluation {
  verdict: Verdict;
  score: number;             // 0-100
  reasoning: string;         // one-line summary
  whatWorked: string[];
  whatMissed: string[];
  pushToStrong: string;      // one specific path to Strong Hire
}

export interface InterviewSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  lens: "skill" | "role" | "company" | "jd";
  context: {
    skill?: string;
    role?: string;
    company?: string;
    difficulty?: Difficulty | "mixed";
    count?: number;
  };
  questions: { questionId: string; answer?: string; evaluation?: InterviewEvaluation }[];
  status: "active" | "completed" | "abandoned";
}
