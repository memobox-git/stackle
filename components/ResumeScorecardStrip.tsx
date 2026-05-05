"use client";

import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { fleschReadingEase } from "@/lib/resumeLinters";
import { useMemo } from "react";

interface ResumeScorecardStripProps {
  analysis: ResumeAnalysis | null;
  extraction?: ResumeExtraction | null;
  onCellClick?: (prompt: string) => void;
}

// Thin scorecard rendered above the Resume Builder chat. Each cell is
// clickable — click populates the chat input with a "walk me through" prompt.
// Skeleton state while the analysis is still computing. Last cell is a pure
// client-side readability number (Flesch-Kincaid) with no LLM call.
export default function ResumeScorecardStrip({ analysis, extraction, onCellClick }: ResumeScorecardStripProps) {
  const readability = useMemo(() => {
    if (!extraction) return null;
    const text = [
      extraction.summary ?? "",
      ...(extraction.experience ?? []).flatMap((e) => e.bullets ?? []),
      ...(extraction.projects ?? []).map((p) => p.description ?? ""),
    ].filter(Boolean).join(" ");
    if (text.length < 30) return null;
    return fleschReadingEase(text);
  }, [extraction]);

  const cells = [
    {
      key: "ats",
      label: "ATS",
      score: analysis?.scores.atsCompatibility.score ?? null,
      max: analysis?.scores.atsCompatibility.max ?? null,
      prompt: "Walk me through my ATS score — what's hurting it and how do I fix it?",
    },
    {
      key: "impact",
      label: "Impact",
      score: analysis?.scores.contentImpact.score ?? null,
      max: analysis?.scores.contentImpact.max ?? null,
      prompt: "Walk me through my content impact score. Which bullets are weak and how do I sharpen them?",
    },
    {
      key: "keywords",
      label: "Keywords",
      score: analysis?.scores.keywordCoverage.score ?? null,
      max: analysis?.scores.keywordCoverage.max ?? null,
      prompt: "Walk me through my keyword coverage. Which keywords am I missing for my target role?",
    },
  ];

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-2 overflow-x-auto">
      {cells.map((cell) => {
        const ratio = cell.score !== null && cell.max ? cell.score / cell.max : null;
        const color = ratio === null ? "bg-gray-700" : ratio >= 0.8 ? "bg-emerald-500" : ratio >= 0.6 ? "bg-amber-500" : "bg-rose-500";
        const isLoading = cell.score === null;
        return (
          <button
            key={cell.key}
            onClick={() => onCellClick?.(cell.prompt)}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-200 hover:bg-gray-50 transition-colors text-[11px] disabled:cursor-default"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${color} ${isLoading ? "animate-pulse" : ""}`} />
            <span className="text-gray-500 font-medium uppercase tracking-wider">{cell.label}</span>
            <span className="text-gray-200 font-mono">
              {isLoading ? (
                <span className="inline-block w-8 h-3 bg-gray-800/60 rounded animate-pulse" />
              ) : (
                <>
                  {cell.score}
                  <span className="text-gray-600">/{cell.max}</span>
                </>
              )}
            </span>
          </button>
        );
      })}

      {/* Readability — rule-based, instant, no LLM */}
      {readability && (
        <button
          onClick={() => onCellClick?.(`My readability score is ${readability.score} (${readability.label}). Average sentence is ${readability.avgSentenceLen} words. Should I tighten it up, and if so where?`)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-200 hover:bg-gray-50 transition-colors text-[11px]"
          title={`Flesch Reading Ease · avg sentence ${readability.avgSentenceLen} words`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${
            readability.label === "easy" ? "bg-emerald-500" : readability.label === "fair" ? "bg-amber-500" : "bg-rose-500"
          }`} />
          <span className="text-gray-500 font-medium uppercase tracking-wider">Read</span>
          <span className="text-gray-200 font-mono">{readability.score}</span>
        </button>
      )}

      {analysis?.scores.total !== undefined && (
        <span className="ml-auto text-[11px] text-gray-500 font-mono flex-shrink-0">
          Total <span className="text-gray-300">{analysis.scores.total}</span>
        </span>
      )}
    </div>
  );
}
