// Utilities for exporting a saved resume to PDF / peer-review link directly
// from the Drive panel, without routing the user through the Edit tab.
//
// - downloadResumePdf: offscreen-mounts LiveEditableResume for the given
//   extraction, runs html2pdf, cleans up. Used from per-row Download buttons.
// - buildShareLink: encodes an extraction into a /shared-resume#d=... URL.
//   Pure — no DOM, no clipboard. Caller handles copy + toast.

import { createRoot, Root } from "react-dom/client";
import { createElement } from "react";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import LiveEditableResume from "@/components/LiveEditableResume";

function sanitizeFilename(raw: string): string {
  return raw.replace(/[\/\\:*?"<>|]+/g, "").trim().slice(0, 60) || "Resume";
}

export async function downloadResumePdf(
  extraction: ResumeExtraction,
  displayName?: string | null
): Promise<void> {
  // Offscreen container — 816px wide matches the live resume render.
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.top = "-10000px";
  host.style.left = "0";
  host.style.width = "816px";
  host.style.background = "#ffffff";
  document.body.appendChild(host);

  let root: Root | null = null;
  try {
    root = createRoot(host);
    root.render(
      createElement(LiveEditableResume, {
        extraction,
        editingSection: null,
        typewriterContent: "",
        onSectionClick: () => {},
      })
    );
    // Give React two frames to paint the tree before rasterising.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const html2pdf = (await import("html2pdf.js")).default;
    const filename = sanitizeFilename(
      displayName?.trim() ||
      `${extraction.name ?? "Resume"}_Stackle`
    ) + ".pdf";
    await html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(host)
      .save();
  } finally {
    // Defer unmount so React doesn't warn about work-in-progress effects.
    setTimeout(() => {
      try { root?.unmount(); } catch { /* ignore */ }
      host.remove();
    }, 0);
  }
}

export function buildShareLink(extraction: ResumeExtraction): string | null {
  try {
    const json = JSON.stringify(extraction);
    const encoded = btoa(unescape(encodeURIComponent(json)));
    const url = `${window.location.origin}/shared-resume#d=${encoded}`;
    if (url.length > 16000) return null; // too big to fit in URL — caller shows a fallback
    return url;
  } catch {
    return null;
  }
}
