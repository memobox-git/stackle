export interface MarketAnalysis {
  targetRole: string;
  location: string | null;
  seniority: string | null;
  sampleJobTitles: string[];
  topKeywords: string[];
  commonTools: string[];
  commonResponsibilities: string[];
  commonQualifications: string[];
  repeatedPhrases: string[];
  salaryInsights: {
    junior: string | null;
    mid: string | null;
    senior: string | null;
    notes: string;
  };
  demandSignal: "high" | "medium" | "low";
  marketNotes: string[];
  resumeAlignmentTips: string[];
}
