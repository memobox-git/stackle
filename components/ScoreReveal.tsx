"use client";

/**
 * ScoreReveal — the "wow moment" shown immediately after a resume is uploaded
 * and analysed. One screen: big animated score, two-line strong/weak summary,
 * top fix, single CTA. The user sees the value of Stackle in ~3 seconds before
 * landing in the Resume Builder Report tab.
 */

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

type Props = {
  analysis: ResumeAnalysis | null;
  candidateFirstName?: string | null;
  onContinue: () => void;
};

function computeScore(a: ResumeAnalysis): number {
  let score = 55;
  score += Math.min(a.strengths.length * 4, 20);
  score -= Math.min(a.weaknesses.length * 3, 15);
  score -= Math.min(a.keywordGaps.length * 1.5, 10);
  if (a.atsHeuristics?.formattingRisk === "low") score += 5;
  if (a.atsHeuristics?.formattingRisk === "high") score -= 5;
  if (a.atsHeuristics?.scanabilityRisk === "low") score += 5;
  if (a.atsHeuristics?.scanabilityRisk === "high") score -= 5;
  score -= Math.min((a.weakBullets ?? []).length, 5);
  return Math.max(20, Math.min(100, Math.round(score)));
}

function scoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Strong", color: "#10b981" };
  if (score >= 65) return { label: "Good", color: "#22c55e" };
  if (score >= 50) return { label: "Needs work", color: "#f59e0b" };
  return { label: "Weak", color: "#ef4444" };
}

export default function ScoreReveal({ analysis, candidateFirstName, onContinue }: Props) {
  const [displayedScore, setDisplayedScore] = useState(0);

  // If analysis hasn't landed yet, show a "scoring..." state and don't animate.
  const targetScore = analysis ? computeScore(analysis) : 0;
  const { label, color } = analysis ? scoreLabel(targetScore) : { label: "Scoring…", color: "#94a3b8" };

  // Count-up animation. Cubic ease-out over ~1.6s so the number lands with
  // a slight pause at the end — feels like a "reveal", not a tickup.
  useEffect(() => {
    if (!analysis) return;
    const start = performance.now();
    const duration = 1600;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayedScore(Math.round(eased * targetScore));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analysis, targetScore]);

  const topStrengths = (analysis?.strengths ?? []).slice(0, 2);
  const topWeaknesses = (analysis?.weaknesses ?? []).slice(0, 2);
  const topFix = analysis?.rewritePriorities?.[0] ?? null;
  const targetRole = analysis?.bestFitRoles?.[0]?.title ?? analysis?.likelyTargetRole ?? null;

  const greeting = candidateFirstName
    ? `Here's the read on your resume, ${candidateFirstName}.`
    : "Here's the read on your resume.";

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gradient-to-b from-white via-white to-[#fafafa]">
      <div className="w-full max-w-xl flex flex-col items-center text-center animate-fadein">
        <p className="text-sm text-gray-500 mb-2 tracking-wide">{greeting}</p>

        {/* Big score */}
        <div className="relative my-6 flex items-baseline gap-2">
          <span
            className="text-[140px] leading-none font-bold tracking-tight tabular-nums transition-colors"
            style={{ color }}
          >
            {analysis ? displayedScore : "—"}
          </span>
          <span className="text-3xl font-medium text-gray-400">/100</span>
        </div>

        {/* Score label badge */}
        <span
          className="inline-block text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full mb-2"
          style={{ background: `${color}15`, color }}
        >
          {label}
        </span>

        {/* Target role line */}
        {targetRole && (
          <p className="text-sm text-gray-600 mb-8">
            Closest match: <span className="font-semibold text-gray-900">{targetRole}</span>
          </p>
        )}

        {/* Strong / Weak / Top fix — three rows */}
        <div className="w-full flex flex-col gap-3 mb-8 text-left">
          {topStrengths.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-emerald-700 mb-1">Strong</p>
              <p className="text-sm text-gray-800 leading-snug">{topStrengths.join(" · ")}</p>
            </div>
          )}
          {topWeaknesses.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-amber-700 mb-1">Weak</p>
              <p className="text-sm text-gray-800 leading-snug">{topWeaknesses.join(" · ")}</p>
            </div>
          )}
          {topFix && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-violet-700 mb-1">Top fix</p>
              <p className="text-sm text-gray-800 leading-snug">{topFix}</p>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onContinue}
          disabled={!analysis}
          className="group flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-black active:scale-[0.99] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {analysis ? "Show me the full report" : "Scoring your resume…"}
          {analysis && <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.25} />}
        </button>

        <p className="text-xs text-gray-400 mt-6">
          Stackle reads your resume the way a senior recruiter would. You can fix everything in the next screen.
        </p>
      </div>

      <style jsx>{`
        @keyframes fadein {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadein {
          animation: fadein 600ms ease forwards;
        }
      `}</style>
    </div>
  );
}
