"use client";

import { Check, X } from "lucide-react";

interface FixProgressCardProps {
  priorities: string[];
  completed: Set<number>;       // every index the user has handled
  accepted: Set<number>;        // subset that was accepted (the rest = rejected)
  currentIndex?: number | null; // the one currently being worked on (highlight)
  onJumpTo?: (action: string, index: number) => void; // click a pending row to Fix it
}

// A pinned checklist that lives inside the chat thread during a Fix-All
// run. Plain text — no boxes, no filled badges, no dark backgrounds. Just
// a clean list with a pulsing dot for the in-progress row, a check for
// done, an x for skipped, and an open circle for pending. Reads as part
// of the conversation, not a separate panel.
export default function FixProgressCard({
  priorities,
  completed,
  accepted,
  currentIndex,
  onJumpTo,
}: FixProgressCardProps) {
  const total = priorities.length;
  const doneCount = completed.size;
  const acceptedCount = accepted.size;
  const skippedCount = doneCount - acceptedCount;
  const allDone = doneCount >= total && total > 0;

  return (
    <div data-fix-progress-card className="w-full max-w-3xl mx-auto px-4 mb-4" style={{ animation: "fadeIn 240ms ease" }}>
      {/* Header — single tight line, no box */}
      <div className="flex items-baseline gap-3 mb-3 px-1">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-gray-700">
          {allDone ? "All fixes handled" : "Fixes to do"}
        </span>
        <span className="text-[11px] text-gray-500 font-mono">
          {doneCount}/{total}
          {acceptedCount > 0 && <span className="text-emerald-600"> · {acceptedCount} done</span>}
          {skippedCount > 0 && <span className="text-rose-600"> · {skippedCount} skipped</span>}
        </span>
      </div>

      {/* List — no card, no dividers, just rows of plain text with a
          status glyph on the left. The current row gets a pulsing dot
          and bolder text; nothing else. */}
      <ul className="px-1 space-y-3">
        {priorities.map((raw, i) => {
          const isDone = completed.has(i);
          const wasAccepted = accepted.has(i);
          const isCurrent = currentIndex === i;
          const display = raw.replace(/^(HIGH|MEDIUM|LOW)\s*[—–-]\s*/i, "");
          const pMatch = raw.match(/^(HIGH|MEDIUM|LOW)/i);
          const pLabel = pMatch ? pMatch[1].toLowerCase() : "";

          // Plain-text colours per priority — text-tinted, no fills.
          const pColor =
            pLabel === "high"   ? "text-rose-600" :
            pLabel === "medium" ? "text-amber-600" :
            pLabel === "low"    ? "text-violet-600" :
            "text-gray-500";

          return (
            <li key={i} className="flex items-start gap-3 text-[13px] leading-snug">
              {/* Status glyph — 14px square slot so rows align cleanly */}
              <span className="inline-flex items-center justify-center mt-0.5 w-3.5 h-3.5 flex-shrink-0">
                {isDone && wasAccepted ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.5} />
                ) : isDone ? (
                  <X className="w-3.5 h-3.5 text-gray-400" strokeWidth={2.25} />
                ) : isCurrent ? (
                  // Pulsing dot — purple, animated. This is the "shines /
                  // beeps" indicator the user asked for.
                  <span className="relative inline-flex w-2.5 h-2.5">
                    <span className="absolute inline-flex w-full h-full rounded-full bg-violet-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-violet-600" />
                  </span>
                ) : (
                  <span className="inline-block w-2 h-2 rounded-full border border-gray-300" />
                )}
              </span>

              {/* Priority + text — inline, no badges */}
              <span className="flex-1 min-w-0">
                {pLabel && (
                  <span className={`text-[10px] font-semibold tracking-wider uppercase mr-2 ${pColor}`}>
                    {pLabel}
                  </span>
                )}
                <span
                  className={
                    isDone ? "line-through text-gray-400" :
                    isCurrent ? "text-gray-900 font-medium" :
                    "text-gray-700"
                  }
                >
                  {display}
                </span>
              </span>

              {/* Trailing action — no border, plain link-style */}
              <span className="flex-shrink-0 mt-0.5 text-[11px] font-medium">
                {isDone ? (
                  <span className={wasAccepted ? "text-emerald-600" : "text-gray-400"}>
                    {wasAccepted ? "done" : "skipped"}
                  </span>
                ) : isCurrent ? (
                  <span className="text-violet-600 tracking-wider uppercase text-[10px]">working…</span>
                ) : onJumpTo ? (
                  <button
                    onClick={() => onJumpTo(raw, i)}
                    className="text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    fix
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Closing line on completion — single sentence, no card */}
      {allDone && (
        <p className="px-1 mt-4 text-[12px] text-emerald-600">
          All done. Resume is ready to save as a new version.
        </p>
      )}
    </div>
  );
}
