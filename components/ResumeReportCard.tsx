"use client";

/**
 * ResumeReportCard — redesigned for visual hierarchy.
 * Sections, top to bottom:
 *   1. Hero — score circle (110px) on left, tier badge + name + 1-line
 *      summary on right; sub-score row with vertical dividers underneath.
 *   2. The Bottom Line — its own card, larger type.
 *   3. Role-Fit Benchmark — two cards side by side with arrow + missing-
 *      signal pills.
 *   4. Strengths / Weaknesses — equal-width tinted cards (green / amber).
 *   5. ATS Keyword Audit — present + recommended chips.
 *   6. Prioritized Action Plan — top 4 by default, expand for more, score
 *      impact callouts.
 *
 * Removed: bullet-quality monospace table, first-impression-scan strip,
 * heavy divider lines. Spacing and value-contrast define sections instead.
 */

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { ResumeAnalysis, ScoreCategory } from "@/lib/agents/schemas/resumeIntelligence";
import { tierLabel } from "@/lib/score";

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 0.75) return "#16a34a";
  if (pct >= 0.5) return "#d97706";
  return "#dc2626";
}

// Tier badge colours per surface. Label comes from the shared tierLabel()
// in lib/score.ts so the chat welcome, Report hero, and any future surface
// always agree on what 73 means.
function tierBadge(total: number): { label: string; color: string; bg: string; border: string } {
  const label = tierLabel(total).toUpperCase();
  if (total >= 88) return { label, color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" };
  if (total >= 75) return { label, color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" };
  if (total >= 60) return { label, color: "#b45309", bg: "#fffbeb", border: "#fde68a" };
  return { label, color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };
}

function priorityColor(label: string) {
  if (label.startsWith("HIGH")) return { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" };
  if (label.startsWith("MEDIUM")) return { bg: "#fffbeb", border: "#fde68a", text: "#b45309" };
  return { bg: "#eef2ff", border: "#c7d2fe", text: "#4338ca" };
}

function extractPriority(action: string): string {
  const u = action.toUpperCase();
  if (u.startsWith("HIGH")) return "HIGH";
  if (u.startsWith("MEDIUM")) return "MEDIUM";
  if (u.startsWith("LOW")) return "LOW";
  return "MEDIUM";
}

function deriveScoresFromLegacy(a: ResumeAnalysis) {
  const atsS = a.atsHeuristics.score > 0 ? Math.round(a.atsHeuristics.score) : 14;
  const contentS = Math.min(25, Math.round(25 * (a.strengths.length / Math.max(a.strengths.length + a.weaknesses.length, 1))));
  const structS = a.atsHeuristics.scanabilityRisk === "low" ? 17 : a.atsHeuristics.scanabilityRisk === "medium" ? 14 : 10;
  const kwS = Math.max(5, 20 - a.keywordGaps.length * 2);
  const senS = 10;
  const total = atsS + contentS + structS + kwS + senS;
  const status = (s: number, max: number): ScoreCategory["status"] => {
    const pct = s / max;
    if (pct >= 0.85) return "STRONG";
    if (pct >= 0.70) return "GOOD";
    if (pct >= 0.50) return "REVIEW";
    return "WEAK";
  };
  return {
    atsCompatibility: { score: atsS, max: 20, status: status(atsS, 20), deductions: [] },
    contentImpact: { score: contentS, max: 25, status: status(contentS, 25), deductions: [] },
    structureFormatting: { score: structS, max: 20, status: status(structS, 20), deductions: [] },
    keywordCoverage: { score: kwS, max: 20, status: status(kwS, 20), deductions: [] },
    senioritySignal: { score: senS, max: 15, status: status(senS, 15), deductions: [] },
    total,
    projectedPostFix: `${Math.min(100, total + 10)}-${Math.min(100, total + 15)}`,
  };
}

// Reusable card wrapper. Subtle border, generous padding, soft radius.
function Card({ children, style, tone }: { children: React.ReactNode; style?: React.CSSProperties; tone?: "neutral" | "green" | "amber" | "violet" | "blue" }) {
  const tones = {
    neutral: { bg: "#ffffff", border: "#e5e7eb" },
    green:   { bg: "#f0fdf4", border: "#bbf7d0" },
    amber:   { bg: "#fffbeb", border: "#fde68a" },
    violet:  { bg: "#f5f3ff", border: "#ddd6fe" },
    blue:    { bg: "#eff6ff", border: "#bfdbfe" },
  };
  const t = tones[tone ?? "neutral"];
  return (
    <div style={{
      background: t.bg,
      border: `1px solid ${t.border}`,
      borderRadius: "12px",
      padding: "24px",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "11px",
      fontWeight: 500,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color: "#9ca3af",
      marginBottom: "12px",
    }}>
      {children}
    </div>
  );
}

// Strip the leading "HIGH — " / "MEDIUM —" / "LOW —" prefix from an action.
function cleanAction(action: string): string {
  return action.replace(/^(HIGH|MEDIUM|LOW)\s*[—–-]\s*/i, "");
}

// Substitute "the candidate" / "candidate" with the user's first name so
// the report reads as if it's about them, not a clinical case study.
function humanise(text: string, firstName: string | undefined): string {
  if (!text) return text;
  const name = (firstName ?? "").trim();
  if (!name) return text;
  return text
    .replace(/\bthe candidate\b/gi, name)
    .replace(/\bcandidates?\b/gi, name);
}

// Extract first name from a full name string (handles single-word and
// multi-word names; falls back to the whole string).
function firstNameOf(full: string | undefined): string | undefined {
  if (!full) return undefined;
  const t = full.trim();
  if (!t) return undefined;
  return t.split(/\s+/)[0];
}

// Build a per-priority score impact array. Each priority gets a DIFFERENT
// point value within its tier so the AI Coach's Fastest Win and Biggest
// Impact tiles never read as "+6 / +6" (which made the user question the
// math). Within-tier descending values, no two priorities share a number
// unless the priority list is longer than the tier value pool.
//
//   HIGH   → 12, 10, 9, 8, 7, 6 (descending by within-tier index)
//   MEDIUM → 5, 4, 3
//   LOW    → 2, 1
//
// `current` and `projected` are advisory — we used to scale the values to
// the projection range, but that made everything cluster at the bottom of
// the tier when projected lift was small. Fixed values per tier-position
// is more honest and easier to read.
function buildImpacts(priorities: string[], _current: number, _projected?: string): number[] {
  const tiers = priorities.map((a) => extractPriority(a));
  const HIGH_SCHEDULE   = [12, 10, 9, 8, 7, 6];
  const MEDIUM_SCHEDULE = [5, 4, 3];
  const LOW_SCHEDULE    = [2, 1];

  const counters = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  return priorities.map((_, i) => {
    const t = tiers[i] === "HIGH" ? "HIGH" : tiers[i] === "MEDIUM" ? "MEDIUM" : "LOW";
    const idx = counters[t]++;
    if (t === "HIGH")   return HIGH_SCHEDULE[Math.min(idx, HIGH_SCHEDULE.length - 1)];
    if (t === "MEDIUM") return MEDIUM_SCHEDULE[Math.min(idx, MEDIUM_SCHEDULE.length - 1)];
    return LOW_SCHEDULE[Math.min(idx, LOW_SCHEDULE.length - 1)];
  });
}

// ── Score Deductions card ─────────────────────────────────────────────────
// Tabbed view of what's costing points per category. Replaced the prior
// stacked-list layout that pushed the page long. Tabs stay inside one
// card; only the active category renders below — short, scannable.
//
// Each deduction is a single line with a leading "– N pt" pill on the
// left so the user can scan the cost at a glance. The full reason text
// from the analyzer is preserved (we don't truncate the model's words),
// but the visual chrome is minimal — no boxes, no left-border accents.
function ScoreDeductionsCard({ scores }: { scores: ResumeAnalysis["scores"] }) {
  const cats: { key: string; label: string; deductions: string[]; score: number; max: number }[] = [
    { key: "ats",     label: "ATS",       deductions: scores?.atsCompatibility?.deductions ?? [],     score: scores?.atsCompatibility?.score ?? 0,    max: scores?.atsCompatibility?.max ?? 20 },
    { key: "content", label: "Content",   deductions: scores?.contentImpact?.deductions ?? [],        score: scores?.contentImpact?.score ?? 0,        max: scores?.contentImpact?.max ?? 25 },
    { key: "format",  label: "Format",    deductions: scores?.structureFormatting?.deductions ?? [],  score: scores?.structureFormatting?.score ?? 0,  max: scores?.structureFormatting?.max ?? 20 },
    { key: "keyword", label: "Keywords",  deductions: scores?.keywordCoverage?.deductions ?? [],      score: scores?.keywordCoverage?.score ?? 0,      max: scores?.keywordCoverage?.max ?? 20 },
    { key: "senior",  label: "Seniority", deductions: scores?.senioritySignal?.deductions ?? [],      score: scores?.senioritySignal?.score ?? 0,      max: scores?.senioritySignal?.max ?? 15 },
  ].filter((c) => c.deductions.length > 0);

  // Default-active tab = the category with the largest gap (max − score),
  // so the user lands on the biggest opportunity first.
  const [active, setActive] = useState<string>(() => {
    if (cats.length === 0) return "";
    const sorted = [...cats].sort((a, b) => (b.max - b.score) - (a.max - a.score));
    return sorted[0].key;
  });

  if (cats.length === 0) return null;
  const activeCat = cats.find((c) => c.key === active) ?? cats[0];

  // Try to extract a leading "-N" point cost from the deduction string
  // (analyzer already produces "Bullet X is task-based: -1"). We pull it
  // out so we can render it as a pill — keeps the body clean.
  function splitCost(d: string): { body: string; cost: string | null } {
    const m = d.match(/^(.*?)[:\s]+-\s*(\d+(?:\.\d+)?)\s*$/);
    if (m) return { body: m[1].trim().replace(/[:\s,–-]+$/, ""), cost: `−${m[2]}` };
    return { body: d, cost: null };
  }

  return (
    <Card>
      <SectionLabel>Score Deductions</SectionLabel>

      {/* Tab strip — single row, underline-active, no boxes */}
      <div style={{ display: "flex", gap: "16px", borderBottom: "1px solid #e4e4e7", marginBottom: "14px" }}>
        {cats.map((c) => {
          const isActive = c.key === active;
          const gap = c.max - c.score;
          return (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              style={{
                background: "transparent",
                border: "none",
                padding: "0 0 8px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "#18181b" : "#71717a",
                borderBottom: isActive ? "2px solid #18181b" : "2px solid transparent",
                marginBottom: "-1px",
                display: "inline-flex",
                alignItems: "baseline",
                gap: "6px",
              }}
            >
              {c.label}
              <span style={{ fontSize: "11px", color: "#a1a1aa", fontFamily: "monospace" }}>
                −{gap}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active deductions — plain rows, leading −N pill, body text */}
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
        {activeCat.deductions.map((d, i) => {
          const { body, cost } = splitCost(d);
          return (
            <li key={i} style={{ display: "flex", gap: "10px", alignItems: "baseline", fontSize: "13px", color: "#3f3f46", lineHeight: 1.5 }}>
              {cost && (
                <span style={{
                  flexShrink: 0,
                  fontSize: "11px",
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: "#dc2626",
                  minWidth: "32px",
                  textAlign: "right",
                }}>
                  {cost}
                </span>
              )}
              <span style={{ flex: 1 }}>{body}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResumeReportCard({
  analysis,
  candidateName,
  onFixItem,
  onFixAll,
  onAcceptAll,
  completedActions,
  acceptedActions,
  isFinalized,
}: {
  analysis: ResumeAnalysis;
  candidateName?: string;
  onFixItem?: (action: string, index: number) => void;
  onFixAll?: () => void;
  /** Auto-accept every pending priority — no per-fix review. New in v3. */
  onAcceptAll?: () => void;
  completedActions?: Set<number>;
  acceptedActions?: Set<number>;
  isFinalized?: boolean;
}) {
  const scores = analysis.scores ?? deriveScoresFromLegacy(analysis);
  const total = scores.total;
  const tier = tierBadge(total);

  // First name — used to humanise every "the candidate" / "candidate"
  // mention coming from the analysis prompt's third-person voice.
  const firstName = firstNameOf(candidateName);

  // Sub-scores under the hero. 5 columns, vertical dividers between.
  const subs = [
    { key: "ats",      label: "ATS",        score: scores.atsCompatibility.score,    max: scores.atsCompatibility.max },
    { key: "content",  label: "Content",    score: scores.contentImpact.score,        max: scores.contentImpact.max },
    { key: "format",   label: "Format",     score: scores.structureFormatting.score,  max: scores.structureFormatting.max },
    { key: "keyword",  label: "Keywords",   score: scores.keywordCoverage.score,      max: scores.keywordCoverage.max },
    { key: "senior",   label: "Seniority",  score: scores.senioritySignal.score,      max: scores.senioritySignal.max },
  ];

  // Score circle geometry
  const r = 48;
  const circ = 2 * Math.PI * r;

  // Chat-first refactor: the score circle now animates 0 → total over 1.6s
  // on first mount per analysis. This is the visual aha moment that used
  // to live in the dedicated ScoreReveal full-screen takeover. Same
  // requestAnimationFrame ease-out pattern. Gated by hasAnimatedRef +
  // analysis identity so it doesn't re-fire on every re-render but DOES
  // re-fire if the analysis swaps (re-analyze flow).
  const [displayedScore, setDisplayedScore] = useState(0);
  const hasAnimatedRef = useRef<unknown>(null);
  useEffect(() => {
    // Re-animate when the analysis object reference changes.
    if (hasAnimatedRef.current === analysis) return;
    hasAnimatedRef.current = analysis;
    const start = performance.now();
    const duration = 1600;
    let raf = 0;
    const tick = (nowMs: number) => {
      const t = Math.min(1, (nowMs - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayedScore(Math.round(eased * total));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analysis, total]);
  const filled = circ * (displayedScore / 100);

  // Filter empty / whitespace-only strings the model occasionally emits
  // so the count matches what we actually render. Was: header said
  // '8 missing signals' but only 7 pills appeared because one slot was
  // an empty string.
  const missingSignals = (analysis.missingSignals ?? []).filter((s) => typeof s === "string" && s.trim().length > 0);
  const positioningTone =
    missingSignals.length === 0 ? { label: "Strong match", color: "#15803d" }
    : missingSignals.length <= 2 ? { label: "Close match", color: "#b45309" }
    : { label: "Gap detected", color: "#b91c1c" };

  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const VISIBLE_PRIORITIES = 4;
  const allPriorities = analysis.rewritePriorities ?? [];
  const visiblePriorities = showAllPriorities ? allPriorities : allPriorities.slice(0, VISIBLE_PRIORITIES);
  const hiddenCount = Math.max(0, allPriorities.length - VISIBLE_PRIORITIES);

  // Per-priority score impact — distributes the projected lift across
  // priorities, weighted by tier, clamped to realistic ranges.
  const impacts = buildImpacts(allPriorities, total, scores.projectedPostFix);
  const totalImpact = impacts.reduce((s, n) => s + n, 0);
  const projHighMatch = (scores.projectedPostFix ?? "").match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
  const projectedHigh = projHighMatch ? parseInt(projHighMatch[2] ?? projHighMatch[1], 10) : Math.min(100, total + totalImpact);

  // Top-priority-section label for the AI Coach card (Skills / Summary /
  // Experience bullets / Top priority).
  const topPriority = allPriorities[0];
  const topSectionLabel = topPriority
    ? /summary/i.test(topPriority) ? "Summary"
    : /skills?/i.test(topPriority) ? "Skills"
    : /bullet|impact|metric|quantif/i.test(topPriority) ? "Experience bullets"
    : "Top priority"
    : null;
  const top3 = allPriorities.slice(0, 3);
  const top3ImpactSum = impacts.slice(0, 3).reduce((s, n) => s + n, 0);
  // Biggest Impact MUST be a different section than Fastest Win — otherwise
  // the AI Coach card shows "Summary" twice, which reads as a bug. We map
  // each priority to a section bucket, then pick the highest-impact priority
  // whose bucket differs from Fastest Win's bucket.
  const sectionBucket = (a: string): string =>
    /summary|profile|objective|headline|intro/i.test(a) ? "summary"
    : /skills?|keyword|stack|tools|tech list/i.test(a) ? "skills"
    : /bullet|impact|metric|quantif|achievement|wins/i.test(a) ? "experience bullets"
    : /education|certif|degree/i.test(a) ? "education"
    : /experience|role|job/i.test(a) ? "experience"
    : "other";
  const fastestWinBucket = topPriority ? sectionBucket(topPriority) : "";
  // Sort indices by impact desc, then pick the first one whose bucket
  // differs from Fastest Win. If everything is in the same bucket, fall
  // back to the second-highest priority regardless.
  const sortedByImpact = impacts
    .map((v, i) => ({ i, v }))
    .filter((x) => x.i < allPriorities.length)
    .sort((a, b) => b.v - a.v);
  const biggestImpactIdx = (() => {
    for (const { i } of sortedByImpact) {
      if (sectionBucket(allPriorities[i]) !== fastestWinBucket) return i;
    }
    // Everything maps to the same bucket — pick the second priority if any.
    return allPriorities.length >= 2 ? 1 : -1;
  })();
  const biggestImpactSection = biggestImpactIdx >= 0
    ? sectionBucket(allPriorities[biggestImpactIdx])
    : "";

  return (
    <div style={{
      background: "transparent",
      color: "#111827",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "14px",
      lineHeight: 1.6,
      maxWidth: "100%",
      padding: "8px 0 32px",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
    }}>

      {/* AI COACH block removed per user request — report is now read-only. */}

      {/* ── 1. HERO ── */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "28px", flexWrap: "wrap" }}>
          {/* Score circle — 110px */}
          <div style={{ position: "relative", width: "110px", height: "110px", flexShrink: 0 }}>
            <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="55" cy="55" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
              <circle
                cx="55" cy="55" r={r}
                fill="none"
                stroke={tier.color}
                strokeWidth="8"
                strokeDasharray={`${filled} ${circ}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 600ms ease" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: "32px", fontWeight: 500, color: tier.color, lineHeight: 1 }}>{displayedScore}</span>
              <span style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px" }}>/100</span>
            </div>
          </div>

          {/* Right — tier badge + name + summary */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              display: "inline-block",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "3px 9px",
              borderRadius: "999px",
              background: tier.bg,
              color: tier.color,
              border: `1px solid ${tier.border}`,
              marginBottom: "10px",
            }}>{tier.label}</span>
            <div style={{ fontSize: "20px", fontWeight: 500, color: "#18181b", marginBottom: "6px", lineHeight: 1.3 }}>
              {candidateName || analysis.likelyTargetRole || "Resume Review"}
            </div>
            {analysis.likelyTargetRole && candidateName && (
              <div style={{ fontSize: "13px", color: "#52525b", margin: 0 }}>
                Targeting <span style={{ color: "#18181b", fontWeight: 500 }}>{analysis.likelyTargetRole}</span>
                {analysis.seniorityEstimate && <> · {analysis.seniorityEstimate}</>}
              </div>
            )}
            {/* Hero summary removed — full version lives in The Bottom Line
                card below; one-line duplicate up here was redundant. */}
          </div>
        </div>

        {/* Sub-scores strip with vertical dividers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${subs.length}, 1fr)`,
          marginTop: "24px",
          paddingTop: "20px",
          borderTop: "1px solid #f4f4f5",
        }}>
          {subs.map((s, i) => {
            const pct = s.score / s.max;
            const c = scoreColor(pct);
            // No background tints — the score number colour already
            // communicates strength (red/amber/green). Random tinted cells
            // were noise without signal.
            return (
              <div key={s.key} style={{
                textAlign: "center",
                paddingTop: "12px",
                paddingBottom: "12px",
                paddingLeft: i === 0 ? "12px" : "12px",
                paddingRight: i === subs.length - 1 ? "12px" : "12px",
                background: "transparent",
                borderRight: i === subs.length - 1 ? "none" : "1px solid #f4f4f5",
              }}>
                <div style={{ fontSize: "22px", fontWeight: 500, color: c, lineHeight: 1.1 }}>
                  {s.score}
                  <span style={{ fontSize: "13px", color: "#a1a1aa", fontWeight: 400 }}>/{s.max}</span>
                </div>
                <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px", letterSpacing: "0.02em", textTransform: "uppercase" }}>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 2. THE BOTTOM LINE ── */}
      {(analysis.currentPositioning || analysis.overallAssessment) && (
        <Card>
          <SectionLabel>The Bottom Line</SectionLabel>
          <p style={{ fontSize: "16px", color: "#18181b", margin: 0, lineHeight: 1.55, fontWeight: 400 }}>
            {humanise((analysis.currentPositioning ?? analysis.overallAssessment ?? "").trim(), firstName)}
          </p>
        </Card>
      )}

      {/* ── 3. ROLE-FIT BENCHMARK ── */}
      {(analysis.likelyTargetRole || missingSignals.length > 0) && (
        <Card>
          <SectionLabel>Role-Fit Benchmark</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "16px", alignItems: "center" }}>
            <div style={{
              background: "#fafafa",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "6px" }}>Target</div>
              <div style={{ fontSize: "15px", fontWeight: 500, color: "#18181b" }}>{analysis.likelyTargetRole || "—"}</div>
              {analysis.seniorityEstimate && <div style={{ fontSize: "13px", color: "#71717a", marginTop: "2px" }}>{analysis.seniorityEstimate}</div>}
            </div>
            <div style={{ fontSize: "20px", color: "#a1a1aa", fontWeight: 400 }}>→</div>
            <div style={{
              background: missingSignals.length > 2 ? "#fef2f2" : "#fafafa",
              border: `1px solid ${missingSignals.length > 2 ? "#fecaca" : "#e5e7eb"}`,
              borderRadius: "10px",
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "6px" }}>Your Positioning</div>
              <div style={{ fontSize: "15px", fontWeight: 500, color: positioningTone.color }}>{positioningTone.label}</div>
              <div style={{ fontSize: "13px", color: "#71717a", marginTop: "2px" }}>{missingSignals.length} missing signal{missingSignals.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
          {missingSignals.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "8px" }}>Missing signals</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {missingSignals.slice(0, 8).map((sig, i) => (
                  <span key={i} style={{
                    fontSize: "12px",
                    padding: "3px 10px",
                    border: "1px solid #fca5a5",
                    borderRadius: "999px",
                    color: "#b91c1c",
                    background: "#fef2f2",
                    fontWeight: 400,
                  }}>{sig}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── 4. STRENGTHS / WEAKNESSES ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Card tone="green">
          <SectionLabel>
            <span style={{ color: "#15803d" }}>Strengths</span>
          </SectionLabel>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {analysis.strengths.slice(0, 4).map((s, i) => (
              <li key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span style={{ color: "#16a34a", flexShrink: 0, marginTop: "1px", fontSize: "14px" }}>✓</span>
                <span style={{ fontSize: "14px", color: "#18181b", lineHeight: 1.55 }}>{humanise(s, firstName)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card tone="amber">
          <SectionLabel>
            <span style={{ color: "#b45309" }}>Weaknesses</span>
          </SectionLabel>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {analysis.weaknesses.slice(0, 4).map((w, i) => (
              <li key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <span style={{ color: "#d97706", flexShrink: 0, marginTop: "1px", fontSize: "14px" }}>!</span>
                <span style={{ fontSize: "14px", color: "#18181b", lineHeight: 1.55 }}>{humanise(w, firstName)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── 5. ATS KEYWORD AUDIT ── */}
      {(analysis.keywordGaps?.length ?? 0) > 0 && (
        <Card>
          <SectionLabel>ATS Keyword Audit</SectionLabel>
          <div style={{ fontSize: "13px", color: "#52525b", marginBottom: "12px" }}>
            <span style={{ color: "#18181b", fontWeight: 500 }}>{analysis.keywordGaps?.length ?? 0}</span> keywords your target role usually expects but yours doesn&apos;t feature.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(analysis.keywordGaps ?? []).slice(0, 16).map((k, i) => (
              <span key={i} style={{
                fontSize: "12px",
                padding: "3px 10px",
                border: "1px solid #fde68a",
                borderRadius: "999px",
                color: "#b45309",
                background: "#fffbeb",
                fontWeight: 400,
              }}>{k}</span>
            ))}
          </div>
        </Card>
      )}

      {/* ── 6. PRIORITIZED ACTION PLAN ── */}
      {allPriorities.length > 0 && (
        <Card style={{ padding: "24px 24px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div>
              <SectionLabel>Prioritized Action Plan</SectionLabel>
              <div style={{ fontSize: "13px", color: "#71717a", marginTop: "-4px" }}>
                {allPriorities.length} fix{allPriorities.length !== 1 ? "es" : ""} the writer can ship for you
              </div>
            </div>
            {onFixAll && !isFinalized && allPriorities.length > 1 && (
              <button
                onClick={onFixAll}
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  padding: "8px 16px",
                  borderRadius: "8px",
                  background: "#18181b",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                ✨ Optimize all
                <span style={{ fontSize: "11px", color: "#a1a1aa", fontWeight: 400 }}>
                  +{totalImpact} pts
                </span>
              </button>
            )}
          </div>

          <div>
            {visiblePriorities.map((action, i) => {
              const pLabel = extractPriority(action);
              const p = priorityColor(pLabel);
              const fixText = humanise(cleanAction(action).replace(/\s*\+\d+\s*pts?\s*\w*/i, "").trim(), firstName);
              const impact = `+${impacts[i] ?? 0} pts`;

              const isDone = completedActions?.has(i) ?? false;
              const wasAccepted = acceptedActions?.has(i) ?? false;
              const status: "accepted" | "rejected" | "pending" =
                isDone && wasAccepted ? "accepted" : isDone ? "rejected" : "pending";

              const bg = i % 2 === 0 ? "transparent" : "#fafafa";

              return (
                <div key={i} style={{
                  display: "grid",
                  gridTemplateColumns: "auto 80px 1fr 70px auto",
                  gap: "12px",
                  alignItems: "center",
                  padding: "14px 12px",
                  background: bg,
                  borderRadius: "8px",
                  opacity: isDone ? 0.55 : 1,
                  marginBottom: "2px",
                }}>
                  {/* status icon */}
                  <div style={{ width: "20px", textAlign: "center" }}>
                    {status === "accepted" ? (
                      <span title="Accepted" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "4px", background: "#16a34a", color: "#fff", fontSize: "11px", fontWeight: 700 }}>✓</span>
                    ) : status === "rejected" ? (
                      <span title="Skipped" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "18px", height: "18px", borderRadius: "4px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: "11px", fontWeight: 700 }}>✗</span>
                    ) : (
                      <span title="Pending" style={{ display: "inline-block", width: "18px", height: "18px", borderRadius: "4px", border: "1.5px solid #d4d4d8", background: "#fff" }} />
                    )}
                  </div>
                  {/* priority badge */}
                  <span style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: p.bg,
                    color: p.text,
                    border: `1px solid ${p.border}`,
                    textAlign: "center",
                    justifySelf: "start",
                  }}>{pLabel}</span>
                  {/* description */}
                  <span style={{
                    fontSize: "14px",
                    color: "#18181b",
                    lineHeight: 1.5,
                    textDecoration: isDone ? "line-through" : "none",
                    textDecorationColor: "#a1a1aa",
                  }}>{fixText || cleanAction(action)}</span>
                  {/* score impact */}
                  <span style={{
                    fontSize: "12px",
                    color: "#16a34a",
                    fontWeight: 500,
                    textAlign: "right",
                  }}>{impact}</span>
                  {/* fix button */}
                  <div>
                    {onFixItem && !isDone && !isFinalized ? (
                      <button
                        onClick={() => onFixItem(action, i)}
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          padding: "5px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d4d4d8",
                          background: "#ffffff",
                          color: "#18181b",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >Fix</button>
                    ) : isDone ? (
                      <span style={{ fontSize: "11px", color: status === "accepted" ? "#16a34a" : "#a1a1aa", fontWeight: 500 }}>
                        {status === "accepted" ? "Done" : "Skipped"}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllPriorities((v) => !v)}
              style={{
                marginTop: "8px",
                marginBottom: "8px",
                width: "100%",
                fontSize: "13px",
                fontWeight: 500,
                color: "#52525b",
                background: "transparent",
                border: "1px dashed #d4d4d8",
                borderRadius: "8px",
                padding: "10px",
                cursor: "pointer",
              }}
            >
              {showAllPriorities ? "Show less" : `+${hiddenCount} more improvement${hiddenCount !== 1 ? "s" : ""}`}
            </button>
          )}
        </Card>
      )}

      {/* ── 6.5 SCORE DEDUCTIONS ── per-category breakdown of WHY each
              sub-score isn't its max. The agent already populates
              `scores.{category}.deductions: string[]` during analysis;
              the docx report renders them under "Score Deductions" but
              the in-app Report didn't until now. This is the single most
              actionable addition — tells the user EXACTLY which bullet
              cost them points.

              Renders only if at least one deduction is present across
              all 5 categories. Hides empty categories so we don't show
              "ATS Compatibility (none)" — wasted space. */}
      <ScoreDeductionsCard scores={scores} />


      {/* ── 7. SCORE PROJECTION ── mirrors the docx report's "Score
              Projection" table. Per-category headroom forecast, three
              columns: Current / After High-Priority Fixes / After All
              Fixes. The math: after-high = current + 60% of headroom,
              after-all = current + 85% of headroom. Same heuristic the
              docx generator uses, so the in-app Report and the
              downloaded report agree on the numbers. */}
      {subs.length > 0 && (
        <Card>
          <SectionLabel>Score Projection</SectionLabel>
          <p style={{ fontSize: "13px", color: "#52525b", margin: "0 0 12px", lineHeight: 1.55 }}>
            How each category moves as you apply fixes. Numbers below are projections — the actual value updates live when you accept a rewrite.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e4e4e7" }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontSize: "11px", fontWeight: 500, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.04em" }}>Category</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "11px", fontWeight: 500, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.04em" }}>Current</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "11px", fontWeight: 500, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.04em" }}>High-Priority Fixes</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontSize: "11px", fontWeight: 500, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.04em" }}>All Fixes</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => {
                  const headroom = s.max - s.score;
                  const afterHigh = Math.min(s.max, s.score + Math.round(headroom * 0.6));
                  const afterAll = Math.min(s.max, s.score + Math.round(headroom * 0.85));
                  return (
                    <tr key={s.key} style={{ borderBottom: "1px solid #f4f4f5" }}>
                      <td style={{ padding: "10px", color: "#27272a", fontWeight: 500 }}>{s.label}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#52525b", fontFamily: "monospace" }}>{s.score}/{s.max}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#15803d", fontFamily: "monospace" }}>{afterHigh}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#15803d", fontWeight: 600, fontFamily: "monospace" }}>{afterAll}</td>
                    </tr>
                  );
                })}
                {(() => {
                  const totalHigh = subs.reduce((sum, s) => sum + Math.min(s.max, s.score + Math.round((s.max - s.score) * 0.6)), 0);
                  const totalAll = subs.reduce((sum, s) => sum + Math.min(s.max, s.score + Math.round((s.max - s.score) * 0.85)), 0);
                  return (
                    <tr style={{ borderTop: "2px solid #18181b" }}>
                      <td style={{ padding: "10px", color: "#18181b", fontWeight: 700, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.04em" }}>Total</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#18181b", fontWeight: 700, fontFamily: "monospace" }}>{total}/100</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#15803d", fontWeight: 700, fontFamily: "monospace" }}>{totalHigh}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#15803d", fontWeight: 700, fontFamily: "monospace" }}>{totalAll}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
