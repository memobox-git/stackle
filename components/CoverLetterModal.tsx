"use client";

import { useEffect, useRef, useState } from "react";
import { X, Mail, Copy, Download, RotateCcw, Check, Loader2 } from "lucide-react";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

interface CoverLetterModalProps {
  extraction: ResumeExtraction | null;
  // Optional defaults — auto-fill the role field when open if the user has
  // a target role on file (e.g. from the analysis).
  defaultRole?: string | null;
  // Strong prefills handed in by upstream flows (e.g. JD match clicked
  // "Cover letter for this" — gives us company/role/JD all at once).
  prefillCompany?: string;
  prefillRole?: string;
  prefillJobDescription?: string;
  onClose: () => void;
}

export default function CoverLetterModal({
  extraction,
  defaultRole,
  prefillCompany,
  prefillRole,
  prefillJobDescription,
  onClose,
}: CoverLetterModalProps) {
  const [companyName, setCompanyName] = useState(prefillCompany ?? "");
  const [roleTitle, setRoleTitle] = useState(prefillRole ?? defaultRole?.trim() ?? "");
  const [jobDescription, setJobDescription] = useState(prefillJobDescription ?? "");
  const [letter, setLetter] = useState("");
  // Previous letters the user has rejected this session. Passed back to the
  // writer so Regenerate produces a genuinely different angle instead of a
  // near-identical paraphrase.
  const [previousAttempts, setPreviousAttempts] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Once a letter is generated, collapse the inputs so the user has space
  // to read / edit the output. They can expand again via "Edit inputs".
  const [inputsExpanded, setInputsExpanded] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cleanup any in-flight request on unmount.
    return () => abortRef.current?.abort();
  }, []);

  async function generate(opts?: { isRegenerate?: boolean }) {
    if (!extraction) {
      setError("Resume data missing — can't generate.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    // On regenerate, fold the current letter into the rejected-drafts list
    // before calling. On first generate, drafts stays empty.
    const drafts = opts?.isRegenerate && letter
      ? [...previousAttempts, letter].slice(-3) // keep last 3 to stay under token budget
      : previousAttempts;

    try {
      const res = await fetch("/api/agents/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          extraction,
          companyName: companyName.trim() || undefined,
          roleTitle: roleTitle.trim() || undefined,
          jobDescription: jobDescription.trim() || undefined,
          previousAttempts: drafts,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      if (!data.letter) throw new Error("Empty letter returned.");
      if (opts?.isRegenerate) setPreviousAttempts(drafts);
      setLetter(data.letter);
      setInputsExpanded(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setIsGenerating(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  async function handleCopy() {
    if (!letter) return;
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard copy failed.");
    }
  }

  function handleDownload() {
    if (!letter) return;
    const slug = [companyName, roleTitle].filter(Boolean).join("-").replace(/[^a-z0-9-]+/gi, "_").replace(/_+/g, "_") || "cover-letter";
    const filename = `${slug}.txt`;
    const blob = new Blob([letter], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
  }

  const hasLetter = !!letter;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      style={{ animation: "fadeIn 180ms ease" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "fadeIn 220ms ease" }}
      >
        {/* Header */}
        <div className="relative px-6 pt-5 pb-4 border-b border-gray-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
            <Mail className="w-4 h-4 text-gray-700" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">Cover letter</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Grounded in your resume. No invented facts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-900 w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Inputs */}
          {inputsExpanded && (
            <div className="px-6 py-4 space-y-3 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
                    Company
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Stripe"
                    disabled={isGenerating}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-[#555] outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
                    Role
                  </label>
                  <input
                    type="text"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder={defaultRole || "e.g. Senior Data Engineer"}
                    disabled={isGenerating}
                    className="w-full bg-gray-50 border border-gray-200 focus:border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-[#555] outline-none transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1.5">
                  Job description <span className="text-gray-700 normal-case tracking-normal font-normal">(optional — paste for tighter targeting)</span>
                </label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the JD here…"
                  rows={5}
                  disabled={isGenerating}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-[#555] outline-none transition-colors resize-y font-mono leading-6"
                />
              </div>
            </div>
          )}

          {/* Output */}
          {(isGenerating || hasLetter) && (
            <div className="px-6 py-4">
              {!inputsExpanded && (
                <button
                  onClick={() => setInputsExpanded(true)}
                  className="text-[11px] text-gray-500 hover:text-gray-900 mb-3 inline-flex items-center gap-1"
                >
                  ← Edit inputs
                </button>
              )}
              {isGenerating && !hasLetter ? (
                <div className="flex items-center gap-3 py-10 justify-center text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
                  <span className="text-sm">Writing your letter…</span>
                  <button
                    onClick={handleStop}
                    className="text-[11px] text-gray-500 hover:text-gray-900 ml-2 border border-gray-200 rounded-md px-2 py-1"
                  >
                    Stop
                  </button>
                </div>
              ) : (
                <textarea
                  value={letter}
                  onChange={(e) => setLetter(e.target.value)}
                  rows={14}
                  className="w-full bg-white border border-gray-200 focus:border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-[#555] outline-none transition-colors resize-y leading-7 whitespace-pre-wrap"
                  placeholder="Your letter will appear here."
                  aria-label="Cover letter"
                />
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-6 pb-2">
              <div className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-md px-3 py-2">
                {error}
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center gap-2 flex-wrap">
          {!hasLetter ? (
            <button
              onClick={() => generate()}
              disabled={isGenerating || !extraction}
              className="flex-1 py-2.5 rounded-lg bg-white hover:bg-gray-100 text-black text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                  Generating…
                </>
              ) : (
                <>Generate cover letter</>
              )}
            </button>
          ) : (
            <>
              <button
                onClick={handleCopy}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-xs font-medium transition-colors disabled:opacity-60"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.25} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleDownload}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-xs font-medium transition-colors disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                Download
              </button>
              <button
                onClick={() => generate({ isRegenerate: true })}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-xs font-medium transition-colors disabled:opacity-60"
                title="Try a different angle"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} strokeWidth={1.75} />
                Regenerate
              </button>
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="text-xs text-gray-500 hover:text-gray-900 px-3 py-2"
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
