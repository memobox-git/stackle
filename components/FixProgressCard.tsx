"use client";

import { CheckCircle2, Circle, XCircle } from "lucide-react";

interface FixProgressCardProps {
  priorities: string[];
  completed: Set<number>;       // every index the user has handled
  accepted: Set<number>;        // subset that was accepted (the rest = rejected)
  currentIndex?: number | null; // the one currently being worked on (highlight)
  onJumpTo?: (action: string, index: number) => void; // click a pending row to Fix it
}

// A pinned checklist inside the chat that the user sees during Fix All.
// Shows every priority, which are accepted / skipped / pending, and which is
// in-flight right now. Updates live as the user clicks Accept / Reject.
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
      <div className="rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#1f1f1f] flex items-center gap-3">
          <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500">
            {allDone ? "All fixes handled" : "Fixes to do"}
          </span>
          <span className="ml-auto text-[11px] text-gray-500 font-mono">
            {doneCount}/{total}
            {acceptedCount > 0 && <span className="text-emerald-500"> · {acceptedCount} accepted</span>}
            {skippedCount > 0 && <span className="text-rose-500"> · {skippedCount} skipped</span>}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-[#1a1a1a] relative overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: total > 0 ? `${(acceptedCount / total) * 100}%` : "0%" }}
          />
          <div
            className="absolute top-0 h-full bg-rose-500/60 transition-all duration-500"
            style={{
              left: total > 0 ? `${(acceptedCount / total) * 100}%` : "0%",
              width: total > 0 ? `${(skippedCount / total) * 100}%` : "0%",
            }}
          />
        </div>

        {/* List */}
        <ul className="divide-y divide-[#1a1a1a]">
          {priorities.map((raw, i) => {
            const isDone = completed.has(i);
            const wasAccepted = accepted.has(i);
            const isCurrent = currentIndex === i;
            const display = raw.replace(/^(HIGH|MEDIUM|LOW)\s*[—–-]\s*/i, "");
            const pMatch = raw.match(/^(HIGH|MEDIUM|LOW)/i);
            const pLabel = pMatch ? pMatch[1].toUpperCase() : "";
            const pColor =
              pLabel === "HIGH" ? "text-rose-400 bg-rose-950/40 border-rose-900/50" :
              pLabel === "MEDIUM" ? "text-amber-400 bg-amber-950/40 border-amber-900/50" :
              "text-purple-400 bg-purple-950/40 border-purple-900/50";

            return (
              <li
                key={i}
                className={`flex items-start gap-3 px-5 py-2.5 transition-colors ${
                  isCurrent ? "bg-[#1a1735]" : isDone ? "opacity-55" : "hover:bg-[#141414]"
                }`}
              >
                {/* Status icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {isDone && wasAccepted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={2.25} />
                  ) : isDone ? (
                    <XCircle className="w-4 h-4 text-rose-500" strokeWidth={2.25} />
                  ) : isCurrent ? (
                    <span className="relative flex items-center justify-center w-4 h-4">
                      <span className="absolute inline-flex w-full h-full rounded-full bg-purple-500 opacity-60 animate-ping" />
                      <span className="relative inline-flex rounded-full w-2.5 h-2.5 bg-purple-400" />
                    </span>
                  ) : (
                    <Circle className="w-4 h-4 text-gray-700" strokeWidth={1.75} />
                  )}
                </div>

                {/* Priority badge + text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {pLabel && (
                      <span className={`text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded border ${pColor}`}>
                        {pLabel}
                      </span>
                    )}
                    <span
                      className={`text-[12px] leading-5 ${
                        isDone ? "line-through text-gray-500" : isCurrent ? "text-white font-medium" : "text-gray-300"
                      }`}
                    >
                      {display}
                    </span>
                  </div>
                </div>

                {/* Per-row action */}
                <div className="flex-shrink-0 mt-0.5">
                  {isDone ? (
                    <span className={`text-[10px] font-semibold ${wasAccepted ? "text-emerald-500" : "text-gray-500"}`}>
                      {wasAccepted ? "Done" : "Skipped"}
                    </span>
                  ) : isCurrent ? (
                    <span className="text-[10px] font-semibold text-purple-400 tracking-wider uppercase">In progress</span>
                  ) : onJumpTo ? (
                    <button
                      onClick={() => onJumpTo(raw, i)}
                      className="text-[10px] font-semibold text-gray-500 hover:text-white transition-colors border border-[#2a2a2a] hover:border-[#3a3a3a] rounded px-2 py-0.5"
                    >
                      Fix
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        {allDone && (
          <div className="px-5 py-3 border-t border-[#1f1f1f] text-[11px] text-emerald-400 font-medium">
            All done. Resume is ready to save as a new version.
          </div>
        )}
      </div>
    </div>
  );
}
