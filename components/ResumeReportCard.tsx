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

import { useState } from "react";
import { ResumeAnalysis, ScoreCategory } from "@/lib/agents/schemas/resumeIntelligence";

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 0.75) return "#16a34a";
  if (pct >= 0.5) return "#d97706";
  return "#dc2626";
}

function tierBadge(total: number): { label: string; color: string; bg: string; border: string } {
  if (total >= 88) return { label: "STRONG", color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" };
  if (total >= 75) return { label: "SOLID", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" };
  if (total >= 60) return { label: "NEEDS WORK", color: "#b45309", bg: "#fffbeb", border: "#fde68a" };
  return { label: "WEAK", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" };
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

// Extract a "+8 pts" style score impact if the model embedded one in the
// priority text, otherwise estimate from priority tier.
function scoreImpact(action: string): string {
  const m = action.match(/\+(\d+)\s*pts?/i);
  if (m) return `+${m[1]} pts`;
  const p = extractPriority(action);
  if (p === "HIGH") return "+8 pts";
  if (p === "MEDIUM") return "+4 pts";
  return "+2 pts";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResumeReportCard({
  analysis,
  candidateName,
  onFixItem,
  completedActions,
  acceptedActions,
  isFinalized,
}: {
  analysis: ResumeAnalysis;
  candidateName?: string;
  onFixItem?: (action: string, index: number) => void;
  onFixAll?: () => void;
  completedActions?: Set<number>;
  acceptedActions?: Set<number>;
  isFinalized?: boolean;
}) {
  const scores = analysis.scores ?? deriveScoresFromLegacy(analysis);
  const total = scores.total;
  const tier = tierBadge(total);

  // Sub-scores under the hero. 5 columns, vertical dividers between.
  const subs = [
    { key: "ats",      label: "ATS",        score: scores.atsCompatibility.score,    max: scores.atsCompatibility.max },
    { key: "content",  label: "Content",    score: scores.contentImpact.score,        max: scores.contentImpact.max },
    { key: "format",   label: "Format",     score: scores.structureFormatting.score,  max: scores.structureFormatting.max },
    { key: "keyword",  label: "Keywords",   score: scores.keywordCoverage.score,      max: scores.keywordCoverage.max },
    { key: "senior",   label: "Seniority",  score: scores.senioritySignal.score,      max: scores.senioritySignal.max },
  ];

  // Hero summary — 1 line, derived from positioning or assessment.
  const summarySource = (analysis.currentPositioning ?? analysis.overallAssessment ?? "").trim();
  const firstSentence = summarySource.match(/^[^.!?]+[.!?]/)?.[0] ?? summarySource;
  const heroSummary = firstSentence.length > 180 ? firstSentence.slice(0, 177) + "…" : firstSentence;

  // Score circle geometry
  const r = 48;
  const circ = 2 * Math.PI * r;
  const filled = circ * (total / 100);

  const missingSignals = analysis.missingSignals ?? [];
  const positioningTone =
    missingSignals.length === 0 ? { label: "Strong match", color: "#15803d" }
    : missingSignals.length <= 2 ? { label: "Close match", color: "#b45309" }
    : { label: "Gap detected", color: "#b91c1c" };

  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const VISIBLE_PRIORITIES = 4;
  const allPriorities = analysis.rewritePriorities ?? [];
  const visiblePriorities = showAllPriorities ? allPriorities : allPriorities.slice(0, VISIBLE_PRIORITIES);
  const hiddenCount = Math.max(0, allPriorities.length - VISIBLE_PRIORITIES);

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
              <span style={{ fontSize: "32px", fontWeight: 500, color: tier.color, lineHeight: 1 }}>{total}</span>
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
              <div style={{ fontSize: "13px", color: "#52525b", marginBottom: "8px" }}>
                Targeting <span style={{ color: "#18181b", fontWeight: 500 }}>{analysis.likelyTargetRole}</span>
                {analysis.seniorityEstimate && <> · {analysis.seniorityEstimate}</>}
              </div>
            )}
            {heroSummary && (
              <p style={{ fontSize: "14px", color: "#52525b", margin: 0, lineHeight: 1.55 }}>
                {heroSummary}
              </p>
            )}
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
            return (
              <div key={s.key} style={{
                textAlign: "center",
                paddingLeft: i === 0 ? 0 : "12px",
                paddingRight: i === subs.length - 1 ? 0 : "12px",
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
            {(analysis.currentPositioning ?? analysis.overallAssessment ?? "").trim()}
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
                <span style={{ fontSize: "14px", color: "#18181b", lineHeight: 1.55 }}>{s}</span>
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
                <span style={{ fontSize: "14px", color: "#18181b", lineHeight: 1.55 }}>{w}</span>
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" }}>
            <div>
              <SectionLabel>Prioritized Action Plan</SectionLabel>
              <div style={{ fontSize: "13px", color: "#71717a", marginTop: "-4px" }}>
                {allPriorities.length} fix{allPriorities.length !== 1 ? "es" : ""} the writer can ship for you
              </div>
            </div>
          </div>

          <div>
            {visiblePriorities.map((action, i) => {
              const pLabel = extractPriority(action);
              const p = priorityColor(pLabel);
              const fixText = cleanAction(action).replace(/\s*\+\d+\s*pts?\s*\w*/i, "").trim();
              const impact = scoreImpact(action);

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
    </div>
  );
}
