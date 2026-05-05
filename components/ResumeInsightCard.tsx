"use client";

import { useState } from "react";
import { ResumeAnalysis, ScoreCategory } from "@/lib/agents/schemas/resumeIntelligence";
import { FileText, ChevronDown } from "lucide-react";

interface ResumeInsightCardProps {
  analysis: ResumeAnalysis;
}

const STATUS_COLORS: Record<ScoreCategory["status"], string> = {
  STRONG: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  GOOD:   "text-[#10a37f] bg-[#10a37f]/10 border-[#10a37f]/30",
  REVIEW: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  WEAK:   "text-red-400 bg-red-400/10 border-red-400/30",
};

function StatusBadge({ status }: { status: ScoreCategory["status"] }) {
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLORS[status]}`}>
      {status}
    </span>
  );
}

function ScoreBar({ score, max, color }: { score: number; max: number; color: string }) {
  const pct = Math.min(1, score / max);
  return (
    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}

function scoreColor(pct: number): string {
  if (pct >= 0.75) return "#10a37f";
  if (pct >= 0.5) return "#facc15";
  return "#f87171";
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-300">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// Fallback for old analysis objects without scores
function buildFallbackScores(a: ResumeAnalysis) {
  const atsS = a.atsHeuristics.score > 0 ? a.atsHeuristics.score : 14;
  const contentS = Math.min(25, Math.round(25 * (a.strengths.length / Math.max(a.strengths.length + a.weaknesses.length, 1))));
  const structS = a.atsHeuristics.scanabilityRisk === "low" ? 17 : a.atsHeuristics.scanabilityRisk === "medium" ? 14 : 10;
  const kwS = Math.max(5, 20 - a.keywordGaps.length * 2);
  const senS = 10;
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
    total: atsS + contentS + structS + kwS + senS,
    projectedPostFix: `${Math.min(100, atsS + contentS + structS + kwS + senS + 10)}-${Math.min(100, atsS + contentS + structS + kwS + senS + 15)}`,
  };
}

export default function ResumeInsightCard({ analysis }: ResumeInsightCardProps) {
  const scores = analysis.scores ?? buildFallbackScores(analysis);
  const total = scores.total;
  const totalColor = scoreColor(total / 100);

  const cats = [
    { label: "ATS Compatibility",  ...scores.atsCompatibility },
    { label: "Content & Impact",   ...scores.contentImpact },
    { label: "Structure",          ...scores.structureFormatting },
    { label: "Keyword Coverage",   ...scores.keywordCoverage },
    { label: "Seniority Signal",   ...scores.senioritySignal },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-6">
      <div className="bg-gray-100 border border-gray-300 rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="px-4 py-4 bg-gray-100 border-b border-gray-300">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded bg-[#10a37f] flex items-center justify-center flex-shrink-0">
              <FileText className="w-3 h-3 text-gray-900" strokeWidth={2.5} />
            </div>
            <span className="text-xs font-semibold text-[#10a37f] uppercase tracking-wider">Resume Intelligence</span>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">{analysis.overallAssessment}</p>
          <div className="flex flex-wrap gap-2">
            {analysis.likelyTargetRole && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-600">
                Target: {analysis.likelyTargetRole}
              </span>
            )}
            {analysis.seniorityEstimate && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-600">
                Level: {analysis.seniorityEstimate}
              </span>
            )}
          </div>
        </div>

        {/* Score Summary */}
        <div className="px-4 py-4 border-b border-gray-300">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Score Summary</span>
            <span className="text-xl font-bold tabular-nums" style={{ color: totalColor }}>
              {total}<span className="text-xs font-normal text-gray-600 ml-0.5">/100</span>
            </span>
          </div>
          <div className="space-y-2">
            {cats.map((cat) => {
              const pct = cat.score / cat.max;
              const color = scoreColor(pct);
              return (
                <div key={cat.label} className="flex items-center gap-3">
                  <span className="text-[11px] text-gray-500 w-36 flex-shrink-0">{cat.label}</span>
                  <ScoreBar score={cat.score} max={cat.max} color={color} />
                  <span className="text-[11px] font-semibold tabular-nums w-12 text-right flex-shrink-0" style={{ color }}>
                    {cat.score}/{cat.max}
                  </span>
                  <StatusBadge status={cat.status} />
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[11px] text-gray-600">
            Projected after fixes: <span className="text-[#10a37f] font-semibold">{scores.projectedPostFix}/100</span>
          </div>
        </div>

        {/* Strengths */}
        {analysis.strengths.length > 0 && (
          <Section title={`Strengths (${analysis.strengths.length})`} defaultOpen={true}>
            <ul className="space-y-1.5">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-[#10a37f] flex-shrink-0 mt-0.5">✓</span>{s}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Weaknesses */}
        {analysis.weaknesses.length > 0 && (
          <Section title={`Weaknesses (${analysis.weaknesses.length})`} defaultOpen={true}>
            <ul className="space-y-1.5">
              {analysis.weaknesses.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-yellow-400 flex-shrink-0 mt-0.5">!</span>{w}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Keyword Audit */}
        {(analysis.keywordsPresent?.length > 0 || analysis.keywordGaps.length > 0) && (
          <Section title={`Keyword Audit (${(analysis.keywordsPresent?.length ?? 0)} present · ${analysis.keywordGaps.length} missing)`}>
            {analysis.keywordsPresent?.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] text-[#10a37f] uppercase tracking-wider font-bold mb-1.5">Present</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.keywordsPresent.map((kw, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[#10a37f]/10 border border-[#10a37f]/30 text-[#10a37f]">{kw}</span>
                  ))}
                </div>
              </div>
            )}
            {analysis.keywordGaps.length > 0 && (
              <div>
                <p className="text-[10px] text-red-400 uppercase tracking-wider font-bold mb-1.5">Missing</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.keywordGaps.map((kw, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-red-900/20 border border-red-900/50 text-red-300">{kw}</span>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ATS Notes */}
        {analysis.atsHeuristics.notes.length > 0 && (
          <Section title="ATS Notes">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Formatting risk</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${analysis.atsHeuristics.formattingRisk === "low" ? "text-[#10a37f] bg-[#10a37f]/10 border-[#10a37f]/30" : analysis.atsHeuristics.formattingRisk === "medium" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" : "text-red-400 bg-red-400/10 border-red-400/30"}`}>
                  {analysis.atsHeuristics.formattingRisk}
                </span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">Scanability risk</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${analysis.atsHeuristics.scanabilityRisk === "low" ? "text-[#10a37f] bg-[#10a37f]/10 border-[#10a37f]/30" : analysis.atsHeuristics.scanabilityRisk === "medium" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" : "text-red-400 bg-red-400/10 border-red-400/30"}`}>
                  {analysis.atsHeuristics.scanabilityRisk}
                </span>
              </div>
              <ul className="space-y-1">
                {analysis.atsHeuristics.notes.map((note, i) => (
                  <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                    <span className="flex-shrink-0">–</span>{note}
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        )}

        {/* Rewrite Priorities */}
        {analysis.rewritePriorities.length > 0 && (
          <Section title={`Rewrite Priorities (${analysis.rewritePriorities.length})`}>
            <ol className="space-y-2">
              {analysis.rewritePriorities.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                  <span className="text-gray-500 flex-shrink-0 w-4 text-right font-mono text-xs mt-0.5">{i + 1}.</span>
                  {p}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Weak Bullets */}
        {analysis.weakBullets.length > 0 && (
          <Section title={`Weak Bullets (${analysis.weakBullets.length})`}>
            <ul className="space-y-2">
              {analysis.weakBullets.map((b, i) => (
                <li key={i} className="text-xs text-gray-500 bg-gray-200 border border-gray-300 rounded-lg px-3 py-2 font-mono leading-relaxed">
                  &ldquo;{b}&rdquo;
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Next Steps */}
        {analysis.suggestedNextSteps.length > 0 && (
          <Section title="Suggested Next Steps" defaultOpen={true}>
            <ul className="space-y-2">
              {analysis.suggestedNextSteps.map((step, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                  <span className="text-[#10a37f] flex-shrink-0 mt-0.5">→</span>{step}
                </li>
              ))}
            </ul>
          </Section>
        )}

      </div>
    </div>
  );
}
