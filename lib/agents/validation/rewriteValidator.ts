// ── Rewrite Validator ─────────────────────────────────────────────────────
// Structural / stylistic guardrails on a rewritten resume section.
// Complements traceabilityCheck.ts (which catches invented FACTS).
//
// Pulls banned-phrase regex + power-verb pool from lib/resumeFormatSpec.ts —
// the canonical Stackle Resume Format Spec v1 source of truth.
//
// What this catches:
// - Banned phrases (Spec §2 banned summary phrases)
// - Banned summary openers (Spec §2)
// - Banned bullet starters (Spec §4)
// - Word-count violations (bullets 15-25, summary 50-80)
// - First-person violations in summaries
// - Multi-sentence bullets / semicolons
// - Missing power-verb opener on bullets (Spec §4 power verb list)

import {
  ALL_POWER_VERBS,
  BANNED_BULLET_STARTERS as SPEC_BANNED_BULLET_STARTERS,
  BANNED_SUMMARY_OPENERS as SPEC_BANNED_SUMMARY_OPENERS,
  BANNED_SUMMARY_PHRASES as SPEC_BANNED_SUMMARY_PHRASES,
  WORD_COUNTS,
} from "@/lib/resumeFormatSpec";

export type ValidationIssue = {
  rule: string;
  message: string;
  severity: "error" | "warn";
};

// First-person pronouns — summary must be third person per spec.
const FIRST_PERSON = [
  /\bI\b/, /\bmy\b/i, /\bme\b/i, /\bmyself\b/i,
];

// Word-count using simple whitespace tokenization. Good enough for our
// 15-25 / 50-90 ranges; we don't need linguistic accuracy.
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function validateSummary(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!text?.trim()) return issues;

  // Word count — Spec §2: 50-80 ideal. Warn outside, error past hard floor/ceiling.
  const wc = wordCount(text);
  if (wc < WORD_COUNTS.summary.hardFloor) {
    issues.push({ rule: "summary-words", severity: "error",
      message: `Summary is ${wc} words — under ${WORD_COUNTS.summary.hardFloor}. Far too thin; expand to 50-80 with role + 2-3 metrics + value prop.` });
  } else if (wc < WORD_COUNTS.summary.ideal.min) {
    issues.push({ rule: "summary-words", severity: "warn",
      message: `Summary is ${wc} words — under 50. Add a sentence with key technologies or achievements.` });
  }
  if (wc > WORD_COUNTS.summary.hardCeiling) {
    issues.push({ rule: "summary-words", severity: "error",
      message: `Summary is ${wc} words — over ${WORD_COUNTS.summary.hardCeiling}. Tighten to 50-80 words.` });
  } else if (wc > WORD_COUNTS.summary.ideal.max) {
    issues.push({ rule: "summary-words", severity: "warn",
      message: `Summary is ${wc} words — over 80. Trim to 50-80 (Spec §2 target).` });
  }

  // First-person check — Spec §2: must be third person.
  for (const re of FIRST_PERSON) {
    if (re.test(text)) {
      issues.push({ rule: "summary-first-person", severity: "error",
        message: `Summary uses first-person pronoun. Drop "I/my/me" — start with the role instead. Spec §2 mandates third person.` });
      break;
    }
  }

  // Banned summary openers — Spec §2.
  for (const re of SPEC_BANNED_SUMMARY_OPENERS) {
    if (re.test(text)) {
      issues.push({ rule: "summary-banned-opener", severity: "error",
        message: `Summary opens with a banned phrase (Spec §2). Drop it and lead with "[Role] with [N]+ years..." instead.` });
      break;
    }
  }

  // Banned summary phrases anywhere — Spec §2.
  for (const re of SPEC_BANNED_SUMMARY_PHRASES) {
    if (re.test(text)) {
      issues.push({ rule: "summary-banned-phrase", severity: "error",
        message: `Summary contains a banned phrase (Spec §2): ${re.source}. Drop it — recruiters tune out clichés.` });
    }
  }

  return issues;
}

export function validateBullet(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!text?.trim()) return issues;

  const trimmed = text.trim().replace(/^[-•*]\s+/, "");

  // Word count — Spec §4: 15-25 ideal. Warn outside, error past hard floor/ceiling.
  const wc = wordCount(trimmed);
  if (wc > WORD_COUNTS.bullet.hardCeiling) {
    issues.push({ rule: "bullet-words", severity: "error",
      message: `Bullet is ${wc} words — over ${WORD_COUNTS.bullet.hardCeiling}. Cut adjectives, drop "in order to", remove secondary clauses, keep one metric. Spec §4 target: 15-25.` });
  } else if (wc > WORD_COUNTS.bullet.ideal.max) {
    issues.push({ rule: "bullet-words", severity: "warn",
      message: `Bullet is ${wc} words — over 25. Tighten to 15-25 (Spec §4).` });
  }
  if (wc < WORD_COUNTS.bullet.hardFloor) {
    issues.push({ rule: "bullet-words", severity: "warn",
      message: `Bullet is ${wc} words — under ${WORD_COUNTS.bullet.hardFloor}. Likely missing scope or outcome.` });
  }

  // No semicolons — Spec §4: single sentence.
  if (/;/.test(trimmed)) {
    issues.push({ rule: "bullet-semicolon", severity: "error",
      message: `Bullet contains a semicolon. Split into one tight sentence (Spec §4).` });
  }

  // Detect multi-sentence bullets.
  if (/\.\s+[A-Z]/.test(trimmed.replace(/\.$/, ""))) {
    issues.push({ rule: "bullet-multi-sentence", severity: "error",
      message: `Bullet is multiple sentences. Pick the strongest one (Spec §4).` });
  }

  // Banned starters — Spec §4.
  for (const re of SPEC_BANNED_BULLET_STARTERS) {
    if (re.test(trimmed)) {
      issues.push({ rule: "bullet-banned-starter", severity: "error",
        message: `Bullet starts with a banned phrase ("${trimmed.slice(0, 30)}…"). Use a power verb (Built / Designed / Led / Reduced / etc.) instead. Spec §4.` });
      break;
    }
  }

  // Power-verb opener — Spec §4. Cross-check against the full categorised pool.
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (firstWord && !ALL_POWER_VERBS.has(firstWord)) {
    issues.push({ rule: "bullet-no-power-verb", severity: "warn",
      message: `Bullet opens with "${firstWord}" — not on the Spec §4 power-verb list. Try Led / Built / Designed / Optimized / Reduced / Mentored / etc.` });
  }

  return issues;
}

// Run the right validator for a given sectionKey. Returns a flat issues
// array. Empty array = clean.
export function validateRewrite(sectionKey: string, content: string): ValidationIssue[] {
  if (sectionKey === "summary") return validateSummary(content);
  if (/^experience\.\d+\.bullets\.\d+$/.test(sectionKey)) return validateBullet(content);
  // Skills, education, projects — no structural validator yet. The
  // skills-gap prompt handles those. Return empty.
  return [];
}

// Format issues as a single feedback paragraph the writer re-consumes on
// regenerate.
export function describeValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "";
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");
  const lines: string[] = ["Your previous rewrite failed validation:"];
  for (const i of errors) lines.push(`  ✗ ${i.message}`);
  for (const i of warns) lines.push(`  ⚠ ${i.message}`);
  lines.push("");
  lines.push("Regenerate the rewrite fixing every error above. Warnings are nice-to-haves; errors are blockers.");
  return lines.join("\n");
}

// Convenience: should we accept the rewrite as-is?
export function passesValidation(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === "error");
}
