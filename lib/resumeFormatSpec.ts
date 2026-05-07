// ── Stackle Resume Format Specification v1 — typed constants ─────────────
//
// Machine-readable subset of docs/stackle-resume-format-spec-v1.md. Used by
// the rewrite validator, by the writer prompts (via embedded references),
// and by the renderer (future commit). This is the single source of truth
// for "what a Stackle-shaped resume looks like".
//
// Any change here must be reflected in docs/stackle-resume-format-spec-v1.md
// and vice versa. The .md is the human contract; this file is the
// machine contract.

export const SECTION_ORDER_BY_LEVEL = {
  newGrad:  ["header", "summary", "skills", "education", "projects", "experience", "certifications"],
  midLevel: ["header", "summary", "skills", "experience", "projects", "education", "certifications"],
  senior:   ["header", "summary", "experience", "skills", "education", "projects", "certifications"],
} as const;

// The strict 8-category skills taxonomy. These names are fixed — not
// "Big Data and Streaming" or "Pipelines and ETL" or other variants the
// model has tried to invent. Every Stackle-rewritten resume's skillGroups
// uses ONLY these category names, in this exact order, with empty
// categories returned as empty arrays so the renderer can hide them.
export const SKILL_CATEGORIES_8 = [
  "Languages",
  "Data Processing & ETL",
  "Cloud Platforms",
  "Data Warehousing & Storage",
  "Visualization & BI",
  "CI/CD & DevOps",
  "Data Quality & Observability",
  "ML & Analytics",
] as const;

export type SkillCategory = typeof SKILL_CATEGORIES_8[number];

// Power verb pool. Bullets must open with one of these. The validator
// flattens this into ALL_POWER_VERBS for fast membership checks.
export const POWER_VERBS = {
  leadership: ["Led", "Owned", "Drove", "Spearheaded", "Championed", "Orchestrated", "Directed", "Founded", "Established"],
  building:   ["Built", "Designed", "Architected", "Developed", "Engineered", "Implemented", "Constructed", "Launched", "Deployed"],
  improving:  ["Optimized", "Reduced", "Increased", "Improved", "Streamlined", "Accelerated", "Enhanced", "Refactored", "Automated", "Eliminated"],
  analysis:   ["Analyzed", "Identified", "Evaluated", "Assessed", "Diagnosed", "Researched", "Investigated"],
  collab:     ["Partnered", "Collaborated", "Coordinated", "Mentored", "Trained", "Influenced"],
} as const;

export const ALL_POWER_VERBS: ReadonlySet<string> = new Set(
  Object.values(POWER_VERBS).flat().map((v) => v.toLowerCase()),
);

// Banned bullet starters — a single regex hit is an error. Spec §4.
export const BANNED_BULLET_STARTERS: ReadonlyArray<RegExp> = [
  /^responsible for\b/i,
  /^helped with\b/i,
  /^worked on\b/i,
  /^assisted in\b/i,
  /^tasks included\b/i,
  /^duties involved\b/i,
  /^was part of\b/i,
  /^participated in\b/i,
  // "contributed to" is allowed only when followed by a measurable outcome
  // — checked separately as a warning, not a hard error.
];

// Banned summary openers — spec §2. Warm-up phrases the model uses when
// it's afraid to commit. Strict reject; the writer must lead with a
// concrete role identifier.
export const BANNED_SUMMARY_OPENERS: ReadonlyArray<RegExp> = [
  /^I am a motivated\b/i,
  /^I am a\b/i,
  /^passionate about\b/i,
  /^results[-\s]?driven\b/i,
  /^dynamic professional\b/i,
  /^seeking opportunities\b/i,
  /^hardworking\b/i,
  /^team player\b/i,
  /^detail[-\s]?oriented\b/i,
];

// Banned phrases anywhere in the summary — spec §2. Cliché signals that
// recruiters tune out.
export const BANNED_SUMMARY_PHRASES: ReadonlyArray<RegExp> = [
  /\bout[-\s]?of[-\s]?the[-\s]?box\b/i,
  /\bsynergy\b/i,
  /\bgo[-\s]?getter\b/i,
  /\bhit the ground running\b/i,
  /\bwear many hats\b/i,
  /\bself[-\s]?starter\b/i,
  /\bproven track record\b/i,
];

// Per-role-age bullet count targets. Spec §4. The writer prompt enforces
// these; the validator surfaces violations as warnings (hard errors would
// require structural rewrite which is out of single-bullet scope).
export const BULLETS_PER_ROLE = {
  mostRecent: { min: 4, max: 6 },
  previous:   { min: 3, max: 4 },
  older:      { min: 2, max: 3 },
  internship: { min: 1, max: 2 },
} as const;

// Word count windows. Spec §2 (summary 50-80) and §4 (bullets 15-25).
// Validator severity: outside ideal → warn; outside ceiling → error.
export const WORD_COUNTS = {
  summary: { ideal: { min: 50, max: 80 }, hardFloor: 30, hardCeiling: 100 },
  bullet:  { ideal: { min: 15, max: 25 }, hardFloor: 6,  hardCeiling: 30 },
} as const;

// Simple level classifier from years of experience. Drives section order
// (renderer + writer prompt) and per-section content density (education
// detail level, certs filter, etc.).
export type ExperienceLevel = "newGrad" | "midLevel" | "senior";

export function classifyExperienceLevel(years: number | null | undefined): ExperienceLevel {
  if (typeof years !== "number" || !isFinite(years) || years < 1) return "newGrad";
  if (years < 8) return "midLevel";
  return "senior";
}
