"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, Target, Loader2, Paperclip, Link as LinkIcon, FileText,
  Mail, Sparkles, Check, AlertCircle,
} from "lucide-react";
import { parseFile, ACCEPTED_EXTENSIONS } from "@/lib/parseFile";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import type { JDMatchReport } from "@/lib/agents/schemas/jdMatch";

type InputMode = "paste" | "upload" | "url";

interface JDMatchModalProps {
  extraction: ResumeExtraction | null;
  onClose: () => void;
  // When the user clicks "Apply rewrite" inside the report, route to the
  // existing fix flow with this section + instruction. Optional — when not
  // provided, those buttons hide.
  onApplyRewrite?: (sectionKey: string, instruction: string) => void;
  // Open the cover letter modal pre-filled with this JD's company / role /
  // body. Optional.
  onOpenCoverLetter?: (input: { companyName?: string; roleTitle?: string; jobDescription: string }) => void;
}

const VERDICT_STYLE: Record<JDMatchReport["verdict"], { label: string; color: string; bg: string }> = {
  strong:    { label: "Strong fit",   color: "#16a34a", bg: "rgba(22, 163, 74, 0.12)" },
  good:      { label: "Good fit",     color: "#65a30d", bg: "rgba(101, 163, 13, 0.12)" },
  stretch:   { label: "Stretch",      color: "#d97706", bg: "rgba(217, 119, 6, 0.12)" },
  mismatch:  { label: "Mismatch",     color: "#dc2626", bg: "rgba(220, 38, 38, 0.12)" },
};

export default function JDMatchModal({
  extraction,
  onClose,
  onApplyRewrite,
  onOpenCoverLetter,
}: JDMatchModalProps) {
  const [mode, setMode] = useState<InputMode>("paste");
  const [jdText, setJdText] = useState("");
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<JDMatchReport | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [workingLabel, setWorkingLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Track which rewrites the user has clicked Apply on — flips the button
  // to a "✓ Sent to Resume Builder" state.
  const [appliedKeys, setAppliedKeys] = useState<Set<number>>(new Set());

  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleFile(file: File) {
    setError(null);
    setIsWorking(true);
    setWorkingLabel("Parsing file…");
    try {
      const { text } = await parseFile(file);
      setJdText(text);
      setMode("paste"); // surface the parsed text in the textarea so user can review
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't parse that file.";
      setError(msg);
    } finally {
      setIsWorking(false);
      setWorkingLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleUrlFetch() {
    if (!url.trim()) return;
    setError(null);
    setIsWorking(true);
    setWorkingLabel("Fetching the posting…");
    try {
      const res = await fetch("/api/jd-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Fetch failed (${res.status})`);
      setJdText(data.text);
      setMode("paste");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't fetch that URL.";
      setError(msg);
    } finally {
      setIsWorking(false);
      setWorkingLabel("");
    }
  }

  async function handleMatch() {
    if (!extraction) {
      setError("Resume data missing — can't match.");
      return;
    }
    if (jdText.trim().length < 50) {
      setError("Paste a longer JD — at least 50 characters.");
      return;
    }
    setError(null);
    setIsWorking(true);
    setWorkingLabel("Matching against your resume…");
    setAppliedKeys(new Set());
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/agents/jd-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ extraction, jobDescription: jdText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Match failed (${res.status})`);
      setReport(data as JDMatchReport);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setIsWorking(false);
      setWorkingLabel("");
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsWorking(false);
    setWorkingLabel("");
  }

  function reset() {
    setReport(null);
    setError(null);
    setAppliedKeys(new Set());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      style={{ animation: "fadeIn 180ms ease" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#0f0f0f] border border-[#2a2a2a] rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "fadeIn 220ms ease" }}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#1f1f1f] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center">
            <Target className="w-4 h-4 text-gray-300" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white">Match against a job description</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Score the resume against a specific JD. Get keyword coverage + targeted rewrites.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white w-7 h-7 rounded-md flex items-center justify-center hover:bg-[#1a1a1a]"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Input phase */}
          {!report && (
            <div className="px-6 py-4 space-y-3">
              {/* Mode tabs */}
              <div className="flex items-center gap-1 border-b border-[#1f1f1f] pb-2">
                {([
                  { key: "paste", label: "Paste", icon: FileText },
                  { key: "upload", label: "Upload", icon: Paperclip },
                  { key: "url", label: "URL", icon: LinkIcon },
                ] as const).map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => { setMode(m.key); setError(null); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        active
                          ? "bg-[#1a1a1a] text-white border border-[#2a2a2a]"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      {m.label}
                    </button>
                  );
                })}
                {jdText && (
                  <span className="ml-auto text-[10px] text-gray-600 font-mono">
                    {jdText.length.toLocaleString()} chars loaded
                  </span>
                )}
              </div>

              {mode === "url" && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://company.com/careers/role"
                      disabled={isWorking}
                      className="flex-1 bg-[#141414] border border-[#2a2a2a] focus:border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] outline-none transition-colors"
                    />
                    <button
                      onClick={handleUrlFetch}
                      disabled={isWorking || !url.trim()}
                      className="px-4 py-2 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-gray-300 text-xs font-medium disabled:opacity-50"
                    >
                      Fetch
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600">
                    LinkedIn / Indeed / Glassdoor block server fetches. For those, paste the text instead.
                  </p>
                </div>
              )}

              {mode === "upload" && (
                <div className="space-y-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isWorking}
                    className="w-full py-6 rounded-lg bg-[#141414] border border-dashed border-[#2a2a2a] hover:border-[#3a3a3a] text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50 flex flex-col items-center gap-1"
                  >
                    <Paperclip className="w-4 h-4" strokeWidth={1.75} />
                    Click to upload a JD (PDF or DOCX)
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  />
                </div>
              )}

              {/* Always show the textarea — it's where parsed/fetched text lands too */}
              <textarea
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="Paste the job description here…"
                rows={mode === "paste" ? 12 : 8}
                disabled={isWorking}
                className="w-full bg-[#141414] border border-[#2a2a2a] focus:border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] outline-none transition-colors resize-y leading-6"
              />

              {error && (
                <div className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-md px-3 py-2 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                  <span>{error}</span>
                </div>
              )}

              {isWorking && workingLabel && (
                <div className="text-[12px] text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                  {workingLabel}
                </div>
              )}
            </div>
          )}

          {/* Report phase */}
          {report && (
            <div className="px-6 py-4 space-y-5">
              {/* Score header */}
              <div className="flex items-center gap-4">
                <div
                  className="flex flex-col items-center justify-center rounded-2xl px-5 py-3 border"
                  style={{
                    background: VERDICT_STYLE[report.verdict].bg,
                    borderColor: VERDICT_STYLE[report.verdict].color + "55",
                  }}
                >
                  <span className="text-3xl font-bold" style={{ color: VERDICT_STYLE[report.verdict].color }}>
                    {report.matchScore}
                  </span>
                  <span className="text-[9px] tracking-widest uppercase font-semibold" style={{ color: VERDICT_STYLE[report.verdict].color }}>
                    {VERDICT_STYLE[report.verdict].label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 leading-6">{report.summary}</p>
                  {(report.detected.companyName || report.detected.roleTitle) && (
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      {report.detected.roleTitle && <span>{report.detected.roleTitle}</span>}
                      {report.detected.roleTitle && report.detected.companyName && <span> · </span>}
                      {report.detected.companyName && <span>{report.detected.companyName}</span>}
                    </p>
                  )}
                </div>
              </div>

              {/* Keyword coverage */}
              <div className="grid md:grid-cols-2 gap-3">
                <KeywordPanel
                  title="Keywords you have"
                  tone="positive"
                  keywords={report.keywordsPresent}
                />
                <KeywordPanel
                  title="Keywords missing"
                  tone="negative"
                  keywords={report.keywordsMissing}
                />
              </div>

              {/* Fit panels */}
              <div className="grid md:grid-cols-2 gap-3">
                <FitPanel
                  title="Experience"
                  fits={report.experienceFit.fits}
                  primary={
                    [
                      report.experienceFit.yearsResume != null ? `${report.experienceFit.yearsResume} yrs` : "—",
                      report.experienceFit.yearsRequired ?? "—",
                    ].join(" vs ")
                  }
                  note={report.experienceFit.note}
                />
                <FitPanel
                  title="Seniority"
                  fits={report.seniorityFit.fits}
                  primary={
                    [report.seniorityFit.resumeLevel ?? "—", report.seniorityFit.jdLevel ?? "—"].join(" vs ")
                  }
                  note={report.seniorityFit.note}
                />
              </div>

              {/* Rewrites */}
              {report.rewriteRecommendations.length > 0 && (
                <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#1f1f1f] flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" strokeWidth={1.75} />
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                      Rewrites for this JD ({report.rewriteRecommendations.length})
                    </span>
                  </div>
                  <ul className="divide-y divide-[#1a1a1a]">
                    {report.rewriteRecommendations.map((rec, i) => {
                      const applied = appliedKeys.has(i);
                      return (
                        <li key={i} className="px-4 py-3 flex items-start gap-3">
                          <span className="text-[10px] text-gray-600 font-mono mt-0.5 w-5 flex-shrink-0">
                            {i + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[11px] font-mono text-purple-400 bg-purple-950/30 border border-purple-900/40 rounded px-1.5 py-0.5">
                                {rec.sectionKey}
                              </span>
                              <span className="text-sm font-medium text-gray-200 truncate">{rec.title}</span>
                            </div>
                            <p className="text-[12px] text-gray-500 leading-5">{rec.why}</p>
                          </div>
                          {onApplyRewrite && (
                            <button
                              onClick={() => {
                                onApplyRewrite(rec.sectionKey, rec.instruction);
                                setAppliedKeys((s) => new Set([...s, i]));
                              }}
                              disabled={applied}
                              className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0 flex items-center gap-1 ${
                                applied
                                  ? "bg-emerald-950/30 text-emerald-400 border border-emerald-900/50 cursor-default"
                                  : "bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-gray-300 hover:text-white"
                              }`}
                            >
                              {applied
                                ? <><Check className="w-3 h-3" strokeWidth={2.25} /> Sent</>
                                : <>Apply →</>}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1f1f1f] flex items-center gap-2 flex-wrap">
          {!report ? (
            <>
              {isWorking && (
                <button
                  onClick={handleStop}
                  className="text-[11px] text-gray-500 hover:text-white border border-[#2a2a2a] rounded-md px-2 py-1"
                >
                  Stop
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="text-xs text-gray-500 hover:text-gray-300 px-3 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleMatch}
                disabled={isWorking || !extraction || jdText.trim().length < 50}
                className="px-4 py-2 rounded-lg bg-white hover:bg-gray-100 text-black text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                    Matching…
                  </>
                ) : (
                  <>Match against my resume</>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={reset}
                className="text-xs text-gray-500 hover:text-white border border-[#2a2a2a] rounded-md px-2 py-1.5"
              >
                ← New JD
              </button>
              <div className="flex-1" />
              {onOpenCoverLetter && (
                <button
                  onClick={() =>
                    onOpenCoverLetter({
                      companyName: report.detected.companyName ?? undefined,
                      roleTitle: report.detected.roleTitle ?? undefined,
                      jobDescription: jdText,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a1a1a] hover:bg-[#252525] border border-[#2a2a2a] text-gray-300 text-xs font-medium"
                >
                  <Mail className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Cover letter for this
                </button>
              )}
              <button
                onClick={onClose}
                className="text-xs text-gray-300 bg-white text-black px-3 py-2 rounded-lg hover:bg-gray-100 font-semibold"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────

function KeywordPanel({
  title,
  tone,
  keywords,
}: {
  title: string;
  tone: "positive" | "negative";
  keywords: { term: string; importance: "must" | "nice" }[];
}) {
  const accent = tone === "positive" ? "#16a34a" : "#dc2626";
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1f1f1f] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">{title}</span>
        <span className="text-[10px] font-mono text-gray-600">{keywords.length}</span>
      </div>
      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {keywords.length === 0 ? (
          <span className="text-[11px] text-gray-600 italic">None found.</span>
        ) : (
          keywords.map((k, i) => (
            <span
              key={i}
              title={k.importance === "must" ? "Required" : "Nice to have"}
              className="text-[11px] rounded-md px-2 py-0.5 border"
              style={{
                background: `${accent}14`,
                color: accent,
                borderColor: `${accent}55`,
                fontWeight: k.importance === "must" ? 600 : 400,
              }}
            >
              {k.term}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function FitPanel({
  title,
  fits,
  primary,
  note,
}: {
  title: string;
  fits: boolean;
  primary: string;
  note: string;
}) {
  const accent = fits ? "#16a34a" : "#d97706";
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1f1f1f] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">{title}</span>
        <span className="text-[10px] font-mono" style={{ color: accent }}>{fits ? "FITS" : "GAP"}</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-gray-200 font-medium">{primary}</p>
        <p className="text-[11px] text-gray-500 leading-5 mt-1">{note}</p>
      </div>
    </div>
  );
}
