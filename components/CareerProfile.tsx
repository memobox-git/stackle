"use client";

// Career Profile landing screen — shown once after onboarding completes.
// The "this knows me" moment: best-fit roles with match scores, top
// strengths and gaps from the analysis, restated career goal, and three
// CTAs that route to existing flows. Reuses every existing data source;
// no new API calls. Dismissible — re-openable via the sidebar.

import { useMemo } from "react";
import { Sparkles, Target, FileText, X, ArrowRight, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import type { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

interface CareerProfileProps {
  extraction: ResumeExtraction | null;
  analysis: ResumeAnalysis | null;
  careerGoal: string | null;
  // Routes to Resume Builder (Report tab focus).
  onFixResume: () => void;
  // Opens the JDMatchModal directly.
  onCompareJD: () => void;
  // Routes to plain chat view.
  onContinueToChat: () => void;
  // Dismiss the panel and let the user keep working in whatever view
  // they last had focus on.
  onClose: () => void;
}

// Light, opinionated guess at adjacent roles when the analysis didn't ship
// with `bestFitRoles`. Used only as a graceful fallback for cached pre-feature
// analyses; new analyses come back with a properly-modeled best-fit array.
const FALLBACK_ADJACENT: Record<string, string[]> = {
  "data engineer": ["Analytics Engineer", "BI Developer"],
  "analytics engineer": ["Data Engineer", "BI Developer"],
  "data analyst": ["Analytics Engineer", "BI Developer"],
  "data scientist": ["ML Engineer", "Analytics Engineer"],
  "ml engineer": ["Data Engineer", "Data Scientist"],
  "software engineer": ["Backend Engineer", "Platform Engineer"],
  "backend engineer": ["Software Engineer", "Platform Engineer"],
};

function inferBestFitRoles(analysis: ResumeAnalysis | null): { title: string; matchPct: number; reason: string }[] {
  if (analysis?.bestFitRoles && analysis.bestFitRoles.length > 0) {
    return analysis.bestFitRoles.slice(0, 3);
  }
  // Fallback path — no bestFitRoles in the cached analysis.
  const target = analysis?.likelyTargetRole?.trim();
  if (!target) return [];
  const adjacents = FALLBACK_ADJACENT[target.toLowerCase()] ?? [];
  return [
    { title: target, matchPct: 78, reason: "Closest match to current resume." },
    ...adjacents.slice(0, 2).map((t) => ({
      title: t,
      matchPct: 64,
      reason: "Adjacent role — reachable with positioning tweaks.",
    })),
  ];
}

export default function CareerProfile({
  extraction,
  analysis,
  careerGoal,
  onFixResume,
  onCompareJD,
  onContinueToChat,
  onClose,
}: CareerProfileProps) {
  const firstName = (extraction?.name ?? "").trim().split(/\s+/)[0] || "there";

  const bestFitRoles = useMemo(() => inferBestFitRoles(analysis), [analysis]);

  const strengths = (analysis?.strengths ?? []).slice(0, 4);
  const weaknesses = [
    ...(analysis?.weaknesses ?? []).slice(0, 3),
    ...(analysis?.keywordGaps ?? []).slice(0, 3).map((k) => `Missing keyword: ${k}`),
  ].slice(0, 4);

  // Highlight one CTA based on the user's stated goal. Keeps the page
  // visually pointed at the next best move instead of three equal options.
  const goalLower = (careerGoal ?? "").toLowerCase();
  const primaryCta: "fix" | "jd" | "chat" =
    goalLower.includes("improve") || goalLower.includes("resume") ? "fix" :
    goalLower.includes("land") || goalLower.includes("switch") ? "jd" :
    "chat";

  return (
    <div className="min-h-screen w-full bg-[#0d0d0d] text-white overflow-y-auto">
      {/* Soft hero gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 opacity-40"
        style={{
          background: `
            radial-gradient(ellipse 60% 40% at 20% 0%, rgba(255, 247, 173, 0.15), transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 100%, rgba(255, 169, 249, 0.12), transparent 60%)
          `,
        }}
      />

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-semibold mb-2">
              Career Profile
            </p>
            <h1 className="text-3xl font-bold text-white leading-tight">
              Here's where you stand, {firstName}.
            </h1>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              Based on your resume — three best-fit roles, what's strong, what's missing,
              and your three best next moves.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Skip — go to chat"
            aria-label="Close"
            className="text-gray-500 hover:text-white w-8 h-8 rounded-md flex items-center justify-center hover:bg-[#1a1a1a]"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Best-fit roles */}
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-[#1f1f1f]">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
              You are currently closest to
            </p>
          </div>
          <ul className="divide-y divide-[#1a1a1a]">
            {bestFitRoles.length === 0 ? (
              <li className="px-5 py-4 text-sm text-gray-500 italic">
                Best-fit role data not yet available — waiting on resume analysis.
              </li>
            ) : (
              bestFitRoles.map((r, i) => {
                const barColor = r.matchPct >= 80 ? "#16a34a" : r.matchPct >= 65 ? "#65a30d" : "#d97706";
                return (
                  <li key={i} className="px-5 py-3 flex items-center gap-4">
                    <span className="text-[11px] font-mono text-gray-600 w-5 flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-semibold text-white truncate">
                          {r.title}
                        </span>
                        <span
                          className="text-[11px] font-mono font-semibold flex-shrink-0"
                          style={{ color: barColor }}
                        >
                          {r.matchPct}% match
                        </span>
                      </div>
                      {r.reason && (
                        <p className="text-[11px] text-gray-500 leading-5">{r.reason}</p>
                      )}
                      <div className="mt-2 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${r.matchPct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Strengths + Gaps */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1f1f1f] flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.25} />
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                Main strengths
              </p>
            </div>
            <ul className="px-5 py-3 space-y-2">
              {strengths.length === 0 ? (
                <li className="text-[12px] text-gray-600 italic">No strengths flagged yet.</li>
              ) : (
                strengths.map((s, i) => (
                  <li key={i} className="text-[13px] text-gray-300 leading-5 flex gap-2">
                    <span className="text-emerald-500 flex-shrink-0">✓</span>
                    <span>{s}</span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1f1f1f] flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" strokeWidth={2.25} />
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                Biggest gaps
              </p>
            </div>
            <ul className="px-5 py-3 space-y-2">
              {weaknesses.length === 0 ? (
                <li className="text-[12px] text-gray-600 italic">No gaps flagged yet.</li>
              ) : (
                weaknesses.map((w, i) => (
                  <li key={i} className="text-[13px] text-gray-300 leading-5 flex gap-2">
                    <span className="text-amber-500 flex-shrink-0">!</span>
                    <span>{w}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Goal restatement */}
        {careerGoal && (
          <div className="rounded-xl border border-[#1f1f1f] bg-[#0f0f0f] px-5 py-3 mb-6">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1">
              Your goal
            </p>
            <p className="text-sm text-gray-200">{careerGoal}</p>
          </div>
        )}

        {/* CTAs */}
        <div className="grid md:grid-cols-3 gap-3">
          <CtaCard
            primary={primaryCta === "fix"}
            icon={<Sparkles className="w-4 h-4" strokeWidth={2} />}
            title="Fix Resume Score"
            sub="Walk through targeted rewrites"
            onClick={onFixResume}
          />
          <CtaCard
            primary={primaryCta === "jd"}
            icon={<Target className="w-4 h-4" strokeWidth={2} />}
            title="Compare to a Job"
            sub="Paste a JD; see fit + missing keywords"
            onClick={onCompareJD}
          />
          <CtaCard
            primary={primaryCta === "chat"}
            icon={<FileText className="w-4 h-4" strokeWidth={2} />}
            title="Continue to Chat"
            sub="Ask anything about your career"
            onClick={onContinueToChat}
          />
        </div>

        <p className="text-[11px] text-gray-600 mt-6 text-center">
          You can always re-open this from the sidebar.
        </p>
      </div>
    </div>
  );
}

// Single CTA card. Primary card gets a brighter border + filled icon
// chip so the user knows where to look first.
function CtaCard({
  primary,
  icon,
  title,
  sub,
  onClick,
}: {
  primary: boolean;
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all hover:-translate-y-0.5 ${
        primary
          ? "bg-white text-black border-white hover:shadow-[0_8px_24px_-12px_rgba(255,255,255,0.4)]"
          : "bg-[#0f0f0f] text-white border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#141414]"
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            primary ? "bg-black text-white" : "bg-[#1a1a1a] text-gray-300"
          }`}
        >
          {icon}
        </div>
        <span className={`text-sm font-semibold ${primary ? "text-black" : "text-white"}`}>
          {title}
        </span>
        <ArrowRight className={`w-3.5 h-3.5 ml-auto ${primary ? "text-black" : "text-gray-500"}`} strokeWidth={2} />
      </div>
      <p className={`text-[11px] leading-5 ${primary ? "text-gray-700" : "text-gray-500"}`}>
        {sub}
      </p>
    </button>
  );
}

// Quiet — `Mail` import retained for parity with future cover-letter CTA.
void Mail;
