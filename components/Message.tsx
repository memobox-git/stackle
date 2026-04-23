"use client";

import { MessageSquare } from "lucide-react";

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
  timestamp?: string; // "HH:MM am/pm" — optional, shown on hover
}

interface MessageProps {
  message: ChatMessage;
}

function inlineFormat(text: string): React.ReactNode {
  // Handle bold+italic, bold, italic, inline code
  const parts = text.split(/(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("***") && part.endsWith("***")) {
      return (
        <strong key={i} className="font-semibold italic text-white">
          {part.slice(3, -3)}
        </strong>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={i} className="italic text-gray-300">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="bg-[#161b22] border border-[#30363d] rounded px-1.5 py-0.5 text-sm font-mono text-[#79c0ff]"
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
        <div key={`code-${i}`} className="my-3 rounded-xl overflow-hidden border border-[#30363d]">
          {lang && (
            <div className="bg-[#161b22] border-b border-[#30363d] px-4 py-1.5 text-xs text-gray-500 font-mono">
              {lang}
            </div>
          )}
          <pre className="bg-[#0d1117] px-4 py-3 text-sm font-mono text-gray-200 overflow-x-auto leading-6">
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
        <h1 key={`h1-${i}`} className="text-xl font-bold text-white mt-4 mb-2 leading-snug">
          {inlineFormat(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-lg font-semibold text-white mt-4 mb-1.5 leading-snug">
          {inlineFormat(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-base font-semibold text-white mt-3 mb-1 leading-snug">
          {inlineFormat(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Blockquote — render as subtle callout
    if (line.startsWith("> ")) {
      elements.push(
        <div key={`bq-${i}`} className="border-l-2 border-[#3a3a3a] pl-3 my-2 text-gray-500 italic text-base leading-7">
          {inlineFormat(line.slice(2))}
        </div>
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      elements.push(<hr key={`hr-${i}`} className="border-[#2a2a2a] my-4" />);
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
            <li key={idx} className="flex gap-2.5 text-base leading-7 text-gray-300">
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
            <li key={idx} className="flex gap-3 text-base leading-7 text-gray-300">
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
        <p key={`p-${i}`} className="text-base leading-7 text-gray-400 italic">
          {inlineFormat(line)}
        </p>
      );
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="text-base leading-7 text-gray-300">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return elements;
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === "user";
  const ts = message.timestamp;

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
          <span className="text-xs text-gray-500 font-medium">You</span>
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-black text-[11px] font-bold">U</div>
        </div>
        {/* Bubble */}
        <div className="max-w-[78%] bg-[#1e1e1e] border border-[#2a2a2a] text-gray-100 rounded-2xl rounded-tr-md px-5 py-3.5 text-base leading-7">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
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
