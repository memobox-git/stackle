"use client";

// Generic artifact card — Fix 2 (Claude-style inline cards).
//
// Renders inline in chat for every significant generator output:
// resume review, tailored resume, cover letter, match report, study
// plan, interview prep notes. Click → onOpen fires; chat host (page.tsx)
// decides which preview surface to swap to.
//
// The host is responsible for the right-pane preview UI; this card
// only renders the inline summary. Cards stay in chat forever — they
// ARE the timeline of milestones.

import type { Artifact } from "@/lib/artifacts";
import { artifactIcon, artifactTypeLabel, relativeTime } from "@/lib/artifacts";

interface ArtifactCardProps {
  artifact: Artifact;
  // Click handler. The host decides what "open" means per kind — for
  // resume_review it opens the Report tab; for cover_letter it streams
  // the preview into the right pane.
  onOpen?: (artifact: Artifact) => void;
  // Active state — flips the button to "Viewing" when the preview is
  // already open. The host tracks which artifact (if any) is open.
  isOpen?: boolean;
  // Optional secondary action — Download. Present for kinds that have a
  // rendered file in Drive. Card hides it when undefined.
  onDownload?: (artifact: Artifact) => void;
}

export default function ArtifactCard({ artifact, onOpen, isOpen, onDownload }: ArtifactCardProps) {
  const icon = artifactIcon(artifact.kind);
  const typeLabel = artifactTypeLabel(artifact.kind);
  const score = artifact.score;
  const scoreColor =
    typeof score === "number"
      ? score >= 75 ? "#1D9E75"
      : score >= 60 ? "#BA7517"
      : score >= 45 ? "#d97706"
      : "#A32D2D"
      : null;

  // BUG 5 fix — the prior structure nested a span+onClick "Download"
  // inside a wrapping <button>, which is invalid HTML and was sometimes
  // swallowing the open click on Safari. Now: the card body is a div
  // with role=button + onClick + keyboard support, and the action
  // buttons are real <button> elements that stopPropagation.
  const pending = !!artifact.pending;
  function handleCardClick() { if (!pending) onOpen?.(artifact); }
  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-3">
      <div
        role={pending ? undefined : "button"}
        tabIndex={pending ? -1 : 0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (pending) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className={`w-full text-left rounded-xl border bg-white transition-colors overflow-hidden focus:outline-none ${
          pending
            ? "border-gray-200 cursor-default"
            : "border-gray-200 hover:border-gray-400 cursor-pointer focus:border-gray-900"
        }`}
      >
        {/* Header bar — type label + relative time */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <span className="text-sm">{icon}</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600">{typeLabel}</span>
          <span className="text-[11px] text-gray-400 ml-auto">{relativeTime(artifact.generatedAt)}</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 flex gap-4 items-center">
          {pending ? (
            <div className="flex-shrink-0 w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center">
              <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
            </div>
          ) : scoreColor !== null && (
            <div
              className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border-2"
              style={{ borderColor: scoreColor, background: `${scoreColor}14` }}
            >
              <span className="text-sm font-bold" style={{ color: scoreColor }}>{score}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-gray-900 truncate">{artifact.title}</p>
            {artifact.subtitle && (
              <p className="text-[12px] text-gray-500 mt-0.5 truncate">{artifact.subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onDownload && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDownload(artifact); }}
                className="text-[12px] font-medium text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Download
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={(e) => { e.stopPropagation(); handleCardClick(); }}
              className="text-[12px] font-semibold rounded-lg px-3 py-1.5 transition-colors inline-flex items-center gap-1 disabled:cursor-default"
              style={{
                background: pending ? "#f3f4f6" : isOpen ? "#f3f4f6" : "#000",
                color: pending ? "#9ca3af" : isOpen ? "#000" : "#fff",
              }}
            >
              {pending ? "Generating…" : isOpen ? "Viewing" : "Open ↗"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
