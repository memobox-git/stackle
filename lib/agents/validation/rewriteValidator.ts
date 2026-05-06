// ── Rewrite Validator ─────────────────────────────────────────────────────
// Structural / stylistic guardrails on a rewritten resume section.
// Complements traceabilityCheck.ts (which catches invented FACTS).
//
// What this catches:
// - Banned phrases ("results-driven", "passionate", "I am", etc.)
// - Banned bullet starters ("Responsible for", "Helped with", etc.)
// - Word-count violations (bullets over 20w, summary outside 50–90w)
// - First-person violations in summaries ("I", "my", "me")
// - Multi-sentence bullets / semicolons
// - Missing power-verb opener on bullets

export type ValidationIssue = {
  rule: string;
  message: string;
  severity: "error" | "warn";
};

const BANNED_SUMMARY_PHRASES = [
  /\bI am a motivated\b/i,
  /\bpassionate about\b/i,
  /\bseeking opportunities\b/i,
  /\bdynamic professional\b/i,
  /\bresults[-\s]?driven\b/i,
  /\bexperienced in\b/i, // banned only as opener — checked separately too
  /\bproven track record\b/i,
  /\bhighly motivated\b/i,
  /\bgo[-\s]?getter\b/i,
  /\bteam player\b/i,
  /\bself[-\s]?starter\b/i,
];

const FIRST_PERSON = [
  /\bI\b/, /\bmy\b/i, /\bme\b/i, /\bmyself\b/i,
];

const BANNED_BULLET_STARTERS = [
  /^responsible for\b/i,
  /^helped with\b/i,
  /^worked on\b/i,
  /^assisted in\b/i,
  /^involved in\b/i,
  /^participated in\b/i,
  /^tasked with\b/i,
  /^duties included\b/i,
  /^in charge of\b/i,
  /^was part of\b/i,
  /^tasks included\b/i,
];

const APPROVED_VERBS = new Set([
  "led", "owned", "drove", "spearheaded", "orchestrated", "directed",
  "built", "designed", "architected", "developed", "engineered", "implemented",
  "delivered", "reduced", "increased", "improved", "optimized", "accelerated",
  "shipped", "migrated", "rebuilt", "scaled", "cut", "grew", "launched",
  "automated", "modernized", "productionized", "consolidated", "refactored",
  "mentored", "analyzed", "modeled", "evaluated", "produced", "partnered",
  "identified", "diagnosed", "assessed", "negotiated",
]);

// Word-count using simple whitespace tokenization. Good enough for our
// 15-25 / 50-90 ranges; we don't need linguistic accuracy.
function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function validateSummary(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!text?.trim()) return issues;

  const wc = wordCount(text);
  if (wc < 40) {
    issues.push({ rule: "summary-words", severity: "warn",
      message: `Summary is ${wc} words — under 40. Add a sentence with key technologies or achievements.` });
  }
  if (wc > 100) {
    issues.push({ rule: "summary-words", severity: "error",
      message: `Summary is ${wc} words — over 100. Tighten to 50–90 words.` });
  }

  for (const re of FIRST_PERSON) {
    if (re.test(text)) {
      issues.push({ rule: "summary-first-person", severity: "error",
        message: `Summary uses first-person pronoun (matched ${re}). Drop "I/my/me" — start with a verb instead.` });
      break;
    }
  }

  for (const re of BANNED_SUMMARY_PHRASES) {
    if (re.test(text)) {
      issues.push({ rule: "summary-banned-phrase", severity: "error",
        message: `Summary contains a banned phrase matching ${re.source}. Drop it.` });
    }
  }

  return issues;
}

export function validateBullet(text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!text?.trim()) return issues;

  const trimmed = text.trim().replace(/^[-•*]\s+/, "");

  const wc = wordCount(trimmed);
  if (wc > 20) {
    issues.push({ rule: "bullet-words", severity: "error",
      message: `Bullet is ${wc} words — over 20. Tighten to 12-18 words. Pick the single strongest metric, drop secondary clauses.` });
  }
  if (wc < 6) {
    issues.push({ rule: "bullet-words", severity: "warn",
      message: `Bullet is ${wc} words — under 6. Likely missing scope or outcome.` });
  }

  // No semicolons; minimum compound sentences. We allow ONE comma-joined
  // outcome ("...reducing X by N% and Y by P%") but reject semicolons.
  if (/;/.test(trimmed)) {
    issues.push({ rule: "bullet-semicolon", severity: "error",
      message: `Bullet contains a semicolon. Split into one tight sentence.` });
  }

  // Detect multi-sentence bullets (period mid-string followed by capital letter).
  if (/\.\s+[A-Z]/.test(trimmed.replace(/\.$/, ""))) {
    issues.push({ rule: "bullet-multi-sentence", severity: "error",
      message: `Bullet is multiple sentences. Pick the strongest one.` });
  }

  for (const re of BANNED_BULLET_STARTERS) {
    if (re.test(trimmed)) {
      issues.push({ rule: "bullet-banned-starter", severity: "error",
        message: `Bullet starts with a banned phrase ("${trimmed.slice(0, 30)}…"). Use a power verb instead.` });
      break;
    }
  }

  // Power-verb check — look at the first word, lowercase it, compare.
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (firstWord && !APPROVED_VERBS.has(firstWord)) {
    issues.push({ rule: "bullet-no-power-verb", severity: "warn",
      message: `Bullet opens with "${firstWord}" — not on the approved power-verb list. Consider Built / Designed / Led / Reduced / Increased / etc.` });
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
