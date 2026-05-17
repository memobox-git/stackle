"use client";

// Right-side preview pane for artifact cards.
//
// When the user clicks an artifact card, this pane slides in from the
// right. Shows the rendered artifact content + actions (Copy, Edit,
// Download). Closes via X or by clicking another card.
//
// One pane per chat. Multiple artifacts can be created — clicking a
// different card swaps the content.
//
// Per artifact kind:
//   cover_letter      → formatted text + Copy / Edit / Download
//   resume_review     → score panel + strengths/weaknesses (V2 — for
//                       now defers to the existing Report tab)
//   tailored_resume   → resume render (V2 — defers to Resume Builder)
//   study_plan        → ordered skill list (V2)
//   match_report      → verdict + gaps (V2)
//   quick_questions   → question list (V2)
//   skill_assessment  → question list (V2)
//
// V1 ships with cover_letter properly rendered + a generic "Tap to
// open in a dedicated surface" fallback for the others.

import { useEffect, useState } from "react";
import { X, Copy, Check, Download } from "lucide-react";
import type { Artifact } from "@/lib/artifacts";
import { artifactTypeLabel, artifactIcon } from "@/lib/artifacts";

interface ArtifactPreviewPaneProps {
  artifact: Artifact | null;
  // Per-kind content lookup. The host passes the actual body (cover
  // letter text, resume JSON, etc.) when the pane opens. For kinds
  // that don't have a body to render here, content can be null —
  // the fallback renders the "open in dedicated surface" CTA.
  content: string | null;
  onClose: () => void;
  // Per-format download. Wired by the host.
  onDownload?: (format: "pdf" | "docx", artifact: Artifact) => void;
  // Optional: open in a dedicated surface (Resume Builder, Interview
  // Prep, etc) when "Open in workspace" is clicked.
  onOpenInWorkspace?: (artifact: Artifact) => void;
}

export default function ArtifactPreviewPane({
  artifact,
  content,
  onClose,
  onDownload,
  onOpenInWorkspace,
}: ArtifactPreviewPaneProps) {
  const [copied, setCopied] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  // ESC closes the pane.
  useEffect(() => {
    if (!artifact) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [artifact, onClose]);

  if (!artifact) return null;

  function handleCopy() {
    if (!content) return;
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  const icon = artifactIcon(artifact.kind);
  const typeLabel = artifactTypeLabel(artifact.kind);

  return (
    <aside
      className="flex flex-col bg-white border-l border-gray-200 shadow-sm"
      style={{
        width: "min(560px, 50%)",
        flexShrink: 0,
        height: "100%",
        transition: "width 200ms ease",
      }}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{typeLabel}</span>
          </div>
          <h2 className="text-[15px] font-semibold text-gray-900 mt-0.5 truncate">{artifact.title}</h2>
          {artifact.subtitle && (
            <p className="text-[12px] text-gray-500 mt-0.5 truncate">{artifact.subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex-shrink-0 w-8 h-8 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {renderBody({ artifact, content, onOpenInWorkspace })}
      </div>

      {/* Footer actions */}
      {content && (
        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200 flex-shrink-0 bg-white">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gray-700 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />}
            {copied ? "Copied" : "Copy"}
          </button>
          {onDownload && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDownloadMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-black hover:opacity-90 px-3.5 py-1.5 rounded-lg transition-opacity"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} />
                Download
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </button>
              {downloadMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDownloadMenuOpen(false)} />
                  <div className="absolute right-0 bottom-full mb-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[110px]">
                    {(["pdf", "docx"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => { setDownloadMenuOpen(false); onDownload(fmt, artifact); }}
                        className="block w-full text-left text-[12px] text-gray-800 px-3 py-2 hover:bg-gray-50 transition-colors uppercase font-medium tracking-wider"
                      >
                        .{fmt}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </footer>
      )}
    </aside>
  );
}

function renderBody({ artifact, content, onOpenInWorkspace }: {
  artifact: Artifact;
  content: string | null;
  onOpenInWorkspace?: (artifact: Artifact) => void;
}) {
  // Cover letter — formatted text view.
  if (artifact.kind === "cover_letter") {
    if (!content) {
      return <p className="text-[13px] text-gray-500 italic">Letter content isn&apos;t available — it may have failed to generate. Try regenerating.</p>;
    }
    // Split on double newlines to make paragraphs; preserve single
    // newlines inside paragraphs.
    const paragraphs = content.split(/\n{2,}/);
    return (
      <article className="text-[14px] leading-[1.7] text-gray-900 space-y-3 whitespace-pre-wrap">
        {paragraphs.map((p, i) => (
          <p key={i} className="m-0">{p}</p>
        ))}
      </article>
    );
  }

  // JD Snapshot — parsed JD content + collapsible raw text.
  // The content prop is a JSON-encoded string containing both the
  // analysis (must-haves, responsibilities, etc) and the raw text.
  // Host serializes it; we parse and render.
  if (artifact.kind === "jd_snapshot") {
    if (!content) {
      return <p className="text-[13px] text-gray-500 italic">JD content isn&apos;t available — it may have been deleted from the chat history.</p>;
    }
    let parsed: { analysis?: Record<string, unknown>; rawText?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // Old-format string content — render as raw.
      return (
        <article className="text-[13px] leading-[1.65] text-gray-800 whitespace-pre-wrap">{content}</article>
      );
    }
    const a = parsed.analysis ?? {};
    const role = typeof a.role === "string" ? a.role : null;
    const company = typeof a.company === "string" ? a.company : null;
    const seniority = typeof a.seniority === "string" ? a.seniority : null;
    const years = typeof a.yearsRequired === "number" ? a.yearsRequired : null;
    const mustHaves = Array.isArray(a.mustHaveSkills) ? a.mustHaveSkills.filter((s) => typeof s === "string") : [];
    const niceToHaves = Array.isArray(a.niceToHaveSkills) ? a.niceToHaveSkills.filter((s) => typeof s === "string") : [];
    const responsibilities = Array.isArray(a.responsibilities) ? a.responsibilities.filter((s) => typeof s === "string") : [];
    const techStack = Array.isArray(a.techStack) ? a.techStack.filter((s) => typeof s === "string") : [];
    const rawText = parsed.rawText ?? "";

    return (
      <div className="space-y-5 text-[14px] leading-[1.55] text-gray-900">
        {/* Header block */}
        <div>
          <p className="text-[15px] font-semibold">{role ?? "Role unknown"}{company ? ` at ${company}` : ""}</p>
          {(seniority || years) && (
            <p className="text-[12px] text-gray-500 mt-0.5">
              {seniority ?? ""}{years ? ` · ${years}+ yrs` : ""}
            </p>
          )}
        </div>

        {mustHaves.length > 0 && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Must-haves</p>
            <div className="flex flex-wrap gap-1.5">
              {mustHaves.map((s, i) => (
                <span key={i} className="text-[12px] px-2 py-0.5 rounded-full border border-gray-300 bg-white text-gray-800">{s}</span>
              ))}
            </div>
          </section>
        )}

        {niceToHaves.length > 0 && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Nice-to-haves</p>
            <div className="flex flex-wrap gap-1.5">
              {niceToHaves.map((s, i) => (
                <span key={i} className="text-[12px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700">{s}</span>
              ))}
            </div>
          </section>
        )}

        {techStack.length > 0 && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Tech stack</p>
            <div className="flex flex-wrap gap-1.5">
              {techStack.map((s, i) => (
                <span key={i} className="text-[12px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700">{s}</span>
              ))}
            </div>
          </section>
        )}

        {responsibilities.length > 0 && (
          <section>
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">What they want you to do</p>
            <ul className="space-y-1.5 list-disc list-inside pl-1">
              {responsibilities.slice(0, 6).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {rawText && (
          <section>
            <details className="group">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-gray-500 font-semibold hover:text-gray-900">
                Raw JD text (click to expand)
              </summary>
              <pre className="mt-2 text-[12px] leading-[1.55] text-gray-700 whitespace-pre-wrap font-sans border border-gray-200 rounded-md bg-gray-50 p-3 max-h-[280px] overflow-y-auto">
                {rawText}
              </pre>
            </details>
          </section>
        )}
      </div>
    );
  }

  // Skill assessment + Quick questions — render the question list.
  // Content is a JSON-stringified array of { prompt, difficulty?,
  // expectedTopics? } objects. We parse + render as a numbered list.
  if (artifact.kind === "skill_assessment" || artifact.kind === "quick_questions") {
    if (!content) {
      return <p className="text-[13px] text-gray-500 italic">Questions aren&apos;t available — the generation may have failed.</p>;
    }
    let questions: Array<{ prompt: string; difficulty?: string; expectedTopics?: string[] }> = [];
    try {
      questions = JSON.parse(content);
    } catch {
      return <article className="text-[13px] leading-[1.65] text-gray-800 whitespace-pre-wrap">{content}</article>;
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return <p className="text-[13px] text-gray-500 italic">No questions in this set.</p>;
    }
    return (
      <ol className="space-y-4 text-[14px] leading-[1.6] text-gray-900 list-decimal list-inside pl-1">
        {questions.map((q, i) => (
          <li key={i} className="pl-1">
            <span className="font-medium">{q.prompt}</span>
            {(q.difficulty || (q.expectedTopics && q.expectedTopics.length > 0)) && (
              <div className="mt-1 ml-1 flex flex-wrap gap-1.5">
                {q.difficulty && (
                  <span className="text-[11px] uppercase tracking-wider text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50">{q.difficulty}</span>
                )}
                {q.expectedTopics?.map((topic, j) => (
                  <span key={j} className="text-[11px] text-gray-600 px-1.5 py-0.5 rounded-full border border-gray-200">{topic}</span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    );
  }

  // Generic fallback — for kinds we don't render here yet.
  return (
    <div className="text-[13px] text-gray-700 space-y-3">
      <p>This artifact lives in a dedicated workspace. Open it there to view + edit.</p>
      {onOpenInWorkspace && (
        <button
          type="button"
          onClick={() => onOpenInWorkspace(artifact)}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-black hover:opacity-90 px-3.5 py-1.5 rounded-lg transition-opacity"
        >
          Open in workspace ↗
        </button>
      )}
    </div>
  );
}
