"use client";

/**
 * RewriteTab — fourth tab in Resume Builder. Generates a fully optimised
 * resume in one Opus pass, then lets the user view it three ways
 * (Original / Optimized / Side by Side), accept all, tweak in Edit, or
 * regenerate with a different style hint.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, ArrowLeft, ArrowRight, Columns2, Layers } from "lucide-react";
import ResumeDocument from "@/components/ResumeDocument";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import type { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

type ViewMode = "original" | "optimized" | "compare";

interface Props {
  extraction: ResumeExtraction;
  analysis: ResumeAnalysis | null;
  targetRole: string;
  jobDescription?: string | null;
  /** Number of fixes the user has already accepted in the Edit tab.
   *  Surfaced in the idle card so we acknowledge their work before
   *  one-shot rewriting on top of it. */
  acceptedFixCount?: number;
  /** Original (pre-edit) score — shown alongside current when changes
   *  exist so the user sees the full progression: Original → Current → After Rewrite. */
  baseScore?: number;
  /** When the user accepts the rewrite, swap working copy + auto-save. */
  onAcceptAll: (rewritten: ResumeExtraction) => void;
  /** "Tweak in Edit" — push the rewritten extraction into edit mode. */
  onTweakInEdit: (rewritten: ResumeExtraction) => void;
  /** Hydrate the rewrite from a saved snapshot when the user returns to
   *  the tab after a refresh. Parent loads from localStorage on mount and
   *  passes the previously-generated extraction here. */
  initialRewritten?: ResumeExtraction | null;
  initialChangedKeys?: string[];
  /** Notify parent when a fresh rewrite is generated so the parent can
   *  persist it (localStorage + future Drive file). Called once per
   *  successful generate(). */
  onRewriteGenerated?: (rewritten: ResumeExtraction, changedKeys: string[], styleHint: string | undefined) => void;
}

const PROGRESS_STEPS = [
  "Reading your resume…",
  "Applying summary rewrite…",
  "Optimising bullets for impact…",
  "Restructuring skills section…",
  "Adding keywords for the target role…",
  "Final polish…",
];

// Score derivation imported from lib/score.ts so Welcome / Report / Edit
// / Rewrite never disagree on the same analysis.
import { deriveScoreFromAnalysis } from "@/lib/score";
function deriveScore(a: ResumeAnalysis | null): number {
  return deriveScoreFromAnalysis(a) || 60;
}

// Group the priority list into a human-readable change preview so the
// user knows what they're committing to before clicking Generate. We
// classify each priority by the section it touches and roll up counts.
function summariseFixes(priorities: string[]): { label: string; key: string }[] {
  const buckets = {
    summary: 0,
    bullets: 0,
    skills: 0,
    keywords: 0,
    structure: 0,
    other: 0,
  };
  priorities.forEach((p) => {
    const u = p.toLowerCase();
    if (/summary|profile|objective|headline/.test(u)) buckets.summary++;
    else if (/bullet|impact|metric|quantif|achievement/.test(u)) buckets.bullets++;
    else if (/skills?\b|technologies|tech list|stack/.test(u)) buckets.skills++;
    else if (/keyword|ats|terminology/.test(u)) buckets.keywords++;
    else if (/order|reorder|move|format|structure|section/.test(u)) buckets.structure++;
    else buckets.other++;
  });
  const items: { label: string; key: string }[] = [];
  if (buckets.summary)  items.push({ key: "summary",  label: `Summary rewrite (third person, value prop)` });
  if (buckets.bullets)  items.push({ key: "bullets",  label: `${buckets.bullets} bullet${buckets.bullets > 1 ? "s" : ""} quantified for impact` });
  if (buckets.skills)   items.push({ key: "skills",   label: `Skills section restructured into categories` });
  if (buckets.keywords) items.push({ key: "keywords", label: `Missing keywords added for the target role` });
  if (buckets.structure) items.push({ key: "structure", label: `Structure + formatting cleanup` });
  if (buckets.other && items.length === 0) items.push({ key: "other", label: `${buckets.other} writing improvement${buckets.other > 1 ? "s" : ""}` });
  return items;
}

const STYLE_OPTIONS: { key: string; label: string; hint?: string }[] = [
  { key: "default",     label: "Default",     hint: "" },
  { key: "modern",      label: "Modern",      hint: "Punchy, recent-keyword-heavy, slightly more casual." },
  { key: "conservative", label: "Conservative", hint: "Formal tone, no slang, traditional resume conventions." },
  { key: "senior",      label: "Senior",      hint: "Lean on leadership signals, scope, and outcomes — not tasks." },
];

export default function RewriteTab({
  extraction,
  analysis,
  targetRole,
  jobDescription,
  acceptedFixCount = 0,
  baseScore,
  onAcceptAll,
  onTweakInEdit,
  initialRewritten = null,
  initialChangedKeys = [],
  onRewriteGenerated,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const downloadAnchorRef = useRef<HTMLDivElement>(null);
  const [progressIdx, setProgressIdx] = useState(0);
  // Seed from initialRewritten so a refreshed page lands on the
  // generated-state view directly, not the empty card.
  const [rewritten, setRewritten] = useState<ResumeExtraction | null>(initialRewritten);
  const [changedKeys, setChangedKeys] = useState<string[]>(initialChangedKeys);

  // Re-sync if the parent's snapshot changes (e.g. user switches chats
  // and a different cached rewrite is hydrated).
  useEffect(() => {
    if (initialRewritten) {
      setRewritten(initialRewritten);
      setChangedKeys(initialChangedKeys);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRewritten]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("optimized");
  const [styleKey, setStyleKey] = useState<string>("default");

  // Cycle progress messages every 6s while generating.
  useEffect(() => {
    if (!generating) return;
    setProgressIdx(0);
    const id = setInterval(() => {
      setProgressIdx((i) => Math.min(PROGRESS_STEPS.length - 1, i + 1));
    }, 6000);
    return () => clearInterval(id);
  }, [generating]);

  // Synced scrolling for compare view.
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<"left" | "right" | null>(null);
  const onScroll = (side: "left" | "right") => () => {
    if (syncingRef.current && syncingRef.current !== side) return;
    const src = side === "left" ? leftRef.current : rightRef.current;
    const dst = side === "left" ? rightRef.current : leftRef.current;
    if (!src || !dst) return;
    syncingRef.current = side;
    const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
    dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight);
    requestAnimationFrame(() => { syncingRef.current = null; });
  };

  const fixCount = (analysis?.rewritePriorities ?? []).length;
  const currentScore = deriveScore(analysis);
  const projHigh = (() => {
    const m = (analysis?.scores?.projectedPostFix ?? "").match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
    return m ? parseInt(m[2] ?? m[1], 10) : Math.min(100, currentScore + 18);
  })();

  async function generate(styleHint?: string) {
    if (!analysis) {
      setError("Run the analysis first — Rewrite needs the prioritised fix list.");
      return;
    }
    setError(null);
    setGenerating(true);
    setRewritten(null);
    setChangedKeys([]);
    try {
      const res = await fetch("/api/agents/resume/rewrite-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction,
          analysis,
          targetRole,
          jobDescription: jobDescription ?? undefined,
          styleHint,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Rewrite failed");
      }
      const data = await res.json() as { extraction: ResumeExtraction; changedKeys: string[] };
      setRewritten(data.extraction);
      setChangedKeys(data.changedKeys ?? []);
      setView("optimized");
      // Persist via parent — survives refresh.
      onRewriteGenerated?.(data.extraction, data.changedKeys ?? [], styleHint);
      // Jump progress to final to make the bar feel complete.
      setProgressIdx(PROGRESS_STEPS.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rewrite failed");
    } finally {
      setGenerating(false);
    }
  }

  // Idle / generating state — wider card with fix breakdown + style picker.
  if (!rewritten) {
    const fixSummary = analysis ? summariseFixes(analysis.rewritePriorities ?? []) : [];
    const remainingFixes = Math.max(0, fixCount - acceptedFixCount);
    const showProgression = typeof baseScore === "number" && baseScore !== currentScore;
    const styleHintFor = (key: string) => {
      const opt = STYLE_OPTIONS.find((o) => o.key === key);
      return opt?.hint && opt.hint.length > 0 ? opt.hint : undefined;
    };
    return (
      <div className="flex-1 overflow-y-auto px-8 pt-12 pb-16 flex flex-col items-center">
        <div className="max-w-xl w-full">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" strokeWidth={2.25} />
              </div>
              <h2 className="text-xl font-medium text-gray-900">Build your optimized resume</h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-5">
              {acceptedFixCount > 0
                ? <>You&apos;ve accepted <span className="font-semibold text-gray-900">{acceptedFixCount} fix{acceptedFixCount === 1 ? "" : "es"}</span> already. This will apply the remaining <span className="font-semibold text-gray-900">{remainingFixes}</span> and polish the entire resume targeting <span className="font-semibold text-gray-900">{targetRole}</span>.</>
                : <>Stackle will apply <span className="font-semibold text-gray-900">{fixCount} fix{fixCount === 1 ? "" : "es"}</span> and generate a polished version targeting <span className="font-semibold text-gray-900">{targetRole}</span>.</>}
            </p>

            {/* Fix breakdown — what changes */}
            {fixSummary.length > 0 && (
              <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 mb-2.5">This will change</p>
                <ul className="space-y-1.5">
                  {fixSummary.map((f) => (
                    <li key={f.key} className="flex items-start gap-2 text-sm text-gray-800">
                      <span className="text-emerald-600 flex-shrink-0 mt-0.5">✓</span>
                      <span>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Stats */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 text-sm space-y-2">
              <Stat label="Target role" value={targetRole} />
              <Stat label="Estimated time" value="~30 seconds" />
              <Stat
                label="Score"
                value={
                  showProgression
                    ? `${baseScore} → ${currentScore} → ${projHigh} (+${projHigh - (baseScore as number)})`
                    : `${currentScore} → ${projHigh} (+${projHigh - currentScore})`
                }
              />
            </div>

            {/* Style selector */}
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-700 mb-2">Style</p>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setStyleKey(opt.key)}
                    title={opt.hint || "Default writing style"}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                      styleKey === opt.key
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "bg-white border-gray-300 text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => generate(styleHintFor(styleKey))}
              disabled={generating || !analysis}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generating ? "Generating…" : "✨ Generate my resume"}
            </button>

            {generating && (
              <div className="mt-6">
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all duration-1000"
                    style={{ width: `${((progressIdx + 1) / PROGRESS_STEPS.length) * 100}%` }}
                  />
                </div>
                <p
                  key={progressIdx}
                  className="text-xs text-gray-500 mt-3"
                  style={{ animation: "fadeIn 400ms ease" }}
                >
                  {PROGRESS_STEPS[progressIdx]}
                </p>
              </div>
            )}

            {error && (
              <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-6">
              Original resume is always preserved. Each generation saves a new version.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Generated state — view-mode tabs + content + action bar
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar — view mode toggle + score badge */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <ViewBtn active={view === "original"} onClick={() => setView("original")} icon={<ArrowLeft size={13} />} label="Original" />
          <ViewBtn active={view === "optimized"} onClick={() => setView("optimized")} icon={<Sparkles size={13} />} label="Optimized" />
          <ViewBtn active={view === "compare"} onClick={() => setView("compare")} icon={<Columns2 size={13} />} label="Side by Side" />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500">{changedKeys.length || "Several"} sections improved</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
            {currentScore} → {projHigh} <span className="text-xs">(+{projHigh - currentScore})</span>
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 bg-gray-50">
        {view === "original" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden max-w-3xl mx-auto">
              <ResumeDocument extraction={extraction} />
            </div>
          </div>
        )}
        {view === "optimized" && (
          <div className="h-full overflow-y-auto p-6">
            <div ref={downloadAnchorRef} className="bg-white shadow-sm border border-emerald-200 rounded-lg overflow-hidden max-w-3xl mx-auto">
              <ResumeDocument extraction={rewritten} />
            </div>
          </div>
        )}
        {view === "compare" && (
          <div className="h-full grid grid-cols-2 min-h-0">
            <div className="flex flex-col min-h-0 border-r border-gray-200">
              <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-200 text-[11px] font-medium tracking-wide uppercase text-gray-500">Original</div>
              <div
                ref={leftRef}
                onScroll={onScroll("left")}
                className="flex-1 overflow-y-auto p-4"
                style={{ filter: "saturate(0.6) opacity(0.85)" }}
              >
                <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
                  <ResumeDocument extraction={extraction} />
                </div>
              </div>
            </div>
            <div className="flex flex-col min-h-0">
              <div className="flex-shrink-0 px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-[11px] font-medium tracking-wide uppercase text-emerald-700">Optimized</div>
              <div
                ref={rightRef}
                onScroll={onScroll("right")}
                className="flex-1 overflow-y-auto p-4 bg-emerald-50/30"
              >
                <div className="bg-white shadow-sm border border-emerald-200 rounded-lg overflow-hidden">
                  <ResumeDocument extraction={rewritten} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex-shrink-0 px-6 py-3 border-t border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onAcceptAll(rewritten)}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors flex items-center gap-2"
        >
          ✓ Accept all changes
        </button>
        <button
          onClick={async () => {
            if (downloading || !rewritten || !downloadAnchorRef.current) return;
            setDownloading(true);
            try {
              const html2pdf = (await import("html2pdf.js")).default;
              const name = rewritten.name?.replace(/[^a-zA-Z0-9]/g, "_") ?? "Resume";
              await html2pdf()
                .set({
                  margin: 0,
                  filename: `${name}_Optimized_Stackle.pdf`,
                  image: { type: "jpeg", quality: 0.98 },
                  html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
                  jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
                })
                .from(downloadAnchorRef.current)
                .save();
            } finally {
              setDownloading(false);
            }
          }}
          disabled={downloading}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-gray-900 hover:bg-black text-white transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {downloading ? "Preparing…" : "↓ Download"}
        </button>
        <button
          onClick={() => onTweakInEdit(rewritten)}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 hover:text-gray-900 transition-colors"
        >
          Tweak in Edit tab
        </button>
        <button
          onClick={() => generate("Try a different angle this time — more senior, more technical, more impact-oriented")}
          disabled={generating}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
        >
          {generating ? "Regenerating…" : "↻ Try different angle"}
        </button>
        <button
          onClick={() => { setRewritten(null); setChangedKeys([]); setError(null); }}
          className="ml-auto text-sm font-medium px-4 py-2 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
        >
          Use original
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
        active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// Acknowledge unused imports kept for potential future use (Layers/ArrowRight)
void Layers;
void ArrowRight;
