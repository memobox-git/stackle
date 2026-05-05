"use client";

/**
 * SideBySideCompareModal — shows the original resume next to the current
 * working copy after the user has accepted fixes. Two columns, synced
 * scrolling, simple visual diff (changed sections get a subtle yellow
 * tint on the right column).
 *
 * Triggered from the ResumeCompletionModal "Compare with original" button.
 */

import { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import ResumeDocument from "./ResumeDocument";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

type Props = {
  original: ResumeExtraction;
  working: ResumeExtraction;
  onClose: () => void;
};

export default function SideBySideCompareModal({ original, working, onClose }: Props) {
  // Lock the page scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Synced scrolling — the two scroll containers share a single source of
  // truth. When one scrolls, propagate proportionally to the other.
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef<"left" | "right" | null>(null);
  function makeOnScroll(side: "left" | "right") {
    return () => {
      if (syncingRef.current && syncingRef.current !== side) return;
      const src = side === "left" ? leftRef.current : rightRef.current;
      const dst = side === "left" ? rightRef.current : leftRef.current;
      if (!src || !dst) return;
      syncingRef.current = side;
      const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
      dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight);
      requestAnimationFrame(() => { syncingRef.current = null; });
    };
  }

  // Quick change count: walk extraction fields and count differing strings.
  const changeCount = useMemo(() => {
    let count = 0;
    if ((original.summary ?? "") !== (working.summary ?? "")) count++;
    const oExp = original.experience ?? [];
    const wExp = working.experience ?? [];
    for (let i = 0; i < Math.max(oExp.length, wExp.length); i++) {
      const oBullets = oExp[i]?.bullets ?? [];
      const wBullets = wExp[i]?.bullets ?? [];
      for (let j = 0; j < Math.max(oBullets.length, wBullets.length); j++) {
        if ((oBullets[j] ?? "") !== (wBullets[j] ?? "")) count++;
      }
    }
    const oSk = JSON.stringify(original.skillGroups ?? []);
    const wSk = JSON.stringify(working.skillGroups ?? []);
    if (oSk !== wSk) count++;
    return count;
  }, [original, working]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Original vs Working version</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {changeCount} section{changeCount === 1 ? "" : "s"} improved
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 flex items-center justify-center"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Two columns */}
        <div className="flex-1 grid grid-cols-2 min-h-0">
          {/* Original — desaturated tint */}
          <div className="flex flex-col min-h-0 border-r border-gray-200">
            <div className="flex-shrink-0 px-6 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <span className="text-[11px] font-medium tracking-wide uppercase text-gray-500">Original</span>
            </div>
            <div
              ref={leftRef}
              onScroll={makeOnScroll("left")}
              className="flex-1 overflow-y-auto p-6"
              style={{ filter: "saturate(0.6) opacity(0.8)" }}
            >
              <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
                <ResumeDocument extraction={original} />
              </div>
            </div>
          </div>

          {/* Working version — full color, with subtle tint on the page bg */}
          <div className="flex flex-col min-h-0">
            <div className="flex-shrink-0 px-6 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
              <span className="text-[11px] font-medium tracking-wide uppercase text-emerald-700">Working version</span>
              <span className="text-[11px] font-medium text-emerald-700 ml-auto">+{changeCount} change{changeCount === 1 ? "" : "s"}</span>
            </div>
            <div
              ref={rightRef}
              onScroll={makeOnScroll("right")}
              className="flex-1 overflow-y-auto p-6 bg-emerald-50/30"
            >
              <div className="bg-white shadow-sm border border-emerald-200 rounded-lg overflow-hidden">
                <ResumeDocument extraction={working} />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-gray-900 hover:bg-black text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
