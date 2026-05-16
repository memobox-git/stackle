"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X, Copy, ThumbsUp, ThumbsDown, RotateCcw } from "lucide-react";
import { useTypewriter } from "@/lib/useTypewriter";

// Module-level "already typed" registry. Keyed by the message's content
// hash so re-renders / chat-list rebuilds don't re-trigger the
// animation for already-revealed messages. Cleared only on page reload.
const TYPED_REGISTRY = new Set<string>();
function messageKey(role: string, content: string, ts?: string): string {
  // Content is enough on its own for uniqueness in practice; role + ts
  // disambiguate the rare case where the assistant echoes a user line.
  return `${role}::${ts ?? ""}::${content.length}::${content.slice(0, 80)}`;
}

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp?: string; // "HH:MM am/pm" — optional, shown on hover
  // Set transiently by ChatWindow when this message just arrived in
  // the current session. Drives the typewriter reveal. Never persisted.
  __isFresh?: boolean;
  // Fix 2 — when this message represents an artifact (resume review,
  // tailored resume, cover letter, etc), the card is rendered inline
  // instead of the usual prose bubble. `content` may be empty or a one-
  // line summary the user reads alongside the card.
  artifact?: import("@/lib/artifacts").Artifact;
}

interface MessageProps {
  message: ChatMessage;
  // When provided on a user message, a pencil appears on hover. Clicking it
  // opens inline-edit; on save the parent is expected to replace this
  // message's content AND drop all subsequent messages (stale replies), then
  // re-run the agent against the edited content.
  onEdit?: (newContent: string) => void;
  // Stable index in the chat thread — used by assistant hover actions to
  // wire Retry (re-send the previous user prompt) and Edit-previous
  // (open inline edit on the preceding user bubble).
  messageIndex?: number;
  // Assistant-only callbacks for the hover action row. Copy + Like/Dislike
  // are handled locally; Retry + EditPrevious need parent state.
  onRetry?: () => void;
  onEditPrevious?: () => void;
  // External streaming signal from the parent. True ONLY while the SSE
  // stream is actively producing this message. Used to decide plain-text
  // vs markdown render — driven by a stable external flag, not by the
  // typewriter's per-chunk `done` toggling. That toggling was the
  // flicker source.
  isStreamingMessage?: boolean;
}

// Local registry of Like/Dislike per message content. Lives in
// localStorage so the signal survives reloads. We key by content rather
// than index because indices shift when chats are switched.
function loadFeedback(key: string): "like" | "dislike" | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(`stackle_msg_feedback::${key}`);
  return v === "like" || v === "dislike" ? v : null;
}
function saveFeedback(key: string, val: "like" | "dislike" | null) {
  if (typeof window === "undefined") return;
  const k = `stackle_msg_feedback::${key}`;
  if (val === null) localStorage.removeItem(k);
  else localStorage.setItem(k, val);
}

function inlineFormat(text: string): React.ReactNode {
  // Handle bold+italic, bold, italic, inline code
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("***") && part.endsWith("***")) {
      return (
        <strong key={i} className="font-semibold italic text-gray-900">
          {part.slice(3, -3)}
        </strong>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={i} className="italic text-gray-700">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-gray-50 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-[#79c0ff]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function renderContent(content: string) {
  // Defensive scrub: the orchestrator's narration occasionally leaks a
  // literal "__INLINE_CHIPS__:..." line inside the prose instead of
  // emitting it as its own sentinel message. Strip those lines so they
  // never reach the reader as raw text.
  const lines = content
    .split("\n")
    .filter((l) => !l.trim().startsWith("__INLINE_CHIPS__:") && !l.trim().startsWith("__ANALYSIS_PROGRESS__") && !l.trim().startsWith("__FIX_PROGRESS_CARD__"));
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={`code-${i}`} className="my-3 rounded-xl overflow-hidden border border-gray-300">
          {lang && (
            <div className="bg-gray-50 border-b border-gray-300 px-4 py-1.5 text-xs text-gray-500 font-mono">
              {lang}
            </div>
          )}
          <pre className="bg-gray-100 border border-gray-200 px-4 py-3 text-sm font-mono text-gray-900 overflow-x-auto leading-6">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // H1
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-[20px] font-semibold text-gray-900 mt-5 mb-2 leading-snug tracking-tight">
          {inlineFormat(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-[17px] font-semibold text-gray-900 mt-5 mb-2 leading-snug tracking-tight">
          {inlineFormat(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-[15px] font-semibold text-gray-900 mt-4 mb-1.5 leading-snug">
          {inlineFormat(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Blockquote — render as subtle callout
    if (line.startsWith("> ")) {
      elements.push(
        <div key={`bq-${i}`} className="border-l-2 border-gray-300 pl-3 my-2 text-gray-500 italic text-[15px] leading-6">
          {inlineFormat(line.slice(2))}
        </div>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      elements.push(<hr key={`hr-${i}`} className="border-gray-200 my-4" />);
      i++;
      continue;
    }

    // Bullet list — collect contiguous bullet items, allowing blank lines
    // between them. Strips a SINGLE leading "-", "*", or "•" plus any extra
    // bullet glyphs the model accidentally produced (e.g. "* • Item" or
    // "• * Item"), so the rendered "•" is the only bullet visible.
    const bulletRe = /^\s*[-*•]\s+/;
    if (bulletRe.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        if (bulletRe.test(lines[i])) {
          // Strip leading bullet, then strip any further leading bullet/asterisk
          // glyphs the model may have stacked (defensive against "- * Item").
          const cleaned = lines[i]
            .replace(bulletRe, "")
            .replace(/^[-*•]\s+/, "")
            .trim();
          items.push(cleaned);
          i++;
        } else if (lines[i].trim() === "" && i + 1 < lines.length && bulletRe.test(lines[i + 1])) {
          // Blank line between bullet items — stay in the list.
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1.5 my-2.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-[15px] leading-[1.65] text-gray-900">
              <span className="text-gray-400 flex-shrink-0 select-none">•</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list — same blank-line-tolerant collection as bullets. Uses
    // the ACTUAL number captured from the source (1., 2., 3.) instead of an
    // index, so a list split by blank lines still renders 1, 2, 3 — not
    // 1, 1, 1 (the previous bug).
    const orderedRe = /^\s*(\d+)\.\s+(.*)$/;
    const orderedMatch = line.match(orderedRe);
    if (orderedMatch) {
      const items: { num: string; content: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(orderedRe);
        if (m) {
          items.push({ num: m[1], content: m[2] });
          i++;
        } else if (lines[i].trim() === "" && i + 1 < lines.length && orderedRe.test(lines[i + 1])) {
          i++;
        } else {
          break;
        }
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1.5 my-2.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5 text-[15px] leading-[1.65] text-gray-900">
              <span className="text-gray-500 flex-shrink-0 tabular-nums">{item.num}.</span>
              <span>{inlineFormat(item.content)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line → small spacer. With proper mb-3 on paragraphs the
    // visual rhythm already exists; the spacer is just a tie-breaker
    // for two consecutive blank lines.
    if (line.trim() === "") {
      elements.push(<div key={`sp-${i}`} className="h-1" />);
      i++;
      continue;
    }

    // Emoji-prefixed chip-style line that wasn't parsed as a chip — render as styled hint
    if (/^[\p{Emoji}]\s/u.test(line.trim())) {
      elements.push(
        <p key={`p-${i}`} className="text-[15px] leading-[1.65] text-gray-500 italic mb-3 last:mb-0">
          {inlineFormat(line)}
        </p>
      );
      i++;
      continue;
    }

    // Regular paragraph. Body type matches Claude/ChatGPT rhythm:
    // 15px × 1.65 line-height × 12px bottom-margin. Darker text color
    // (gray-900) than before — Stackle was reading lighter than the
    // reference apps. `last:mb-0` keeps the chip row tight.
    elements.push(
      <p key={`p-${i}`} className="text-[15px] leading-[1.65] text-gray-900 mb-3 last:mb-0">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

export default function Message({ message, onEdit, onRetry, onEditPrevious, messageIndex, isStreamingMessage }: MessageProps) {
  const isUser = message.role === "user";
  const ts = message.timestamp;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      // Auto-grow once on open
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
      }
    }
  }, [editing]);

  // Listen for "Edit previous" requests dispatched by an assistant
  // hover-action button. We open edit mode when the event index matches
  // this user message's index — no parent-state refactor needed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isUser || !onEdit || typeof messageIndex !== "number") return;
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ index: number }>).detail;
      if (detail?.index === messageIndex) {
        setDraft(message.content);
        setEditing(true);
      }
    }
    window.addEventListener("stackle:edit-message", handler);
    return () => window.removeEventListener("stackle:edit-message", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUser, messageIndex, message.content]);

  function startEdit() {
    setDraft(message.content);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setDraft(message.content);
  }
  function commitEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content.trim()) {
      setEditing(false);
      return;
    }
    onEdit?.(trimmed);
    setEditing(false);
  }

  if (isUser) {
    return (
      <div className="group flex flex-col items-end mb-2 w-full max-w-3xl mx-auto px-4">
        {/* Hover-only meta row — timestamp + edit. Removed the redundant
            "You" label + "U" avatar circle; the right-aligned bubble shape
            already signals user authorship. */}
        {(ts || onEdit) && !editing && (
          <div className="flex items-center gap-1 mb-1 h-4">
            {ts && (
              <span className="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {ts}
              </span>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={startEdit}
                title="Edit message"
                aria-label="Edit message"
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-900 w-5 h-5 rounded-md flex items-center justify-center hover:bg-gray-100"
              >
                <Pencil className="w-3 h-3" strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}
        {/* Bubble */}
        {editing ? (
          <div className="max-w-[78%] w-full bg-white border border-gray-300 text-gray-900 rounded-2xl rounded-tr-lg px-4 py-3 text-[15px] leading-6"
               style={{ boxShadow: "0 0 0 2px rgba(169, 154, 249, 0.25)" }}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitEdit(); }
                else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
              }}
              className="w-full bg-transparent outline-none resize-none text-gray-900 leading-7"
              rows={1}
            />
            <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-200">
              <span className="text-[10px] text-gray-600 mr-auto">⌘↩ to save · Esc to cancel</span>
              <button
                type="button"
                onClick={cancelEdit}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2.5 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
              >
                <X className="w-3 h-3" strokeWidth={2} /> Cancel
              </button>
              <button
                type="button"
                onClick={commitEdit}
                disabled={!draft.trim() || draft.trim() === message.content.trim()}
                className="flex items-center gap-1 text-xs font-semibold text-black bg-white hover:bg-gray-100 disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
              >
                <Check className="w-3 h-3" strokeWidth={2.25} /> Save & resend
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-[78%] bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-tr-lg px-5 py-3.5 text-[15px] leading-6">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}
      </div>
    );
  }

  // Assistant body. Only NEWLY-arrived messages animate. The
  // `isFresh` flag is computed by the parent (ChatWindow) — it knows
  // which message just appeared. Sentinels never animate.
  const isSentinel = message.content.startsWith("__");
  return (
    <AssistantBody
      message={message}
      ts={ts}
      isSentinel={isSentinel}
      isFresh={!!message.__isFresh}
      isStreamingMessage={!!isStreamingMessage}
      onRetry={onRetry}
      onEditPrevious={onEditPrevious}
    />
  );
}

function AssistantBody({
  message, ts, isSentinel, isFresh, isStreamingMessage, onRetry, onEditPrevious,
}: {
  message: ChatMessage;
  ts?: string;
  isSentinel: boolean;
  isFresh: boolean;
  isStreamingMessage: boolean;
  onRetry?: () => void;
  onEditPrevious?: () => void;
}) {
  const key = messageKey(message.role, message.content, ts);
  // Animate only when the parent flagged this as a freshly-arrived
  // message AND we haven't already typed it AND we're NOT currently
  // streaming from the parent. While streaming, we don't run the
  // typewriter — the SSE chunks themselves provide the typing cadence,
  // and layering a typewriter on top caused the chunked done→!done→done
  // toggling that produced the flicker. After streaming ends, the
  // message renders as final markdown directly. No typewriter on the
  // post-stream path either — the message is fully there, instantly.
  const alreadyTyped = TYPED_REGISTRY.has(key);
  const shouldAnimate = isFresh && !alreadyTyped && !isSentinel && !isStreamingMessage && message.content.length < 200;
  const { displayed, done } = useTypewriter(shouldAnimate ? message.content : "", 14);
  useEffect(() => {
    if (done && shouldAnimate) TYPED_REGISTRY.add(key);
  }, [done, shouldAnimate, key]);

  const visible = shouldAnimate ? displayed : message.content;

  // Feedback state — Like/Dislike toggles. Sentinels + streaming messages
  // get no action row (they're not "real" assistant answers to react to).
  const feedbackKey = messageKey(message.role, message.content, ts);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setFeedback(loadFeedback(feedbackKey));
  }, [feedbackKey]);

  function handleCopy() {
    if (typeof navigator === "undefined") return;
    navigator.clipboard?.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }
  function toggleFeedback(val: "like" | "dislike") {
    const next = feedback === val ? null : val;
    setFeedback(next);
    saveFeedback(feedbackKey, next);
  }

  const showActions = !isSentinel && !isStreamingMessage && message.content.trim().length > 0;

  // Plain text DURING streaming (parent SSE flag stable). Markdown
  // AFTER streaming completes. The swap happens ONCE per message at
  // stream-end — driven by isStreamingMessage from the parent, not by
  // the typewriter's per-chunk done toggling. That toggling caused the
  // chunked plain↔markdown DOM swap that produced the flicker.
  //
  // Short typewriter for already-finalized fresh messages (e.g. assistant
  // greeting that lands non-streamed). Capped at <200 chars so it stays
  // a quick reveal, not a slow drag through a long answer.
  return (
    <div className="group flex mb-2 w-full max-w-3xl mx-auto px-4">
      <div className="flex-1 min-w-0">
        {isStreamingMessage ? (
          <p className="text-[15px] leading-[1.65] text-gray-900 whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          renderContent(visible)
        )}
        {showActions && (
          <div className="flex items-center gap-0.5 mt-1 -ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ActionBtn
              icon={<Copy className="w-3.5 h-3.5" strokeWidth={1.75} />}
              label={copied ? "Copied" : "Copy"}
              active={copied}
              onClick={handleCopy}
            />
            <ActionBtn
              icon={<ThumbsUp className="w-3.5 h-3.5" strokeWidth={1.75} />}
              label="Like"
              active={feedback === "like"}
              onClick={() => toggleFeedback("like")}
            />
            <ActionBtn
              icon={<ThumbsDown className="w-3.5 h-3.5" strokeWidth={1.75} />}
              label="Dislike"
              active={feedback === "dislike"}
              onClick={() => toggleFeedback("dislike")}
            />
            {onRetry && (
              <ActionBtn
                icon={<RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />}
                label="Retry"
                onClick={onRetry}
              />
            )}
            {onEditPrevious && (
              <ActionBtn
                icon={<Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />}
                label="Edit previous"
                onClick={onEditPrevious}
              />
            )}
          </div>
        )}
        {ts && (
          <span className="text-[10px] text-gray-600 mt-1 block opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {ts}
          </span>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
        active
          ? "text-gray-900 bg-gray-100"
          : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      {icon}
    </button>
  );
}
