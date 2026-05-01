export interface ScoreCategory {
  score: number;
  max: number;
  status: "STRONG" | "GOOD" | "REVIEW" | "WEAK";
  deductions: string[];
}

export interface ResumeAnalysis {
  overallAssessment: string;
  currentPositioning: string;
  likelyTargetRole: string | null;
  seniorityEstimate: string | null;
  scores: {
    atsCompatibility: ScoreCategory;
    contentImpact: ScoreCategory;
    structureFormatting: ScoreCategory;
    keywordCoverage: ScoreCategory;
    senioritySignal: ScoreCategory;
    total: number;
    projectedPostFix: string;
  };
  strengths: string[];
  weaknesses: string[];
  weakBullets: string[];
  missingSignals: string[];
  keywordsPresent: string[];
  keywordGaps: string[];
  atsHeuristics: {
    score: number;
    formattingRisk: "low" | "medium" | "high";
    scanabilityRisk: "low" | "medium" | "high";
    notes: string[];
  };
  rewritePriorities: string[];
  suggestedNextSteps: string[];
  // Three best-fit roles ordered by match. Powers the Career Profile
  // landing screen. Top role usually mirrors `likelyTargetRole`; the next
  // two are adjacent roles the resume could plausibly aim at. Optional
  // for backwards-compat with older analyses cached pre-feature.
  bestFitRoles?: {
    title: string;       // e.g. "Data Engineer"
    matchPct: number;    // 0-100
    reason: string;      // 1-line justification
  }[];
}
