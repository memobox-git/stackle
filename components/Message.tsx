"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Pencil, Check, X } from "lucide-react";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp?: string; // "HH:MM am/pm" — optional, shown on hover
}

interface MessageProps {
  message: ChatMessage;
  // When provided on a user message, a pencil appears on hover. Clicking it
  // opens inline-edit; on save the parent is expected to replace this
  // message's content AND drop all subsequent messages (stale replies), then
  // re-run the agent against the edited content.
  onEdit?: (newContent: string) => void;
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
  const lines = content.split("\n");
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
        <h1 key={`h1-${i}`} className="text-xl font-bold text-gray-900 mt-4 mb-2 leading-snug">
          {inlineFormat(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg font-semibold text-gray-900 mt-4 mb-1.5 leading-snug">
          {inlineFormat(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-semibold text-gray-900 mt-3 mb-1 leading-snug">
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

    // Bullet list
    if (line.match(/^[-*•]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s/)) {
        items.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-2 my-3">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5 text-[15px] leading-6 text-gray-700">
              <span className="text-gray-600 flex-shrink-0 mt-1">•</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-2 my-3">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-3 text-[15px] leading-6 text-gray-700">
              <span className="text-gray-600 flex-shrink-0 font-medium tabular-nums">{idx + 1}.</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line → spacer
    if (line.trim() === "") {
      elements.push(<div key={`sp-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // Emoji-prefixed chip-style line that wasn't parsed as a chip — render as styled hint
    if (/^[\p{Emoji}]\s/u.test(line.trim())) {
      elements.push(
        <p key={`p-${i}`} className="text-[15px] leading-6 text-gray-500 italic">
          {inlineFormat(line)}
        </p>
      );
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-[15px] leading-6 text-gray-700">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

export default function Message({ message, onEdit }: MessageProps) {
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
      <div className="group flex flex-col items-end mb-8 w-full max-w-3xl mx-auto px-4">
        {/* Name + avatar row */}
        <div className="flex items-center gap-2 mb-2">
          {ts && (
            <span className="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mr-1">
              {ts}
            </span>
          )}
          {onEdit && !editing && (
            <button
              type="button"
              onClick={startEdit}
              title="Edit message"
              aria-label="Edit message"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-900 w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100 mr-0.5"
            >
              <Pencil className="w-3 h-3" strokeWidth={1.75} />
            </button>
          )}
          <span className="text-xs text-gray-500 font-medium">You</span>
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-black text-[11px] font-bold">U</div>
        </div>
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

  return (
    <div className="group flex gap-3 mb-8 w-full max-w-3xl mx-auto px-4">
      <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0 mt-0.5">
        <MessageSquare className="w-3.5 h-3.5 text-black" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        {renderContent(message.content)}
        {ts && (
          <span className="text-[10px] text-gray-600 mt-1 block opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {ts}
          </span>
        )}
      </div>
    </div>
  );
}
