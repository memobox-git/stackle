// Session storage for Interview Prep. localStorage-backed; capped at 50.
// Builds the profile seed the Skill Agent receives on each new session
// so it can reference the user's past performance.
//
// Supabase migration is a follow-up commit — same shape, different store.

import type { InterviewQuestion, InterviewEvaluation, Verdict } from "@/lib/agents/interview/questionBank/types";
import type { SkillAgentProfileSeed } from "@/lib/agents/interview/runSkillAgent";

export type ChatMsg =
  | { role: "assistant"; content: string; chips?: string[] }
  | { role: "user"; content: string };

export type SkillSession = {
  id: string;
  agent: "skill" | "role" | "company" | "jd";
  startedAt: string;
  completedAt?: string;
  status: "active" | "completed" | "abandoned";
  config: { skill: string; difficulty: string; count: number };
  messages: ChatMsg[];
  questions: { questionId: string; answer?: string; evaluation?: InterviewEvaluation }[];
  report?: SessionReport;
};

export type SessionReport = {
  averageScore: number;
  verdictDistribution: Record<Verdict, number>;
  weakestSubcategory: string;
  strongestSubcategory: string;
  recommendedNext: string;
  generatedAt: string;
};

const STORAGE_KEY = "stackle_interview_sessions";
const MAX_SESSIONS = 50;

export function loadSessions(): SkillSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveSession(s: SkillSession) {
  if (typeof window === "undefined") return;
  try {
    const all = loadSessions();
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.unshift(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_SESSIONS)));
  } catch { /* non-fatal */ }
}

export function deleteSession(id: string) {
  if (typeof window === "undefined") return;
  try {
    const all = loadSessions().filter((s) => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* non-fatal */ }
}

// Generate the frozen report at session end. Aggregates across the
// session's evaluations + names the weakest sub-category by lowest avg.
export function generateReport(
  questions: InterviewQuestion[],
  answered: { questionId: string; evaluation?: InterviewEvaluation }[],
): SessionReport {
  const evals = answered.map((a) => a.evaluation).filter((e): e is InterviewEvaluation => !!e);
  const total = evals.length;
  const averageScore = total === 0 ? 0 : Math.round(evals.reduce((s, e) => s + e.score, 0) / total);

  const dist: Record<Verdict, number> = { strong_hire: 0, hire: 0, soft_pass: 0, no_hire: 0 };
  for (const e of evals) dist[e.verdict] = (dist[e.verdict] ?? 0) + 1;

  // Weakest / strongest by sub-category. Map question.subcategory → avg score.
  const subAgg: Record<string, { sum: number; count: number }> = {};
  answered.forEach((a, i) => {
    if (!a.evaluation) return;
    const q = questions[i];
    if (!q) return;
    const k = q.subcategory;
    if (!subAgg[k]) subAgg[k] = { sum: 0, count: 0 };
    subAgg[k].sum += a.evaluation.score;
    subAgg[k].count += 1;
  });
  const subAvgs = Object.entries(subAgg).map(([k, v]) => ({ k, avg: v.sum / v.count }));
  const weakest = subAvgs.length === 0 ? "" : subAvgs.reduce((a, b) => a.avg <= b.avg ? a : b).k;
  const strongest = subAvgs.length === 0 ? "" : subAvgs.reduce((a, b) => a.avg >= b.avg ? a : b).k;

  // Recommend a next move based on what they bombed.
  const recommendedNext = weakest
    ? `Drill ${weakest} next time — it's where you scored lowest in this session.`
    : "Run another round to build a baseline.";

  return {
    averageScore,
    verdictDistribution: dist,
    weakestSubcategory: weakest,
    strongestSubcategory: strongest,
    recommendedNext,
    generatedAt: new Date().toISOString(),
  };
}

// Build the profile seed handed to the Skill Agent on every new session.
// Aggregates across all completed past sessions: per-skill stats + last
// drilled. Empty when the user has no history.
export function buildProfileSeed(sessions: SkillSession[]): SkillAgentProfileSeed {
  const completed = sessions.filter((s) => s.status === "completed" && s.report);
  if (completed.length === 0) {
    return { totalSessions: 0, totalQuestions: 0, perSkill: {} };
  }

  const perSkill: Record<string, { sessions: number; avgScore: number; weakestSubcategory?: string; sumScore: number }> = {};
  let totalQuestions = 0;
  let lastDrilledSkill: string | undefined;
  let lastDrilledAt: string | undefined;

  // Sort by completedAt descending so the most-recent session wins for `last drilled`.
  const sorted = completed.slice().sort((a, b) =>
    (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt),
  );

  for (const s of sorted) {
    const skill = s.config.skill;
    if (!perSkill[skill]) perSkill[skill] = { sessions: 0, avgScore: 0, sumScore: 0 };
    perSkill[skill].sessions += 1;
    perSkill[skill].sumScore += s.report?.averageScore ?? 0;
    perSkill[skill].weakestSubcategory = perSkill[skill].weakestSubcategory ?? s.report?.weakestSubcategory;
    totalQuestions += s.questions.length;

    if (!lastDrilledSkill) {
      lastDrilledSkill = skill;
      lastDrilledAt = s.completedAt ?? s.startedAt;
    }
  }

  const perSkillFinal: SkillAgentProfileSeed["perSkill"] = {};
  for (const [k, v] of Object.entries(perSkill)) {
    perSkillFinal[k] = {
      sessions: v.sessions,
      avgScore: Math.round(v.sumScore / v.sessions),
      weakestSubcategory: v.weakestSubcategory,
    };
  }

  return {
    totalSessions: completed.length,
    totalQuestions,
    perSkill: perSkillFinal,
    lastDrilledSkill,
    lastDrilledAt,
  };
}
