"use client";

import { ResumeAnalysis, ScoreCategory } from "@/lib/agents/schemas/resumeIntelligence";

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct >= 0.75) return "#16a34a";
  if (pct >= 0.5) return "#d97706";
  return "#e53e3e";
}

function statusBadgeStyle(status: ScoreCategory["status"]): React.CSSProperties {
  const map: Record<ScoreCategory["status"], { bg: string; color: string }> = {
    STRONG: { bg: "#1d4ed8", color: "#111827" },
    GOOD:   { bg: "#16a34a", color: "#111827" },
    REVIEW: { bg: "#d97706", color: "#111827" },
    WEAK:   { bg: "#dc2626", color: "#111827" },
  };
  const s = map[status] ?? map.WEAK;
  return {
    fontFamily: "system-ui, sans-serif",
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "2px 7px",
    borderRadius: "3px",
    background: s.bg,
    color: s.color,
    whiteSpace: "nowrap" as const,
  };
}

function overallBadge(total: number): { label: string; color: string } {
  if (total >= 88) return { label: "STRONG", color: "#1d4ed8" };
  if (total >= 75) return { label: "SOLID", color: "#16a34a" };
  if (total >= 60) return { label: "REVIEW", color: "#d97706" };
  return { label: "WEAK", color: "#dc2626" };
}

function scoreBar(score: number, max: number, color: string) {
  const pct = Math.min(1, score / max);
  const filled = Math.round(pct * 12);
  const empty = 12 - filled;
  return (
    <span style={{ fontFamily: "Courier New, monospace", fontSize: "10px", letterSpacing: "1px", color }}>
      {"█".repeat(filled)}
      <span style={{ color: "#d1d5db" }}>{"░".repeat(empty)}</span>
    </span>
  );
}

function formatAssessment(text: string, name?: string): string {
  const t = text.replace(/\bthe candidate\b/gi, name || "they").replace(/\bcandidate\b/gi, name || "they");
  const sentences = t.match(/[^.!?]+[.!?]+/g) ?? [t];
  return sentences.slice(0, 4).join(" ").trim();
}

function formatBottomLine(positioning: string | undefined, fallback: string, name?: string): string {
  const source = positioning && positioning.trim().length > 0 ? positioning : fallback;
  return formatAssessment(source, name);
}

function riskPill(risk: "low" | "medium" | "high" | string): { label: string; bg: string; color: string; border: string } {
  const r = risk?.toLowerCase();
  if (r === "low") return { label: "LOW RISK", bg: "#f0fdf4", color: "#15803d", border: "#86efac" };
  if (r === "high") return { label: "HIGH RISK", bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" };
  return { label: "MEDIUM RISK", bg: "#fffbeb", color: "#d97706", border: "#fde68a" };
}

const ACTION_VERBS = [
  "led","built","designed","developed","implemented","launched","reduced","increased",
  "improved","managed","created","delivered","automated","optimized","drove","scaled",
  "architected","deployed","migrated","integrated","established","spearheaded","accelerated",
  "streamlined","coordinated","analyzed","engineered","transformed","orchestrated","negotiated",
];

function scoreBullet(bullet: string): { specificity: number; quantification: number; relevance: number } {
  const lower = bullet.toLowerCase();
  const words = bullet.split(/\s+/);

  // quantification: % or $ → 2, any digit → 1
  const quantification = /[%$]/.test(bullet) ? 2 : /\d/.test(bullet) ? 1 : 0;

  // specificity: starts with action verb AND ≥8 words → 2, one of those → 1
  const startsWithVerb = ACTION_VERBS.some(v => lower.startsWith(v));
  const longEnough = words.length >= 8;
  const specificity = startsWithVerb && longEnough ? 2 : startsWithVerb || longEnough ? 1 : 0;

  // relevance: CamelCase tool name AND role keyword → 2, one of those → 1
  const hasCamelCase = /[A-Z][a-z]+[A-Z]/.test(bullet) || /[A-Z]{2,}/.test(bullet);
  const roleKeywords = ["machine learning","ml","ai","data","sql","python","cloud","aws","gcp","azure","api","kubernetes","docker","react","typescript","javascript","node","spark","hadoop","tensorflow","pytorch"];
  const hasRoleKeyword = roleKeywords.some(kw => lower.includes(kw));
  const relevance = hasCamelCase && hasRoleKeyword ? 2 : hasCamelCase || hasRoleKeyword ? 1 : 0;

  return { specificity, quantification, relevance };
}

function Divider() {
  return <div style={{ borderTop: "1px solid #e5e7eb", margin: "20px 0" }} />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "9px", fontWeight: "700", letterSpacing: "0.14em",
      textTransform: "uppercase", color: "#2E4057",
      marginBottom: "10px", fontFamily: "system-ui, sans-serif",
    }}>
      {children}
    </div>
  );
}

function priorityColor(label: string) {
  if (label.startsWith("HIGH")) return { dot: "#dc2626", bg: "#fef2f2", border: "#fca5a5", text: "#dc2626" };
  if (label.startsWith("MEDIUM")) return { dot: "#d97706", bg: "#fffbeb", border: "#fde68a", text: "#d97706" };
  return { dot: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", text: "#6366f1" };
}

function extractPriority(action: string): string {
  const u = action.toUpperCase();
  if (u.startsWith("HIGH")) return "HIGH";
  if (u.startsWith("MEDIUM")) return "MEDIUM";
  if (u.startsWith("LOW")) return "LOW";
  return "MEDIUM";
}

// ── Fallback score derivation for old analysis objects without scores ─────────
function deriveScoresFromLegacy(a: ResumeAnalysis) {
  const atsS = a.atsHeuristics.score > 0 ? Math.round(a.atsHeuristics.score) : 14;
  const contentS = Math.min(25, Math.round(25 * (a.strengths.length / Math.max(a.strengths.length + a.weaknesses.length, 1))));
  const structS = a.atsHeuristics.scanabilityRisk === "low" ? 17 : a.atsHeuristics.scanabilityRisk === "medium" ? 14 : 10;
  const kwS = Math.max(5, 20 - a.keywordGaps.length * 2);
  const senS = 10;
  const total = atsS + contentS + structS + kwS + senS;
  const badge = (s: number, max: number): ScoreCategory["status"] => {
    const pct = s / max;
    if (pct >= 0.85) return "STRONG";
    if (pct >= 0.70) return "GOOD";
    if (pct >= 0.50) return "REVIEW";
    return "WEAK";
  };
  return {
    atsCompatibility: { score: atsS, max: 20, status: badge(atsS, 20), deductions: [] },
    contentImpact: { score: contentS, max: 25, status: badge(contentS, 25), deductions: [] },
    structureFormatting: { score: structS, max: 20, status: badge(structS, 20), deductions: [] },
    keywordCoverage: { score: kwS, max: 20, status: badge(kwS, 20), deductions: [] },
    senioritySignal: { score: senS, max: 15, status: badge(senS, 15), deductions: [] },
    total,
    projectedPostFix: `${Math.min(100, total + 10)}-${Math.min(100, total + 15)}`,
  };
}

// Dot rating renderer
function DotRating({ value }: { value: number }) {
  const colors = value === 2 ? "#16a34a" : value === 1 ? "#d97706" : "#dc2626";
  return (
    <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "13px", color: colors, letterSpacing: "1px" }}>
      {value >= 1 ? "●" : "○"}{value >= 2 ? "●" : "○"}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResumeReportCard({
  analysis,
  candidateName,
  onFixItem,
  onFixAll,
  completedActions,
  acceptedActions,
  isFinalized,
}: {
  analysis: ResumeAnalysis;
  candidateName?: string;
  onFixItem?: (action: string, index: number) => void;
  onFixAll?: () => void;
  // Index set of priorities the user has handled (either accepted or rejected)
  completedActions?: Set<number>;
  // Index set of priorities the user accepted (subset of completedActions).
  // Difference with completedActions = rejected.
  acceptedActions?: Set<number>;
  // Once the user saved a named version, the Report's priorities become a
  // read-only record of what they chose to tackle this cycle. Fix buttons
  // hide so another click doesn't drag them back through the whole flow.
  isFinalized?: boolean;
}) {
  const scores = analysis.scores ?? deriveScoresFromLegacy(analysis);
  const total = scores.total;
  const badge = overallBadge(total);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const cats = [
    { key: "atsCompatibility",    label: "ATS Compatibility",   ...scores.atsCompatibility },
    { key: "contentImpact",       label: "Content & Impact",     ...scores.contentImpact },
    { key: "structureFormatting", label: "Structure & Format",   ...scores.structureFormatting },
    { key: "keywordCoverage",     label: "Keyword Coverage",     ...scores.keywordCoverage },
    { key: "senioritySignal",     label: "Seniority Signal",     ...scores.senioritySignal },
  ];

  const missingSignals = analysis.missingSignals ?? [];
  const gapArrowColor = missingSignals.length <= 1 ? "#16a34a" : missingSignals.length <= 3 ? "#d97706" : "#dc2626";

  return (
    <div style={{
      background: "#fff", color: "#111",
      fontFamily: "Calibri, 'Segoe UI', system-ui, sans-serif",
      fontSize: "15px", lineHeight: "1.65",
      maxWidth: "100%", margin: "0",
      padding: "32px 40px 48px",
    }}>

      {/* ── 1. HEADER ── */}
      <div style={{ borderBottom: "2px solid #2E4057", paddingBottom: "16px", marginBottom: "24px" }}>
        <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "6px", fontFamily: "system-ui, sans-serif" }}>
          Stackle · Resume Intelligence Report · {today}
        </div>
        <div style={{ fontSize: "20px", fontWeight: "700", color: "#2E4057", lineHeight: "1.2", marginBottom: "8px" }}>
          {candidateName || analysis.likelyTargetRole || "Resume Review"}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {analysis.likelyTargetRole && (
            <span style={{ fontSize: "11px", padding: "2px 10px", border: "1px solid #2E4057", borderRadius: "100px", color: "#2E4057", fontFamily: "system-ui, sans-serif" }}>
              {analysis.likelyTargetRole}
            </span>
          )}
          {analysis.seniorityEstimate && (
            <span style={{ fontSize: "11px", padding: "2px 10px", border: "1px solid #9ca3af", borderRadius: "100px", color: "#6b7280", fontFamily: "system-ui, sans-serif" }}>
              {analysis.seniorityEstimate}
            </span>
          )}
          <span style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "100px", background: badge.color, color: "#111827", fontWeight: "700", fontFamily: "system-ui, sans-serif", letterSpacing: "0.05em" }}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* ── 2. BOTTOM LINE ── */}
      <div style={{ background: "#f0f4ff", border: "1px solid #c7d2fe", borderLeft: "4px solid #2E4057", borderRadius: "4px", padding: "14px 16px", marginBottom: "24px" }}>
        <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.12em", textTransform: "uppercase", color: "#2E4057", marginBottom: "6px", fontFamily: "system-ui, sans-serif" }}>
          The Bottom Line
        </div>
        <p style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b", lineHeight: "1.7", margin: 0 }}>
          {formatBottomLine(analysis.currentPositioning, analysis.overallAssessment, candidateName)}
        </p>
      </div>

      {/* ── 3. SCORE RINGS ── */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "36px", flexWrap: "wrap" }}>
        {cats.map((cat) => {
          const pct = cat.score / cat.max;
          const color = scoreColor(pct);
          const r = 32;
          const circ = 2 * Math.PI * r;
          const filled = circ * pct;
          const short = cat.label.replace(" & ", "\n& ").split("\n");
          return (
            <div key={cat.key} style={{ flex: "1 1 96px", minWidth: "96px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ position: "relative", width: "84px", height: "84px" }}>
                <svg width="84" height="84" viewBox="0 0 84 84" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="42" cy="42" r={r} fill="none" stroke="#f3f4f6" strokeWidth="6" />
                  <circle
                    cx="42" cy="42" r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="6"
                    strokeDasharray={`${filled} ${circ}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 600ms ease" }}
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
                  <span style={{ fontSize: "18px", fontWeight: "700", color, lineHeight: 1 }}>{cat.score}</span>
                  <span style={{ fontSize: "10px", color: "#9ca3af", lineHeight: 1.2 }}>/{cat.max}</span>
                </div>
              </div>
              <div style={{ textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
                {short.map((line, i) => (
                  <div key={i} style={{ fontSize: "10px", fontWeight: "600", color: "#374151", letterSpacing: "0.02em", lineHeight: "1.3", textTransform: "uppercase" }}>{line}</div>
                ))}
                <div style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "3px", background: color, color: "#111827", fontWeight: "700", letterSpacing: "0.04em", marginTop: "4px", display: "inline-block" }}>
                  {cat.status}
                </div>
              </div>
            </div>
          );
        })}
        {/* Total ring */}
        <div style={{ flex: "1 1 96px", minWidth: "96px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <div style={{ position: "relative", width: "84px", height: "84px" }}>
            <svg width="84" height="84" viewBox="0 0 84 84" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="42" cy="42" r={32} fill="none" stroke="#f3f4f6" strokeWidth="6" />
              <circle
                cx="42" cy="42" r={32}
                fill="none"
                stroke={badge.color}
                strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 32 * total / 100} ${2 * Math.PI * 32}`}
                strokeLinecap="round"
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
              <span style={{ fontSize: "20px", fontWeight: "700", color: badge.color, lineHeight: 1 }}>{total}</span>
              <span style={{ fontSize: "10px", color: "#9ca3af", lineHeight: 1.2 }}>/100</span>
            </div>
          </div>
          <div style={{ textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
            <div style={{ fontSize: "10px", fontWeight: "600", color: "#374151", letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: "1.3" }}>TOTAL</div>
            <div style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "3px", background: badge.color, color: "#111827", fontWeight: "700", letterSpacing: "0.04em", marginTop: "4px", display: "inline-block" }}>
              {badge.label}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. ROLE-FIT BENCHMARK ── */}
      {(analysis.likelyTargetRole || analysis.seniorityEstimate) && (
        <>
          <Divider />
          <SectionLabel>Role-Fit Benchmark</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "14px", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "12px 14px" }}>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "4px" }}>Target Role</div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>{analysis.likelyTargetRole || "—"}</div>
              {analysis.seniorityEstimate && <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{analysis.seniorityEstimate}</div>}
            </div>
            <div style={{ fontSize: "22px", color: gapArrowColor, fontWeight: "700" }}>→</div>
            <div style={{ flex: "1 1 160px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "12px 14px" }}>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "4px" }}>Your Positioning</div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: missingSignals.length <= 1 ? "#15803d" : missingSignals.length <= 3 ? "#d97706" : "#dc2626" }}>
                {missingSignals.length === 0 ? "Strong match" : missingSignals.length <= 2 ? "Close match" : "Gap detected"}
              </div>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>{missingSignals.length} missing signal{missingSignals.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
          {missingSignals.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" }}>
              {missingSignals.slice(0, 8).map((sig, i) => (
                <span key={i} style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", padding: "2px 9px", border: "1px solid #fca5a5", borderRadius: "100px", color: "#dc2626", background: "#fef2f2", fontWeight: "500" }}>
                  {sig}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── 5. FIRST IMPRESSION SCAN ── */}
      <>
        <Divider />
        <SectionLabel>First Impression Scan</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
          {/* Formatting Risk */}
          {(() => {
            const pill = riskPill(analysis.atsHeuristics.formattingRisk);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#374151", width: "110px", flexShrink: 0 }}>Formatting</span>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "9px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px", background: pill.bg, color: pill.color, border: `1px solid ${pill.border}`, letterSpacing: "0.05em" }}>
                  {pill.label}
                </span>
              </div>
            );
          })()}
          {/* Scanability Risk */}
          {(() => {
            const pill = riskPill(analysis.atsHeuristics.scanabilityRisk);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#374151", width: "110px", flexShrink: 0 }}>Scanability</span>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "9px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px", background: pill.bg, color: pill.color, border: `1px solid ${pill.border}`, letterSpacing: "0.05em" }}>
                  {pill.label}
                </span>
              </div>
            );
          })()}
          {/* ATS Notes */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#374151", width: "110px", flexShrink: 0, paddingTop: "1px" }}>ATS Notes</span>
            <div>
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "9px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px", background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", letterSpacing: "0.05em" }}>
                {(analysis.atsHeuristics.notes ?? []).length} note{(analysis.atsHeuristics.notes ?? []).length !== 1 ? "s" : ""}
              </span>
              {(analysis.atsHeuristics.notes ?? []).length > 0 && (
                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
                  {(analysis.atsHeuristics.notes ?? []).map((note, i) => (
                    <div key={i} style={{ fontSize: "11px", color: "#6b7280", paddingLeft: "8px", borderLeft: "2px solid #e2e8f0" }}>{note}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </>

      {/* ── 6. AT A GLANCE ── */}
      <Divider />
      <SectionLabel>At a Glance</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "14px" }}>
          <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#16a34a", marginBottom: "8px", fontFamily: "system-ui, sans-serif" }}>
            Strengths
          </div>
          {analysis.strengths.slice(0, 6).map((s, i) => (
            <div key={i} style={{ display: "flex", gap: "7px", marginBottom: "6px", alignItems: "flex-start" }}>
              <span style={{ color: "#16a34a", fontWeight: "700", flexShrink: 0, fontSize: "11px" }}>✓</span>
              <span style={{ fontSize: "12px", color: "#374151", lineHeight: "1.5" }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "6px", padding: "14px" }}>
          <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#ea580c", marginBottom: "8px", fontFamily: "system-ui, sans-serif" }}>
            Areas to Improve
          </div>
          {analysis.weaknesses.slice(0, 6).map((w, i) => (
            <div key={i} style={{ display: "flex", gap: "7px", marginBottom: "6px", alignItems: "flex-start" }}>
              <span style={{ color: "#ea580c", fontWeight: "700", flexShrink: 0, fontSize: "11px" }}>!</span>
              <span style={{ fontSize: "12px", color: "#374151", lineHeight: "1.5" }}>{w}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 7. KEYWORD AUDIT ── */}
      {(analysis.keywordsPresent?.length > 0 || analysis.keywordGaps.length > 0) && (
        <>
          <Divider />
          <SectionLabel>ATS Keyword Audit</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            {analysis.keywordsPresent?.length > 0 && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#16a34a", marginBottom: "8px", fontFamily: "system-ui, sans-serif" }}>
                  Keywords Present ({analysis.keywordsPresent.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {analysis.keywordsPresent.map((kw, i) => (
                    <span key={i} style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", padding: "2px 8px", border: "1px solid #86efac", borderRadius: "3px", color: "#15803d", background: "#dcfce7" }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {analysis.keywordGaps.length > 0 && (
              <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#ea580c", marginBottom: "8px", fontFamily: "system-ui, sans-serif" }}>
                  Recommended to Add ({analysis.keywordGaps.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                  {analysis.keywordGaps.map((kw, i) => (
                    <span key={i} style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", padding: "2px 8px", border: "1px solid #fca5a5", borderRadius: "3px", color: "#b91c1c", background: "#fef2f2" }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── 8. BULLET QUALITY TABLE ── */}
      {analysis.weakBullets.length > 0 && (
        <>
          <Divider />
          <SectionLabel>Bullet Quality Analysis</SectionLabel>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "8px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["Bullet (needs improvement)", "Specificity", "Quantified", "Relevance"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", fontFamily: "system-ui, sans-serif" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.weakBullets.map((b, i) => {
                const s = scoreBullet(b);
                const display = b.length > 120 ? b.slice(0, 117) + "…" : b;
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 8px", fontFamily: "Courier New, monospace", fontSize: "10.5px", color: "#6b7280", lineHeight: "1.4", maxWidth: "300px" }}>
                      {display}
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}><DotRating value={s.specificity} /></td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}><DotRating value={s.quantification} /></td>
                    <td style={{ padding: "8px 8px", textAlign: "center" }}><DotRating value={s.relevance} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", color: "#9ca3af", marginBottom: "8px" }}>
            ●● = strong &nbsp;·&nbsp; ●○ = needs work &nbsp;·&nbsp; ○○ = weak
          </div>
        </>
      )}

      {/* ── 9. ACTION PLAN ── */}
      {analysis.rewritePriorities.length > 0 && (
        <>
          <Divider />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <SectionLabel>Prioritized Action Plan</SectionLabel>
            {onFixAll && !isFinalized && (() => {
              const remaining = analysis.rewritePriorities.filter((_, i) => !(completedActions?.has(i) ?? false)).length;
              if (remaining === 0) return null; // all handled — hide the button
              return (
                <button onClick={onFixAll} style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", fontWeight: "600", padding: "4px 12px", border: "1px solid #111", borderRadius: "4px", background: "#fafafa", color: "#111827", cursor: "pointer", letterSpacing: "0.03em", marginBottom: "10px" }}>
                  Fix All ({remaining} left)
                </button>
              );
            })()}
            {isFinalized && (
              <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", fontWeight: "600", color: "#16a34a", padding: "4px 10px", border: "1px solid #bbf7d0", borderRadius: "4px", background: "#f0fdf4", letterSpacing: "0.03em", marginBottom: "10px" }}>
                ✓ Cycle saved — start a new cycle to revise again
              </span>
            )}
          </div>
          {/* Progress line — tells user how far they've got through the list */}
          {completedActions && completedActions.size > 0 && (
            <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", color: "#6b7280", marginBottom: "8px" }}>
              {completedActions.size} of {analysis.rewritePriorities.length} handled
              {acceptedActions && acceptedActions.size > 0 && ` · ${acceptedActions.size} accepted`}
              {completedActions && acceptedActions && completedActions.size - acceptedActions.size > 0 && ` · ${completedActions.size - acceptedActions.size} skipped`}
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", marginBottom: "20px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "6px 4px 6px 8px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", fontFamily: "system-ui, sans-serif", width: "22px" }}></th>
                {["Priority", "Recommended Fix", "Score Impact"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#9ca3af", fontFamily: "system-ui, sans-serif" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {analysis.rewritePriorities.map((action, i) => {
                const pLabel = extractPriority(action);
                const p = priorityColor(pLabel);
                const displayAction = action.replace(/^(HIGH|MEDIUM|LOW)\s*[—–-]\s*/i, "");
                const impactMatch = displayAction.match(/\+\d+\s*pts?\s*\w+/i);
                const impact = impactMatch ? impactMatch[0] : "–";
                const fixText = displayAction.replace(impactMatch?.[0] ?? "", "").trim();

                // Status: accepted (green ✓) / rejected (red ✗) / pending (empty box)
                const isDone = completedActions?.has(i) ?? false;
                const wasAccepted = acceptedActions?.has(i) ?? false;
                const status: "accepted" | "rejected" | "pending" =
                  isDone && wasAccepted ? "accepted" : isDone ? "rejected" : "pending";

                const rowOpacity = isDone ? 0.55 : 1;
                const strikeStyle: React.CSSProperties = isDone
                  ? { textDecoration: "line-through", textDecorationColor: "#9ca3af", textDecorationThickness: "1px" }
                  : {};

                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", opacity: rowOpacity }}>
                    {/* Status check */}
                    <td style={{ padding: "8px 4px 8px 8px", width: "22px", verticalAlign: "top" }}>
                      {status === "accepted" ? (
                        <span title="Accepted" aria-label="Accepted" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "3px", background: "#16a34a", color: "#111827", fontSize: "11px", fontWeight: "700", lineHeight: 1 }}>✓</span>
                      ) : status === "rejected" ? (
                        <span title="Skipped" aria-label="Skipped" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", borderRadius: "3px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: "10px", fontWeight: "700", lineHeight: 1 }}>✗</span>
                      ) : (
                        <span title="Pending" aria-label="Pending" style={{ display: "inline-block", width: "16px", height: "16px", borderRadius: "3px", border: "1.5px solid #d1d5db", background: "#fff" }} />
                      )}
                    </td>
                    <td style={{ padding: "8px 8px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "9px", fontWeight: "700", padding: "2px 8px", borderRadius: "3px", background: p.bg, color: p.text, border: `1px solid ${p.border}`, letterSpacing: "0.05em" }}>
                        {pLabel}
                      </span>
                    </td>
                    <td style={{ padding: "8px 8px", color: "#374151", lineHeight: "1.5", ...strikeStyle }}>
                      {fixText || displayAction}
                      {onFixItem && !isDone && !isFinalized && (
                        <button onClick={() => onFixItem(action, i)} style={{ fontFamily: "system-ui, sans-serif", marginLeft: "10px", fontSize: "9px", fontWeight: "600", padding: "2px 8px", border: "1px solid #d1d5db", borderRadius: "3px", background: "#fff", color: "#374151", cursor: "pointer" }}>
                          Fix this
                        </button>
                      )}
                      {isDone && (
                        <span style={{ marginLeft: "10px", fontSize: "10px", color: status === "accepted" ? "#16a34a" : "#9ca3af", fontWeight: "600", textDecoration: "none" }}>
                          {status === "accepted" ? "Done" : "Skipped"}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px 8px", color: "#16a34a", fontWeight: "600", fontFamily: "system-ui, sans-serif", fontSize: "11px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      {impact}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* ── 10. FOOTER ── */}
      <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "24px", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", color: "#9ca3af" }}>— End of Report —</span>
        <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "10px", color: "#9ca3af" }}>Stackle · {today}</span>
      </div>

    </div>
  );
}
