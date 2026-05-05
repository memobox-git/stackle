"use client";

import { useState } from "react";
import { Download, Link2, Mail, CheckCircle2, X } from "lucide-react";

interface ResumeCompletionModalProps {
  baseScore: number;
  finalScore: number;
  accepted: number;
  rejected: number;
  signalsHit: {
    trust: boolean;
    voice: boolean;
    scoreMoved: boolean;
    targeted: boolean;
    formatSafe: boolean;
    secondOpinion: boolean;
    versioned: boolean;
  };
  // Auto-suggested default name for the version. Derived from target role +
  // version number upstream. The user can edit before saving.
  suggestedName: string;
  onSaveAsVersion: (name: string) => void;
  onDownloadPdf: () => void;
  onCopyShareLink: () => void;
  // Optional: opens the cover letter modal pre-filled with the finalized
  // resume. Third secondary CTA; hidden if not provided.
  onWriteCoverLetter?: () => void;
  onKeepEditing: () => void;
  isSaving?: boolean;
}

const SIGNAL_LABELS: Record<keyof ResumeCompletionModalProps["signalsHit"], string> = {
  trust: "Trust — you saw every change",
  voice: "Voice — reads like you",
  scoreMoved: "Score moved meaningfully",
  targeted: "Targeted to a role",
  formatSafe: "Format safe (ATS + print)",
  secondOpinion: "Second-opinion ready",
  versioned: "Versioned in Drive",
};

export default function ResumeCompletionModal({
  baseScore,
  finalScore,
  accepted,
  rejected,
  signalsHit,
  suggestedName,
  onSaveAsVersion,
  onDownloadPdf,
  onCopyShareLink,
  onWriteCoverLetter,
  onKeepEditing,
  isSaving,
}: ResumeCompletionModalProps) {
  const [name, setName] = useState(suggestedName);
  const canSave = name.trim().length > 0 && !isSaving;
  const delta = finalScore - baseScore;
  const signalCount = Object.values(signalsHit).filter(Boolean).length;
  const verdict = signalCount >= 7
    ? { label: "Ready to send", color: "#16a34a" }
    : signalCount >= 5
      ? { label: "Good enough to send", color: "#ca8a04" }
      : { label: "Keep going", color: "#dc2626" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      style={{ animation: "fadeIn 180ms ease" }}
      onClick={onKeepEditing}
    >
      <div
        className="w-full max-w-lg bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "fadeIn 220ms ease" }}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-gray-200">
          <button
            onClick={onKeepEditing}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-1">
            Rewrite cycle complete
          </p>
          <h2 className="text-xl font-bold text-gray-900 leading-tight">
            {verdict.label}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {accepted} accepted · {rejected} rejected
          </p>
        </div>

        {/* Score delta */}
        <div className="px-6 py-5 flex items-center justify-center gap-4 border-b border-gray-200">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Before</div>
            <div className="text-2xl font-bold text-gray-500">{baseScore}</div>
          </div>
          <div className="text-gray-600 text-xl">→</div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500">Now</div>
            <div className="text-3xl font-bold" style={{ color: verdict.color }}>
              {finalScore}
            </div>
          </div>
          {delta > 0 && (
            <div
              className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: `${verdict.color}22`, color: verdict.color }}
            >
              +{delta}
            </div>
          )}
        </div>

        {/* Signals */}
        <div className="px-6 py-4 border-b border-gray-200">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">
            Happy-path signals ({signalCount}/7)
          </p>
          <ul className="space-y-1.5">
            {(Object.keys(signalsHit) as (keyof typeof signalsHit)[]).map((key) => {
              const hit = signalsHit[key];
              return (
                <li key={key} className="flex items-center gap-2 text-xs">
                  {hit ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" strokeWidth={2.25} />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-gray-700 flex-shrink-0" />
                  )}
                  <span className={hit ? "text-gray-700" : "text-gray-600"}>
                    {SIGNAL_LABELS[key]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Name this version */}
        <div className="px-6 pt-4 pb-1">
          <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
            Name this version
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault();
                onSaveAsVersion(name.trim());
              }
            }}
            placeholder="e.g. Stripe — Senior DE v1"
            disabled={isSaving}
            className="w-full bg-gray-50 border border-gray-200 focus:border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-[#555] outline-none transition-colors"
          />
          <p className="text-[10px] text-gray-600 mt-1.5">
            This name replaces the Edit tab label and is used as the PDF filename.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex flex-col gap-2">
          <button
            onClick={() => canSave && onSaveAsVersion(name.trim())}
            disabled={!canSave}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isSaving ? "Saving…" : `Save as "${(name.trim() || suggestedName).slice(0, 34)}"`}
          </button>
          <div className={`grid ${onWriteCoverLetter ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
            <button
              onClick={onDownloadPdf}
              className="py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3 h-3" strokeWidth={1.75} /> Download PDF
            </button>
            <button
              onClick={onCopyShareLink}
              className="py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              <Link2 className="w-3 h-3" strokeWidth={1.75} /> Share link
            </button>
            {onWriteCoverLetter && (
              <button
                onClick={onWriteCoverLetter}
                className="py-2 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Mail className="w-3 h-3" strokeWidth={1.75} /> Cover letter
              </button>
            )}
          </div>
          <button
            onClick={onKeepEditing}
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-900 transition-colors"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
