"use client";

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
