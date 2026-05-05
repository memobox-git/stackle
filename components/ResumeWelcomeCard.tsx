"use client";

import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

interface ResumeWelcomeCardProps {
  analysis: ResumeAnalysis | null;
}

// Pure informational card — no action buttons. Pulls top 3 strengths and top
// 3 weaknesses from the analysis. Renders a skeleton state while the analysis
// is still being computed in the background.
export default function ResumeWelcomeCard({ analysis }: ResumeWelcomeCardProps) {
  const strengths = analysis?.strengths?.slice(0, 3) ?? [];
  const weaknesses = analysis?.weaknesses?.slice(0, 3) ?? [];
  const loading = !analysis;

  return (
    <div
      className="w-full max-w-3xl mx-auto px-4 mb-8"
      style={{ animation: "fadeIn 240ms ease" }}
    >
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
          <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-gray-500">
            {loading ? "Scanning resume…" : "First read"}
          </span>
          {loading && (
            <span className="flex gap-1">
              <span className="w-1 h-1 rounded-full bg-gray-500 animate-pulse [animation-delay:0ms]" />
              <span className="w-1 h-1 rounded-full bg-gray-500 animate-pulse [animation-delay:150ms]" />
              <span className="w-1 h-1 rounded-full bg-gray-500 animate-pulse [animation-delay:300ms]" />
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-[#1f1f1f]">
          {/* Strengths column */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold tracking-wide uppercase text-emerald-400/80 mb-3">
              What&apos;s working
            </p>
            {loading ? (
              <SkeletonRows />
            ) : (
              <ul className="space-y-3">
                {strengths.length === 0 ? (
                  <li className="text-sm text-gray-500">Nothing specific flagged.</li>
                ) : (
                  strengths.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-5 text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {/* Issues column */}
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold tracking-wide uppercase text-rose-400/80 mb-3">
              What&apos;s hurting you
            </p>
            {loading ? (
              <SkeletonRows />
            ) : (
              <ul className="space-y-3">
                {weaknesses.length === 0 ? (
                  <li className="text-sm text-gray-500">No major issues flagged.</li>
                ) : (
                  weaknesses.map((w, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-5 text-gray-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-700 mt-1.5 flex-shrink-0" />
          <span
            className="flex-1 h-3 rounded bg-gray-800/60 animate-pulse"
            style={{ width: `${75 - i * 10}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
