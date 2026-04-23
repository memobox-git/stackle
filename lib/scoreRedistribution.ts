// Client-side score redistribution.
//
// The analyze endpoint runs once at upload and returns category scores
// (ATS / Content & Impact / Structure / Keywords / Seniority) + a total.
// When the user accepts a priority rewrite they earn +N points (HIGH=4 /
// MEDIUM=2 / LOW=1), but the CATEGORY bars stay frozen unless we re-run
// the full analyzer — expensive and slow per-accept.
//
// This util redistributes the earned points into the right category by
// keyword-matching the priority action string. The category is bumped up
// to its max. Shows real movement without a round-trip to the model.

import type { ResumeAnalysis, ScoreCategory } from "@/lib/agents/schemas/resumeIntelligence";

// Legacy fallback — mirrors the logic in ResumeReportCard + ResumeInsightCard
// so analyses produced before the five-category schema still get a starting
// score object to bump. Without this, legacy analyses never move because the
// renderers derive scores from atsHeuristics/strengths/etc. every render and
// ignore any mutations we make.
function badge(s: number, max: number): ScoreCategory["status"] {
  const pct = max > 0 ? s / max : 0;
  if (pct >= 0.85) return "STRONG";
  if (pct >= 0.7) return "GOOD";
  if (pct >= 0.5) return "REVIEW";
  return "WEAK";
}

function deriveScoresFromLegacy(a: ResumeAnalysis): ResumeAnalysis["scores"] {
  const atsS = a.atsHeuristics.score > 0 ? Math.round(a.atsHeuristics.score) : 14;
  const contentS = Math.min(25, Math.round(25 * (a.strengths.length / Math.max(a.strengths.length + a.weaknesses.length, 1))));
  const structS = a.atsHeuristics.scanabilityRisk === "low" ? 17 : a.atsHeuristics.scanabilityRisk === "medium" ? 14 : 10;
  const kwS = Math.max(5, 20 - a.keywordGaps.length * 2);
  const senS = 10;
  const total = atsS + contentS + structS + kwS + senS;
  return {
    atsCompatibility:    { score: atsS,     max: 20, status: badge(atsS, 20),     deductions: [] },
    contentImpact:       { score: contentS, max: 25, status: badge(contentS, 25), deductions: [] },
    structureFormatting: { score: structS,  max: 20, status: badge(structS, 20),  deductions: [] },
    keywordCoverage:     { score: kwS,      max: 20, status: badge(kwS, 20),      deductions: [] },
    senioritySignal:     { score: senS,     max: 15, status: badge(senS, 15),     deductions: [] },
    total,
    projectedPostFix: `${Math.min(100, total + 10)}-${Math.min(100, total + 15)}`,
  };
}

function hasValidScores(s: ResumeAnalysis["scores"] | undefined): boolean {
  return !!s && typeof s === "object" && !!s.atsCompatibility && typeof s.atsCompatibility.score === "number";
}

type CategoryKey =
  | "atsCompatibility"
  | "contentImpact"
  | "structureFormatting"
  | "keywordCoverage"
  | "senioritySignal";

// Ordered so first match wins. More-specific patterns go first.
const CATEGORY_PATTERNS: { key: CategoryKey; patterns: RegExp[] }[] = [
  {
    key: "keywordCoverage",
    patterns: [/\bkeyword/i, /\bats\s+keyword/i, /\bsearchab/i, /\bterms?\b/i],
  },
  {
    key: "atsCompatibility",
    patterns: [/\bats\b/i, /\bparse/i, /\bformatting[- ]?risk/i, /\bcolumn/i, /\btable\b/i, /\bheader\b/i],
  },
  {
    key: "senioritySignal",
    patterns: [/\bsenior/i, /\bsenior[- ]?signal/i, /\blead(?:ership)?\b/i, /\bscope\b/i, /\bstaff\b/i, /\bprincipal\b/i, /\bmanaged\b/i, /\bteam size/i],
  },
  {
    key: "structureFormatting",
    patterns: [/\bstructure/i, /\blength/i, /\border/i, /\breorder/i, /\bformat/i, /\bsection\b/i, /\bheading/i, /\bwhitespace/i, /\bspacing/i, /\bfont\b/i, /\bbullet[- ]?count/i],
  },
  {
    key: "contentImpact",
    patterns: [
      /\bimpact\b/i, /\bquantif/i, /\bmetric/i, /\boutcome/i, /\bresult/i,
      /\bbullet\b/i, /\bsummary\b/i, /\brewrite\b/i, /\bstrong(?:er)?\s+verb/i,
      /\baction\s+verb/i, /\bachiev/i, /\bnumber/i, /\bpercent/i,
    ],
  },
];

function pickCategory(action: string): CategoryKey {
  for (const group of CATEGORY_PATTERNS) {
    if (group.patterns.some((re) => re.test(action))) return group.key;
  }
  // Safe default — content & impact is the biggest bucket and most rewrites
  // land there anyway.
  return "contentImpact";
}

function pointsForAction(action: string): number {
  const u = action.toUpperCase();
  if (u.startsWith("HIGH")) return 4;
  if (u.startsWith("MEDIUM")) return 2;
  return 1;
}

function bumpCategory(cat: ScoreCategory, delta: number): ScoreCategory {
  const nextScore = Math.min(cat.max, cat.score + delta);
  // Status re-computed so visual badge keeps up with the bump. Same ratio
  // thresholds the analyze prompt uses.
  const pct = cat.max > 0 ? nextScore / cat.max : 0;
  const status: ScoreCategory["status"] =
    pct >= 0.88 ? "STRONG" : pct >= 0.7 ? "GOOD" : pct >= 0.5 ? "REVIEW" : "WEAK";
  return { ...cat, score: nextScore, status };
}

/**
 * Returns a cloned analysis with category scores + total bumped based on
 * each accepted action. Never mutates the input. Call once per render
 * with the full acceptedActions array.
 */
export function applyAcceptedFixesToAnalysis(
  analysis: ResumeAnalysis,
  acceptedActions: string[],
): ResumeAnalysis {
  // Seed a scores object from the legacy fields if the analysis doesn't
  // already have one — otherwise bumping atsCompatibility.score bumps
  // undefined and the render silently falls back to the same legacy values.
  const baseScores = hasValidScores(analysis.scores) ? analysis.scores : deriveScoresFromLegacy(analysis);
  if (!acceptedActions.length) return { ...analysis, scores: baseScores };

  const scores = { ...baseScores };
  // Shallow-clone each category so we can immutably bump.
  (Object.keys(scores) as (keyof ResumeAnalysis["scores"])[]).forEach((k) => {
    if (k === "total" || k === "projectedPostFix") return;
    const val = scores[k] as ScoreCategory | undefined;
    if (val && typeof val === "object" && "score" in val) {
      scores[k] = { ...val } as ResumeAnalysis["scores"][typeof k];
    }
  });

  for (const action of acceptedActions) {
    const key = pickCategory(action);
    const pts = pointsForAction(action);
    const cat = scores[key];
    if (cat && typeof cat === "object" && "score" in cat) {
      (scores as Record<string, ScoreCategory | number | string>)[key] = bumpCategory(cat, pts);
    }
  }

  const newTotal =
    (scores.atsCompatibility?.score ?? 0) +
    (scores.contentImpact?.score ?? 0) +
    (scores.structureFormatting?.score ?? 0) +
    (scores.keywordCoverage?.score ?? 0) +
    (scores.senioritySignal?.score ?? 0);

  scores.total = Math.min(100, newTotal);

  return { ...analysis, scores };
}

/**
 * Convenience: given the full priorities list + a Set of accepted indices,
 * return the analysis with category bumps applied.
 */
export function analysisWithAccepted(
  analysis: ResumeAnalysis | null | undefined,
  priorities: string[] | undefined,
  acceptedIndices: Set<number> | undefined,
): ResumeAnalysis | null {
  if (!analysis) return null;
  const acceptedActions = priorities && acceptedIndices
    ? priorities.filter((_, i) => acceptedIndices.has(i))
    : [];
  // Always run the redistributor so legacy analyses get their scores seeded
  // even before any fix is accepted. Zero accepts = just the seed + no bumps.
  return applyAcceptedFixesToAnalysis(analysis, acceptedActions);
}
