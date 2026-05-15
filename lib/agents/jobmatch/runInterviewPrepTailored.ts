// JD-tailored interview prep for Job Match.
//
// Reuses the existing dynamic question generator (lib/agents/interview/
// runQuestionGenerator.ts) but constrains the agent to questions
// directly relevant to THIS JD's must-haves + responsibilities. Returns
// 5-10 InterviewQuestion objects ready to drop into the Interview Prep
// drill canvas.
//
// Wraps generateQuestions and post-shapes the resume context to nudge
// the agent toward the JD's specific stack + seniority.

import { generateQuestions } from "@/lib/agents/interview/runQuestionGenerator";
import type { InterviewQuestion } from "@/lib/agents/interview/questionBank/types";
import type { JDAnalysis } from "@/lib/agents/jd/runJDAnalyzer";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

export interface JDTailoredPrepInput {
  parsedJd: JDAnalysis;
  rawJdText: string;
  resume?: ResumeExtraction | null;
  count?: number; // default 6
}

export interface JDTailoredPrepOutput {
  questions: InterviewQuestion[];
  primarySkill: string;
  jdTitle: string;
  jdCompany: string | null;
}

// Pick the single most representative "skill" for THIS JD that the
// question generator can lean into. SQL-heavy DE roles → "SQL". ML/AI
// roles → "Machine Learning" or "Python". Falls back to first must-have.
function pickPrimarySkill(jd: JDAnalysis): string {
  const text = [
    jd.role,
    ...(jd.mustHaveSkills ?? []),
    ...(jd.techStack ?? []),
  ].join(" ").toLowerCase();

  if (/\b(ml|machine learning|llm|model)\b/.test(text)) return "Machine Learning";
  if (/\bdata engineer/.test(text)) return "SQL";
  if (/\b(analytics|analyst)\b/.test(text)) return "SQL";
  if (/\bpython\b/.test(text)) return "Python";
  if (/\b(spark|databricks|emr)\b/.test(text)) return "Spark";
  if (/\bsnowflake\b/.test(text)) return "Snowflake";
  // Fallback — first must-have skill.
  return jd.mustHaveSkills?.[0] || jd.techStack?.[0] || "System Design";
}

// Distill seniority → difficulty. Anything senior+ → hard. Mid → medium.
// Below mid → easy.
function pickDifficulty(jd: JDAnalysis): "easy" | "medium" | "hard" {
  const s = (jd.seniority ?? "").toLowerCase();
  if (s === "intern" || s === "entry" || s === "junior") return "easy";
  if (s === "senior" || s === "staff" || s === "principal" || s === "lead" || s === "manager" || s === "director") return "hard";
  return "medium";
}

export async function runInterviewPrepTailored(input: JDTailoredPrepInput): Promise<JDTailoredPrepOutput> {
  const count = Math.max(3, Math.min(12, input.count ?? 6));
  const primarySkill = pickPrimarySkill(input.parsedJd);
  const difficulty = pickDifficulty(input.parsedJd);

  // Build a tightly-scoped resume context that EMPHASIZES the JD-
  // relevant signal so the generator's resume-grounding rule kicks in
  // with the right framing.
  const resumeContext = input.resume
    ? {
        topRole: input.resume.experience?.[0]?.title ?? null,
        topCompany: input.resume.experience?.[0]?.company ?? null,
        yearsExperience: input.resume.totalYearsExperience ?? null,
        experiences: (input.resume.experience ?? []).slice(0, 4).map((e) => ({
          title: e.title,
          company: e.company,
          bullets: (e.bullets ?? []).slice(0, 3),
        })),
        topSkills: [
          // Bias topSkills toward the JD's must-haves so the generator
          // sees them as candidate-relevant.
          ...(input.parsedJd.mustHaveSkills ?? []).slice(0, 6),
          ...(input.resume.skillGroups ?? []).flatMap((g) => g.skills ?? []).slice(0, 6),
        ],
      }
    : null;

  const questions = await generateQuestions({
    skill: primarySkill,
    difficulty,
    count,
    resumeContext,
  });

  return {
    questions,
    primarySkill,
    jdTitle: input.parsedJd.role,
    jdCompany: input.parsedJd.company,
  };
}
