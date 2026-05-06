"use client";

/**
 * ScoreReveal — the wow moment shown immediately after a resume is uploaded
 * and analysed.
 *
 * Two states:
 *   1. LOADING (analysis === null) — pulsing circle + 12-step personalised
 *      progress sequence + steady progress bar over ~3 minutes. No silent
 *      "Scoring…" dead air.
 *   2. REVEALED (analysis present) — big animated count-up to score, tier
 *      badge, closest-match role, three colour-coded cards (Strong / Weak /
 *      Top fix), CTA "Show me the full report".
 *
 * The transition between states is automatic the moment the analysis
 * resolves: the active step jumps to "Almost done", the bar locks at 100%,
 * the score number counts up 0→target over 1.6s, and the cards fade in.
 */

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

type Props = {
  analysis: ResumeAnalysis | null;
  candidateFirstName?: string | null;
  /** Resume-derived role from the candidate's most recent real job (e.g. "Senior Data Engineer"). */
  extractedRole?: string | null;
  /** totalYearsExperience from extraction. */
  years?: number | null;
  /** User's selected target role from the upload step (e.g. "Data Engineer"). */
  targetRole?: string | null;
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

// Pick "a" or "an" based on the first word's leading sound. Vowel-letter
// heuristic with light vowel-sound exceptions ("UI", "FE" → "a"; "MBA",
// "HR" → "an"). Good enough for resume role labels.
function articleFor(phrase: string): string {
  const word = phrase.trim().split(/\s+/)[0] ?? "";
  if (!word) return "a";
  const upper = word.toUpperCase();
  // Acronyms — pronounced letter-by-letter, so "MBA" reads as "em-bee-ay"
  // and takes "an"; "UI" reads as "you-eye" so "a UI Designer" is correct.
  const vowelSoundAcronyms = ["MBA", "MS", "MD", "FBI", "HR", "HTML", "HTTP", "L1", "L2"];
  const consonantSoundAcronyms = ["UI", "UX", "URL", "USB", "U.S.", "EU"];
  if (consonantSoundAcronyms.some((a) => upper.startsWith(a))) return "a";
  if (vowelSoundAcronyms.some((a) => upper.startsWith(a))) return "an";
  // Default vowel rule on first letter.
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

// Round fractional years into a clean phrase. Stackle reports come from
// extraction in decimals (1.4, 4.8) which read awkwardly in copy.
function describeYears(years: number | null | undefined): string {
  if (typeof years !== "number" || !isFinite(years) || years <= 0) return "your experience";
  if (years < 1) return "less than 1 year of experience";
  // Round to nearest integer; tag "about" / "almost" so it doesn't feel false.
  const floor = Math.floor(years);
  const frac = years - floor;
  if (frac < 0.25) {
    return floor === 1 ? "1 year of experience" : `${floor} years of experience`;
  }
  if (frac >= 0.75) {
    const rounded = floor + 1;
    return rounded === 1 ? "almost 1 year of experience" : `almost ${rounded} years of experience`;
  }
  // Mid-range — say "about N" using the lower side.
  return floor === 1 ? "about 1 year of experience" : `about ${floor} years of experience`;
}

// Build the 12 progress messages, personalised with whatever data the
// extraction agent returned. Falls back gracefully if a field is missing.
function buildProgressMessages(extractedRole: string | null, years: number | null, targetRole: string | null): string[] {
  const role = (extractedRole ?? "").trim();
  const target = (targetRole ?? "").trim();
  const yearsPhrase = describeYears(years);
  const article = role ? articleFor(role) : "a";

  return [
    "Reading your resume…",
    role
      ? `You're ${article} ${role} with ${yearsPhrase}…`
      : "Pulling out your roles, dates, and skills…",
    "Identifying your closest role match…",
    target
      ? `Found you're closest to ${target}…`
      : "Mapping your background to target roles…",
    "Mapping your skills to the market…",
    "Checking ATS compatibility…",
    "Scoring your bullet impact…",
    "Analyzing your strongest achievements…",
    target
      ? `Finding keyword gaps for ${target}…`
      : "Finding the keyword gaps that matter…",
    "Benchmarking against role standards…",
    "Building your prioritized action plan…",
    "Almost done — preparing your report…",
  ];
}

const MS_PER_STEP = 14_000;       // 14s per message → 12 × 14 = 168s ≈ 2m48s
const TOTAL_LOADING_MS = 168_000; // ~2m48s, the bar fills over this window

export default function ScoreReveal({
  analysis,
  candidateFirstName,
  extractedRole,
  years,
  targetRole,
  onContinue,
}: Props) {
  const [displayedScore, setDisplayedScore] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const targetScore = analysis ? computeScore(analysis) : 0;
  const { label, color } = analysis
    ? scoreLabel(targetScore)
    : { label: "Analyzing", color: "#94a3b8" };

  // Tick the loading clock every 250ms while the analysis is in flight.
  // Stop ticking the moment analysis lands so the UI freezes the bar at
  // 100% and lets the count-up take over.
  useEffect(() => {
    if (analysis) return;
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => clearInterval(id);
  }, [analysis]);

  // Count-up animation when analysis lands. Cubic ease-out over 1.6s.
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

  // Loading-state derivations
  const messages = buildProgressMessages(extractedRole ?? null, years ?? null, targetRole ?? null);
  const lastIdx = messages.length - 1;
  const stepIdx = analysis
    ? lastIdx                                    // analysis landed → "Almost done"
    : Math.min(lastIdx - 1, Math.floor(elapsedMs / MS_PER_STEP));
  const message = messages[stepIdx];
  const progressPct = analysis
    ? 100
    : Math.min(96, (elapsedMs / TOTAL_LOADING_MS) * 96);

  // Reveal-state derivations
  const topStrengths = (analysis?.strengths ?? []).slice(0, 2);
  const topWeaknesses = (analysis?.weaknesses ?? []).slice(0, 2);
  const topFix = analysis?.rewritePriorities?.[0] ?? null;
  const bestFitRoles = analysis?.bestFitRoles ?? [];
  const topMatch = bestFitRoles[0] ?? null;
  const topMatchRole = topMatch?.title ?? analysis?.likelyTargetRole ?? null;
  const topMatchPct = topMatch?.matchPct;
  const altMatches = bestFitRoles.slice(1, 3);
  // First sentence only — analysis sometimes gives multi-sentence text;
  // the score reveal needs punch, not paragraphs.
  const firstSentence = (s: string) => {
    const m = s.match(/^[^.!?]+[.!?]/);
    return (m ? m[0] : s).trim();
  };
  const topStrengthOne = topStrengths[0] ? firstSentence(topStrengths[0]) : null;
  const topWeaknessOne = topWeaknesses[0] ? firstSentence(topWeaknesses[0]) : null;
  const topFixOne = topFix ? firstSentence(topFix) : null;
  const fixCount = (analysis?.rewritePriorities ?? []).length;

  // Color that transitions WITH the displayed score. Used by the big number
  // so as it counts up 0 → target it visibly shifts red → orange → green.
  const liveScoreColor = analysis
    ? (displayedScore < 31 ? "#dc2626"
      : displayedScore < 61 ? "#ea580c"
      : displayedScore < 80 ? "#ca8a04"
      : "#16a34a")
    : color;

  const greeting = candidateFirstName
    ? `Here's the read on your resume, ${candidateFirstName}.`
    : "Here's the read on your resume.";

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gradient-to-b from-white via-white to-[#fafafa] relative">
      {/* Stackle logo — top-left, matches OnboardingFlow placement so the
          screen feels continuous with the upload flow that preceded it. */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-2.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-black text-base font-bold shadow"
          style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
        >
          S
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-gray-600 font-semibold">
          Stackle
        </span>
      </div>
      <div className="w-full max-w-xl flex flex-col items-center text-center animate-fadein">
        <p className="text-sm text-gray-500 mb-2 tracking-wide">{greeting}</p>

        {/* Score area — pulsing soft circle while loading, big number once
            landed. The big number uses liveScoreColor which transitions
            red → orange → yellow → green AS the count-up progresses, so
            the user sees a hot-low-score cool down (or rise) in real time. */}
        {analysis ? (
          <div className="relative my-6 flex items-baseline gap-2 score-bounce">
            <span
              className="text-[140px] leading-none font-bold tracking-tight tabular-nums"
              style={{ color: liveScoreColor, transition: "color 200ms linear" }}
            >
              {displayedScore}
            </span>
            <span className="text-3xl font-medium text-gray-500">/100</span>
          </div>
        ) : (
          <div className="relative my-6 w-40 h-40 rounded-full flex items-center justify-center score-loading-pulse">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle at 30% 30%, rgba(255, 247, 173, 0.7), rgba(255, 169, 249, 0.55) 55%, rgba(169, 154, 249, 0.35) 100%)",
              }}
            />
            <div className="absolute inset-3 rounded-full bg-white/70 backdrop-blur-sm" />
            <div className="relative flex gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400/80 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-violet-400/80 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-violet-400/80 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {/* Tier badge */}
        <span
          className="inline-block text-xs font-semibold tracking-wide uppercase px-3 py-1 rounded-full mb-2"
          style={{ background: `${color}15`, color }}
        >
          {label}
        </span>

        {/* Closest-match line + alternative-fit roles. Pulls bestFitRoles
            from the analysis so users see the depth of the match. */}
        {topMatchRole && (
          <div className="mb-7 text-center">
            <p className="text-sm text-gray-600">
              Closest match: <span className="font-semibold text-gray-900">{topMatchRole}</span>
              {typeof topMatchPct === "number" && (
                <span className="text-gray-500"> ({topMatchPct}% fit)</span>
              )}
            </p>
            {altMatches.length > 0 && (
              <p className="text-xs text-gray-500 mt-1.5">
                Also fits: {altMatches.map((r, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    <span className="text-gray-700">{r.title}</span>
                    {typeof r.matchPct === "number" && <span> ({r.matchPct}%)</span>}
                  </span>
                ))}
              </p>
            )}
          </div>
        )}

        {/* LOADING STATE — progress bar + rotating message */}
        {!analysis && (
          <div className="w-full mt-4 mb-8">
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-4">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, #a99af9, #4fc9a4)",
                  transition: "width 600ms ease-out",
                }}
              />
            </div>
            {/* Rotating message — the `key` change triggers the fade-in */}
            <p
              key={stepIdx}
              className="text-sm text-gray-700 message-fade min-h-[1.5em]"
            >
              {message}
            </p>
          </div>
        )}

        {/* REVEALED STATE — three one-sentence insight cards. Each card
            takes only the FIRST sentence of the analysis text so the
            screen scans in 6 seconds. */}
        {analysis && (
          <div className="w-full flex flex-col gap-3 mb-8 text-left">
            {topStrengthOne && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-emerald-700 mb-1">Strong</p>
                <p className="text-sm text-gray-800 leading-snug">{topStrengthOne}</p>
              </div>
            )}
            {topWeaknessOne && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-amber-700 mb-1">Weak</p>
                <p className="text-sm text-gray-800 leading-snug">{topWeaknessOne}</p>
              </div>
            )}
            {topFixOne && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-violet-700 mb-1">Top fix</p>
                <p className="text-sm text-gray-800 leading-snug">{topFixOne}</p>
              </div>
            )}
          </div>
        )}

        {/* CTA — bigger and pulses once on appearance to draw the eye. */}
        <button
          onClick={onContinue}
          disabled={!analysis}
          className={`group flex items-center gap-2.5 px-8 py-4 rounded-xl bg-gray-900 text-white text-base font-semibold hover:bg-black active:scale-[0.99] transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${analysis ? "cta-pulse" : ""}`}
        >
          {analysis ? "Show me the full report" : "Building your report…"}
          {analysis && <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.25} />}
        </button>

        <p className="text-xs text-gray-500 mt-6 max-w-sm leading-relaxed">
          {analysis && fixCount > 0
            ? <>Your report has <span className="text-gray-700 font-medium">{fixCount} specific fix{fixCount === 1 ? "" : "es"}</span> ready. Most users see a 15–25 point improvement.</>
            : "Stackle reads your resume the way a senior recruiter would."}
        </p>
      </div>

      <style jsx>{`
        @keyframes fadein {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fadein {
          animation: fadein 600ms ease forwards;
        }

        /* Gentle pulse for the loading score circle. Slow, breathing rhythm. */
        @keyframes score-loading-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.95; }
          50%      { transform: scale(1.04); opacity: 1;    }
        }
        .score-loading-pulse {
          animation: score-loading-pulse 2.4s ease-in-out infinite;
        }

        /* Subtle bounce when the big number lands — fires once, ~1.6s
           into the count-up so it coincides with the final tick. */
        @keyframes score-bounce {
          0%, 100% { transform: scale(1); }
          70%      { transform: scale(1); }
          82%      { transform: scale(1.06); }
          100%     { transform: scale(1); }
        }
        .score-bounce {
          animation: score-bounce 2.0s ease-out 1;
        }

        /* Once-on-mount pulse around the CTA so it draws the eye when the
           reveal lands. Single ring expanding outward, fades. */
        @keyframes cta-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(24, 24, 27, 0.35), 0 10px 25px -10px rgba(0,0,0,0.25); }
          70%  { box-shadow: 0 0 0 16px rgba(24, 24, 27, 0), 0 10px 25px -10px rgba(0,0,0,0.25); }
          100% { box-shadow: 0 0 0 0 rgba(24, 24, 27, 0),    0 10px 25px -10px rgba(0,0,0,0.25); }
        }
        .cta-pulse {
          animation: cta-pulse 2.4s ease-out 1;
        }

        /* Per-message fade as stepIdx increments. */
        @keyframes message-fade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .message-fade {
          animation: message-fade 500ms ease forwards;
        }
      `}</style>
    </div>
  );
}
