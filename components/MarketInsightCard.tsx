"use client";

import { useState } from "react";
import { MarketAnalysis } from "@/lib/agents/schemas/marketIntelligence";
import { BarChart2, ChevronDown } from "lucide-react";

interface MarketInsightCardProps {
  analysis: MarketAnalysis;
}

const DEMAND_COLORS = {
  high: "text-[#10a37f] bg-[#10a37f]/10 border-[#10a37f]/30",
  medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  low: "text-red-400 bg-red-400/10 border-red-400/30",
};

function DemandBadge({ level }: { level: "high" | "medium" | "low" }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${DEMAND_COLORS[level]}`}
    >
      {level} demand
    </span>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-300">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        {title}
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export default function MarketInsightCard({ analysis }: MarketInsightCardProps) {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-6">
      <div className="bg-gray-100 border border-gray-300 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 bg-violet-50/30 border-b border-gray-300">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded bg-[#6366f1] flex items-center justify-center flex-shrink-0">
              <BarChart2 className="w-3 h-3 text-gray-900" strokeWidth={2.5} />
            </div>
            <span className="text-xs font-semibold text-[#6366f1] uppercase tracking-wider">
              Market Intelligence
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-sm font-medium text-gray-900">
              {analysis.targetRole}
            </span>
            <DemandBadge level={analysis.demandSignal} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {analysis.location && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-600">
                {analysis.location}
              </span>
            )}
            {analysis.seniority && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-600">
                {analysis.seniority}
              </span>
            )}
          </div>
        </div>

        {/* Sample Job Titles */}
        {analysis.sampleJobTitles.length > 0 && (
          <Section title={`Sample Job Titles (${analysis.sampleJobTitles.length})`} defaultOpen={true}>
            <div className="flex flex-wrap gap-1.5">
              {analysis.sampleJobTitles.map((title, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-full bg-violet-50 border border-indigo-900/50 text-indigo-300"
                >
                  {title}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Top Keywords */}
        {analysis.topKeywords.length > 0 && (
          <Section title={`Top Keywords (${analysis.topKeywords.length})`} defaultOpen={true}>
            <div className="flex flex-wrap gap-1.5">
              {analysis.topKeywords.map((kw, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-full bg-violet-50 border border-indigo-900/50 text-indigo-300"
                >
                  {kw}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Common Tools */}
        {analysis.commonTools.length > 0 && (
          <Section title={`Common Tools & Platforms (${analysis.commonTools.length})`} defaultOpen={true}>
            <div className="flex flex-wrap gap-1.5">
              {analysis.commonTools.map((tool, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-full bg-gray-200 border border-gray-300 text-gray-600"
                >
                  {tool}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Salary Insights */}
        <Section title="Salary Insights" defaultOpen={true}>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {analysis.salaryInsights.junior && (
                <>
                  <span className="text-gray-500">Junior</span>
                  <span className="text-gray-700 font-medium">{analysis.salaryInsights.junior}</span>
                </>
              )}
              {analysis.salaryInsights.mid && (
                <>
                  <span className="text-gray-500">Mid-level</span>
                  <span className="text-gray-700 font-medium">{analysis.salaryInsights.mid}</span>
                </>
              )}
              {analysis.salaryInsights.senior && (
                <>
                  <span className="text-gray-500">Senior</span>
                  <span className="text-gray-700 font-medium">{analysis.salaryInsights.senior}</span>
                </>
              )}
            </div>
            {analysis.salaryInsights.notes && (
              <p className="text-xs text-gray-500 pt-1 border-t border-gray-300">
                {analysis.salaryInsights.notes}
              </p>
            )}
          </div>
        </Section>

        {/* Resume Alignment Tips */}
        {analysis.resumeAlignmentTips.length > 0 && (
          <Section title={`Resume Alignment Tips (${analysis.resumeAlignmentTips.length})`} defaultOpen={true}>
            <ol className="space-y-2">
              {analysis.resumeAlignmentTips.map((tip, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-700">
                  <span className="text-[#6366f1] flex-shrink-0 font-mono text-xs mt-0.5 w-4 text-right">
                    {i + 1}.
                  </span>
                  {tip}
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Common Responsibilities */}
        {analysis.commonResponsibilities.length > 0 && (
          <Section title={`Common Responsibilities (${analysis.commonResponsibilities.length})`}>
            <ul className="space-y-1.5">
              {analysis.commonResponsibilities.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-[#6366f1] flex-shrink-0 mt-0.5">→</span>
                  {r}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Common Qualifications */}
        {analysis.commonQualifications.length > 0 && (
          <Section title={`Common Qualifications (${analysis.commonQualifications.length})`}>
            <ul className="space-y-1.5">
              {analysis.commonQualifications.map((q, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-[#6366f1] flex-shrink-0 mt-0.5">✓</span>
                  {q}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Repeated Phrases */}
        {analysis.repeatedPhrases.length > 0 && (
          <Section title={`Repeated Phrases (${analysis.repeatedPhrases.length})`}>
            <div className="flex flex-wrap gap-2">
              {analysis.repeatedPhrases.map((phrase, i) => (
                <span
                  key={i}
                  className="text-xs text-gray-500 bg-gray-200 border border-gray-300 rounded-lg px-3 py-1.5 font-mono leading-relaxed"
                >
                  &ldquo;{phrase}&rdquo;
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Market Notes */}
        {analysis.marketNotes.length > 0 && (
          <Section title={`Market Notes (${analysis.marketNotes.length})`}>
            <ul className="space-y-1.5">
              {analysis.marketNotes.map((note, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-gray-500 flex-shrink-0 mt-0.5">–</span>
                  {note}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
