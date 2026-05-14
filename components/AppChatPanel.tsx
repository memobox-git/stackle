"use client";

// AppChatPanel — the persistent chat thread that floats on the left
// of every workspace view (Interview, Foundations, Drive). Same
// chatMessages state from app/page.tsx; renders ChatWindow + ChatInput.
//
// Visibility is controlled by parent (`isOpen`). When closed the
// parent renders a small "Open chat" pill that flips it back on.
// Width is shared with Resume Builder's resizable divider via the
// same localStorage key (stackle_chat_panel_pct).

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import type { ChatMessage } from "@/components/Message";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";

interface AppChatPanelProps {
  isOpen: boolean;
  onClose: () => void;

  messages: ChatMessage[];
  isLoading: boolean;
  chatInput: string;
  onChatInputChange: (v: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onChatEditPrompt: (prompt: string) => void;
  onEditUserMessage: (i: number, newContent: string) => void;
  onFileUpload: (text: string, filename: string) => void;
  resumeText: string | null;
  resumeExtraction: ResumeExtraction | null;
  // Optional: when the parent allows resize (Resume Builder does), it
  // passes a width; otherwise the panel uses its default 25%.
  widthPct?: number;
  onWidthChange?: (pct: number) => void;
}

export default function AppChatPanel({
  isOpen,
  onClose,
  messages,
  isLoading,
  chatInput,
  onChatInputChange,
  onSend,
  onStop,
  onChatEditPrompt,
  onEditUserMessage,
  onFileUpload,
  resumeText,
  resumeExtraction,
  widthPct,
  onWidthChange,
}: AppChatPanelProps) {
  // Local width fallback when parent doesn't control it.
  const [localPct, setLocalPct] = useState<number>(25);
  useEffect(() => {
    if (widthPct !== undefined) return;
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("stackle_chat_panel_pct");
    const n = saved ? Number(saved) : NaN;
    if (Number.isFinite(n) && n >= 18 && n <= 55) setLocalPct(n);
  }, [widthPct]);

  const effectivePct = widthPct ?? localPct;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !containerRef.current?.parentElement) return;
      const rect = containerRef.current.parentElement.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(18, Math.min(55, pct));
      if (onWidthChange) onWidthChange(clamped);
      else setLocalPct(clamped);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        const pct = widthPct ?? localPct;
        localStorage.setItem("stackle_chat_panel_pct", String(pct));
      } catch { /* ignore */ }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [widthPct, localPct, onWidthChange]);

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={containerRef}
        className="flex flex-col min-h-0 bg-[#fafaf7] border-r border-gray-200"
        style={{ width: `${effectivePct}%`, flexShrink: 0, transition: draggingRef.current ? "none" : "width 200ms ease" }}
      >
        {/* Close button — small, top-right of the panel */}
        <div className="flex items-center justify-end px-3 py-2 flex-shrink-0">
          <button
            onClick={onClose}
            title="Close chat"
            aria-label="Close chat"
            className="w-7 h-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          resumeAnalysis={null}
          marketAnalysis={null}
          resumePreview={null}
          resumeExtraction={resumeExtraction}
          interviewPrepPlan={null}
          onSend={onSend}
          resumeText={resumeText}
          onChatEditPrompt={onChatEditPrompt}
          onEditUserMessage={onEditUserMessage}
        />
        <div className="flex-shrink-0 px-3 pb-3 pt-2">
          <ChatInput
            value={chatInput}
            onChange={onChatInputChange}
            onSend={() => onSend(chatInput)}
            onFileUpload={onFileUpload}
            disabled={isLoading}
            busy={isLoading}
            onStop={onStop}
            placeholder={resumeExtraction ? "Ask anything about your resume..." : "Ask anything…"}
          />
        </div>
      </div>

      {/* Drag handle — thin 1px line, hover reveals grip pill */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        onDoubleClick={() => {
          if (onWidthChange) onWidthChange(25);
          else setLocalPct(25);
        }}
        className="hidden md:block flex-shrink-0 w-px cursor-col-resize relative group bg-gray-200"
        title="Drag to resize · double-click to reset"
      >
        <span className="absolute inset-y-0 -left-1 -right-1" />
        <span
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-8 rounded-full bg-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          aria-hidden
        />
      </div>
    </>
  );
}
