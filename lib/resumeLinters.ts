// ── Resume-text linters ──────────────────────────────────────────────────────
// Rule-based checks that run client-side with zero LLM calls. Cheap, instant,
// deterministic. Used for inline red underlines and the scorecard readability
// number.

// ── Bullet strength ─────────────────────────────────────────────────────────
// A bullet is "strong" if it starts with a confident action verb AND contains
// at least one quantified metric. Used by Fix All to silently skip bullets
// that are already good — the user said "don't rewrite what's already fine
// unless I ask". Direct Fix clicks and Rewrite still honour the user's ask.

const STRONG_ACTION_VERBS = new Set([
  "led", "built", "shipped", "migrated", "architected", "scaled", "cut",
  "grew", "drove", "launched", "delivered", "reduced", "increased",
  "implemented", "designed", "developed", "automated", "orchestrated",
  "rebuilt", "refactored", "engineered", "optimized", "eliminated",
  "saved", "generated", "doubled", "tripled", "quadrupled", "accelerated",
  "streamlined", "pioneered", "spearheaded", "founded", "launched",
  "managed", "coordinated", "negotiated", "owned",
]);

// Matches: 40%, $2M, 3x, 10k, 100M, 5K, or any 3+ digit number
const METRIC_REGEX = /(\d+(?:\.\d+)?\s*%|\$\s*\d+(?:\.\d+)?\s*[KkMmBb]?|\d+\s*x\b|\d+\s*[KkMmBb]\b|\b\d{3,}\b)/;

export function isBulletStrong(bullet: string): boolean {
  if (!bullet) return false;
  const trimmed = bullet.trim();
  if (trimmed.length < 30) return false; // too short to be thorough

  // First word must be a recognised strong verb (case-insensitive, strip trailing punct)
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
  if (!STRONG_ACTION_VERBS.has(firstWord)) return false;

  // Must contain a metric
  if (!METRIC_REGEX.test(trimmed)) return false;

  return true;
}

// Convenience: given an extraction, return all sectionKeys for strong bullets.
export function strongBulletKeys(experience: { bullets: string[] }[] | undefined): string[] {
  if (!experience) return [];
  const keys: string[] = [];
  experience.forEach((exp, i) => {
    (exp.bullets ?? []).forEach((b, j) => {
      if (isBulletStrong(b)) keys.push(`experience.${i}.bullets.${j}`);
    });
  });
  return keys;
}

// ── Passive voice ────────────────────────────────────────────────────────────
// A rough heuristic: "to be" forms followed by a past participle.
// Not linguistically perfect — catches the common ones on resumes.
const BE_FORMS = ["is", "was", "were", "been", "being", "are", "am"];

// Common past-participle shape: ends in "ed" OR one of the irregulars we care about.
const IRREGULAR_PAST_PARTICIPLES = new Set([
  "built", "made", "given", "taken", "chosen", "led", "driven", "written",
  "seen", "done", "held", "run", "sent", "spent", "brought", "thought",
  "understood", "known", "shown", "forgotten", "found", "kept", "grown",
  "lost", "paid", "put", "read", "set", "shipped",
]);

function looksLikePastParticiple(word: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (IRREGULAR_PAST_PARTICIPLES.has(w)) return true;
  if (!w.endsWith("ed")) return false;
  // Filter false positives: "red", "bed", "need" etc.
  if (w.length < 4) return false;
  return true;
}

export interface PassiveSpan {
  start: number;
  end: number;
  phrase: string;
}

/**
 * Detect passive-voice spans. Returns character offsets in `text`.
 * Finds any "BE-form <word>+ <past-participle>" within a 3-word window.
 */
export function detectPassiveSpans(text: string): PassiveSpan[] {
  const spans: PassiveSpan[] = [];
  const tokenRegex = /\b[\w']+\b/g;
  const tokens: { word: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(text))) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!BE_FORMS.includes(tok.word.toLowerCase())) continue;
    // Look up to 3 tokens ahead for a past participle
    for (let j = i + 1; j <= Math.min(i + 3, tokens.length - 1); j++) {
      if (looksLikePastParticiple(tokens[j].word)) {
        spans.push({
          start: tok.start,
          end: tokens[j].end,
          phrase: text.slice(tok.start, tokens[j].end),
        });
        i = j; // skip past the match
        break;
      }
    }
  }
  return spans;
}

// ── Readability (Flesch-Kincaid reading ease) ────────────────────────────────

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const matches = cleaned.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

export interface ReadabilityResult {
  score: number;              // Flesch Reading Ease (higher = easier)
  label: "easy" | "fair" | "hard";
  wordCount: number;
  sentenceCount: number;
  avgSentenceLen: number;
}

export function fleschReadingEase(text: string): ReadabilityResult {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { score: 0, label: "fair", wordCount: 0, sentenceCount: 0, avgSentenceLen: 0 };

  const sentences = clean.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  const words = clean.split(/\s+/).filter(Boolean);
  const totalSyll = words.reduce((n, w) => n + countSyllables(w), 0);

  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const avgSentenceLen = wordCount / sentenceCount;
  const avgSyllPerWord = totalSyll / Math.max(1, wordCount);

  const score = 206.835 - 1.015 * avgSentenceLen - 84.6 * avgSyllPerWord;
  const rounded = Math.max(0, Math.min(100, Math.round(score)));

  const label: "easy" | "fair" | "hard" =
    rounded >= 60 ? "easy" : rounded >= 40 ? "fair" : "hard";

  return { score: rounded, label, wordCount, sentenceCount, avgSentenceLen: Math.round(avgSentenceLen * 10) / 10 };
}

// ── Cliché / buzzword detector ───────────────────────────────────────────────
// #33 in roadmap — minimal version ships now.
const CLICHES = [
  "results-driven",
  "team player",
  "hard worker",
  "go-getter",
  "detail-oriented",
  "thinks outside the box",
  "synergy",
  "synergies",
  "self-starter",
  "proven track record",
  "best-of-breed",
  "world-class",
  "cutting-edge",
  "leverage",
  "leveraging",
  "holistic approach",
  "mission-critical",
  "dynamic",
  "passionate",
  "motivated",
  "responsible for",
];

export interface ClicheSpan {
  start: number;
  end: number;
  phrase: string;
}

export function detectCliches(text: string): ClicheSpan[] {
  const spans: ClicheSpan[] = [];
  const lc = text.toLowerCase();
  for (const c of CLICHES) {
    let from = 0;
    while (true) {
      const idx = lc.indexOf(c, from);
      if (idx === -1) break;
      // Word boundary check
      const before = idx === 0 ? " " : lc[idx - 1];
      const after = idx + c.length >= lc.length ? " " : lc[idx + c.length];
      if (/\W/.test(before) && /\W/.test(after)) {
        spans.push({ start: idx, end: idx + c.length, phrase: text.slice(idx, idx + c.length) });
      }
      from = idx + c.length;
    }
  }
  return spans;
}
