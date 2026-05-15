// Public bank API. Filters questions by skill, difficulty, and a
// previously-seen exclusion list so a session never repeats.

import { SQL_EASY } from "./sql/easy";
import { SQL_MEDIUM } from "./sql/medium";
import type { InterviewQuestion, Difficulty } from "./types";

const ALL_QUESTIONS: InterviewQuestion[] = [...SQL_EASY, ...SQL_MEDIUM];

export function getQuestionById(id: string): InterviewQuestion | null {
  return ALL_QUESTIONS.find((q) => q.id === id) ?? null;
}

export function pickQuestions(opts: {
  skill?: string;
  difficulty?: Difficulty | "mixed";
  count: number;
  excludeIds?: string[];
}): InterviewQuestion[] {
  const exclude = new Set(opts.excludeIds ?? []);
  let pool = ALL_QUESTIONS.filter((q) => !exclude.has(q.id));

  if (opts.skill) {
    const skillLC = opts.skill.toLowerCase();
    pool = pool.filter((q) => q.category.toLowerCase() === skillLC);
  }

  if (opts.difficulty && opts.difficulty !== "mixed") {
    pool = pool.filter((q) => q.difficulty === opts.difficulty);
  }

  // Light shuffle so consecutive sessions don't see the same order. Stable
  // enough for a small bank — replace with seeded RNG when bank gets bigger.
  pool = pool.slice().sort(() => Math.random() - 0.5);

  return pool.slice(0, Math.max(1, Math.min(opts.count, pool.length)));
}

export function listSkills(): string[] {
  const set = new Set(ALL_QUESTIONS.map((q) => q.category));
  return Array.from(set);
}

// Count questions matching a given skill (category) name. Case-insensitive.
// Returns 0 for skills the bank doesn't cover yet — the UI uses this to
// surface "SQL · 12 questions" next to skill chips and quietly hide the
// count for skills with 0 (rather than discouraging the user).
export function countQuestionsBySkill(skill: string): number {
  const lc = skill.toLowerCase();
  return ALL_QUESTIONS.filter((q) => q.category.toLowerCase() === lc).length;
}
