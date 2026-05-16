// Client-side download helpers for text-based artifacts (cover
// letters, study plans, etc.).
//
// PDF:  uses the browser's print → "Save as PDF" via a hidden iframe.
//       No extra dependency, deterministic styling.
// DOCX: uses the already-installed `docx` package. One Document per
//       call, served as a Blob the browser downloads.
//
// For resumes specifically the existing downloadResumePdf() in
// lib/resumeExport.ts is used — it has the full styled render.
// This file is for the simpler text-body artifacts.

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

function sanitizeFilename(raw: string): string {
  return raw.replace(/[\/\\:*?"<>|]+/g, "").trim().slice(0, 80) || "Artifact";
}

// ── DOCX ──────────────────────────────────────────────────────────

interface DocxSection {
  heading?: string;
  paragraphs: string[]; // plain text paragraphs
}

export async function downloadAsDocx(opts: {
  filename: string;
  title: string;
  sections: DocxSection[];
}): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: opts.title, bold: true, size: 32 })],
    }),
    new Paragraph({}),
  ];

  for (const sec of opts.sections) {
    if (sec.heading) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: sec.heading, bold: true, size: 26 })],
      }));
    }
    for (const para of sec.paragraphs) {
      // Each paragraph is one block. Preserve line breaks within a
      // paragraph by splitting on \n and using TextRun breaks.
      const lines = para.split("\n");
      const runs: TextRun[] = [];
      lines.forEach((line, i) => {
        runs.push(new TextRun({ text: line, size: 22 }));
        if (i < lines.length - 1) runs.push(new TextRun({ text: "", break: 1 }));
      });
      children.push(new Paragraph({ children: runs }));
    }
    children.push(new Paragraph({})); // blank line between sections
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  triggerBrowserDownload(blob, `${sanitizeFilename(opts.filename)}.docx`);
}

// ── PDF ───────────────────────────────────────────────────────────
//
// Strategy: build an HTML document in a hidden iframe, call print()
// inside it. User picks "Save as PDF" in the print dialog. Slightly
// less smooth than direct-to-file but zero extra dependencies and
// honors print styles. Use this for text-body artifacts.

export async function downloadAsPdf(opts: {
  filename: string;
  title: string;
  sections: DocxSection[];
}): Promise<void> {
  const html = renderPrintableHtml(opts);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    } else {
      resolve();
    }
  });

  // Slight delay so the layout settles before print is invoked.
  await new Promise((r) => setTimeout(r, 100));
  try {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } catch (err) {
    console.warn("[artifactExport] print() failed:", err);
  }
  // Cleanup after the print dialog likely closed.
  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch { /* ignore */ }
  }, 60_000);
}

function renderPrintableHtml(opts: { title: string; filename: string; sections: DocxSection[] }): string {
  const body = opts.sections.map((sec) => {
    const heading = sec.heading
      ? `<h2 style="font-size:18px;margin:24px 0 10px 0;font-weight:600;">${escapeHtml(sec.heading)}</h2>`
      : "";
    const paras = sec.paragraphs
      .map((p) => `<p style="margin:0 0 12px 0;line-height:1.55;white-space:pre-wrap;">${escapeHtml(p)}</p>`)
      .join("\n");
    return `${heading}${paras}`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.filename)}</title>
  <style>
    @page { size: Letter; margin: 0.75in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 14px; }
    h1 { font-size: 24px; margin: 0 0 6px 0; font-weight: 700; }
    @media print { body { -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(opts.title)}</h1>
  ${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Common: trigger browser download from a Blob ─────────────────

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Convenience for cover letter ──────────────────────────────────

export async function downloadCoverLetter(opts: {
  letter: string;
  company: string | null;
  format: "pdf" | "docx";
}): Promise<void> {
  const company = opts.company?.trim();
  const filename = company ? `Cover Letter — ${company}` : "Cover Letter";
  const paragraphs = opts.letter
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const payload = {
    filename,
    title: filename,
    sections: [{ paragraphs }],
  };
  if (opts.format === "docx") return downloadAsDocx(payload);
  return downloadAsPdf(payload);
}
