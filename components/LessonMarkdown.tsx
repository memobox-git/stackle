"use client";

// Quick Check — single multiple-choice question at the end of a lesson.
// Click an option → instantly reveals correct/wrong + the explanation.
// Not graded, not stored — just a "did I get the point?" beat. Real
// progress + spaced-rep retention is Phase 3.

import { useState } from "react";

function QuickCheck({
  question,
  options,
  correct,
  explain,
}: {
  question: string;
  options: { letter: string; text: string }[];
  correct: string;
  explain: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const isCorrect = picked === correct;
  return (
    <div className="my-8 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5">
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-violet-700 mb-2">Quick check</p>
      <p className="text-[16px] font-medium text-gray-900 mb-4 leading-snug">{question}</p>
      <div className="space-y-2">
        {options.map((opt) => {
          const isPicked = picked === opt.letter;
          const isThisCorrect = opt.letter === correct;
          let style = "border-gray-200 bg-white text-gray-800 hover:border-gray-400";
          if (picked) {
            if (isThisCorrect) style = "border-emerald-400 bg-emerald-50 text-emerald-900";
            else if (isPicked) style = "border-rose-300 bg-rose-50 text-rose-900";
            else style = "border-gray-200 bg-white text-gray-500 opacity-70";
          }
          return (
            <button
              key={opt.letter}
              onClick={() => !picked && setPicked(opt.letter)}
              disabled={!!picked}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${style} ${!picked ? "cursor-pointer" : "cursor-default"}`}
            >
              <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-[12px] font-bold flex-shrink-0">{opt.letter}</span>
              <span className="text-[14px] flex-1">{opt.text}</span>
              {picked && isThisCorrect && <span className="text-emerald-700 text-[18px]">✓</span>}
              {picked && isPicked && !isThisCorrect && <span className="text-rose-700 text-[18px]">✗</span>}
            </button>
          );
        })}
      </div>
      {picked && explain && (
        <div className={`mt-4 px-4 py-3 rounded-xl text-[13px] leading-6 ${isCorrect ? "bg-emerald-50 border border-emerald-200 text-emerald-900" : "bg-amber-50 border border-amber-200 text-amber-900"}`}>
          <span className="font-semibold">{isCorrect ? "Nice. " : "Not quite. "}</span>
          {explain}
        </div>
      )}
    </div>
  );
}

// Minimal markdown renderer for Learn lessons.
//
// Why not react-markdown / MDX? Bundle weight + one less moving part.
// We render the subset of markdown we actually use in lessons:
// headings (# ## ###), paragraphs, inline `code`, **bold**, *italic*,
// `\`\`\`` fenced code blocks, bullet lists (- ...) and tables. That's
// it. If a lesson needs more, we revisit.

import React from "react";

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Split on `code` first, then bold, italic, links.
  const codeParts = text.split(/(`[^`]+`)/g);
  codeParts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      out.push(<code key={`c-${i}`} className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[0.875em] font-mono text-gray-900">{part.slice(1, -1)}</code>);
      return;
    }
    // bold + italic + link
    const tokens = part.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
    tokens.forEach((tok, j) => {
      if (!tok) return;
      if (/^\*\*[^*]+\*\*$/.test(tok)) {
        out.push(<strong key={`b-${i}-${j}`} className="font-semibold text-gray-900">{tok.slice(2, -2)}</strong>);
      } else if (/^\*[^*]+\*$/.test(tok)) {
        out.push(<em key={`i-${i}-${j}`} className="italic">{tok.slice(1, -1)}</em>);
      } else {
        const linkMatch = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          out.push(<a key={`l-${i}-${j}`} href={linkMatch[2]} className="text-violet-700 underline underline-offset-2 hover:text-violet-900">{linkMatch[1]}</a>);
        } else {
          out.push(<React.Fragment key={`t-${i}-${j}`}>{tok}</React.Fragment>);
        }
      }
    });
  });
  return out;
}

export default function LessonMarkdown({ source }: { source: string }) {
  const lines = source.replace(/^\n+/, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Callout box. Syntax (GFM-style, matches Obsidian):
    //   > [!KEY] Optional title
    //   > Body line 1
    //   > Body line 2
    // Types: KEY (violet), CONTEXT (blue), WARN (amber), TRY (emerald),
    // INTERVIEW (gray). Body lines drop the leading "> " prefix.
    if (/^>\s*\[!(KEY|CONTEXT|WARN|TRY|INTERVIEW)\]/i.test(line)) {
      const header = line.match(/^>\s*\[!(\w+)\]\s*(.*)$/i)!;
      const kind = header[1].toUpperCase();
      const title = header[2].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        body.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const palette: Record<string, { bg: string; border: string; tag: string; iconColor: string; label: string }> = {
        KEY:       { bg: "bg-violet-50",  border: "border-violet-200",  tag: "text-violet-700",   iconColor: "text-violet-600",  label: "Key insight" },
        CONTEXT:   { bg: "bg-sky-50",     border: "border-sky-200",     tag: "text-sky-700",      iconColor: "text-sky-600",     label: "Context" },
        WARN:      { bg: "bg-amber-50",   border: "border-amber-200",   tag: "text-amber-800",    iconColor: "text-amber-600",   label: "Common mistake" },
        TRY:       { bg: "bg-emerald-50", border: "border-emerald-200", tag: "text-emerald-800",  iconColor: "text-emerald-600", label: "Try this" },
        INTERVIEW: { bg: "bg-gray-100",   border: "border-gray-300",    tag: "text-gray-800",     iconColor: "text-gray-600",    label: "In the interview" },
      };
      const p = palette[kind];
      blocks.push(
        <div key={key++} className={`my-5 rounded-xl border ${p.border} ${p.bg} px-5 py-4`}>
          <p className={`text-[11px] font-semibold tracking-[0.1em] uppercase ${p.tag} mb-1.5`}>{title || p.label}</p>
          {body.map((b, j) => (
            b.trim() === "" ? null : <p key={j} className="text-[14px] text-gray-800 leading-6 mb-1.5 last:mb-0">{inline(b)}</p>
          ))}
        </div>,
      );
      continue;
    }

    // Quiz block. Syntax:
    //   [quiz]
    //   Q: question text
    //   A: option a
    //   B: option b
    //   C: option c
    //   correct: B
    //   explain: short reasoning
    //   [/quiz]
    if (line.trim() === "[quiz]") {
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "[/quiz]") {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing tag
      const q = buf.find((l) => l.startsWith("Q:"))?.slice(2).trim() ?? "";
      const options = buf
        .filter((l) => /^[A-D]:/.test(l))
        .map((l) => ({ letter: l[0], text: l.slice(2).trim() }));
      const correct = (buf.find((l) => l.startsWith("correct:"))?.slice(8).trim() ?? "").toUpperCase();
      const explain = buf.find((l) => l.startsWith("explain:"))?.slice(8).trim() ?? "";
      blocks.push(<QuickCheck key={key++} question={q} options={options} correct={correct} explain={explain} />);
      continue;
    }

    // Fenced code block
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push(
        <pre key={key++} className="bg-gray-900 text-gray-100 rounded-xl px-5 py-4 my-5 overflow-x-auto text-[13px] font-mono leading-6">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      blocks.push(<h3 key={key++} className="text-[18px] font-semibold text-gray-900 mt-8 mb-3">{inline(line.slice(4))}</h3>);
      i++; continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(<h2 key={key++} className="text-[22px] font-bold text-gray-900 mt-10 mb-4">{inline(line.slice(3))}</h2>);
      i++; continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(<h1 key={key++} className="text-[32px] font-bold text-gray-900 mt-2 mb-6 leading-tight">{inline(line.slice(2))}</h1>);
      i++; continue;
    }

    // Table — naive: header row, separator row of dashes, body rows
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s\-:|]+\|\s*$/.test(lines[i + 1])) {
      const header = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      blocks.push(
        <div key={key++} className="my-6 overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                {header.map((h, j) => (
                  <th key={j} className="text-left text-[13px] font-semibold text-gray-700 px-3 py-2">{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-gray-100">
                  {r.map((c, ci) => (
                    <td key={ci} className="text-[14px] text-gray-800 px-3 py-2 align-top">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Bulleted list
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc pl-6 space-y-1.5 my-4 text-[15px] text-gray-800 leading-7">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ul>,
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal pl-6 space-y-1.5 my-4 text-[15px] text-gray-800 leading-7">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ol>,
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") { i++; continue; }

    // Paragraph
    blocks.push(<p key={key++} className="text-[15px] text-gray-800 leading-7 my-4">{inline(line)}</p>);
    i++;
  }

  return <div className="lesson-content">{blocks}</div>;
}
