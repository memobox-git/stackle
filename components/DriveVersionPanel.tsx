"use client";

import { useState } from "react";
import { Lock, FileText, FileBarChart, Clock, Pin, Download, Link2, Check } from "lucide-react";
import { DriveFile } from "@/lib/supabase/drive";
import { downloadResumePdf, buildShareLink } from "@/lib/resumeExport";

interface DriveVersionPanelProps {
  driveFiles: DriveFile[];
  currentExtractionId?: string | null; // id of the currently active drive file
  onRestoreVersion: (file: DriveFile) => void;
}

function fileIcon(type: DriveFile["file_type"]) {
  if (type === "report") return <FileBarChart className="w-3 h-3 flex-shrink-0" />;
  return <FileText className="w-3 h-3 flex-shrink-0" />;
}

function fileLabel(file: DriveFile): string {
  if (file.file_type === "original") return "Original";
  if (file.file_type === "working_copy") return "Editing…";
  if (file.file_type === "version") return `v${file.version_number}`;
  if (file.file_type === "report") return "Report";
  return file.display_name;
}

function shortName(displayName: string): string {
  // Remove candidate name prefix for brevity — show only the role/version part
  const parts = displayName.split("_");
  if (parts.length >= 3) return parts.slice(1).join(" ").replace(/_/g, " ");
  return displayName.replace(/_/g, " ");
}

// Tiny icon-button for per-row actions (Download / Share). Hidden until the
// user hovers the row so the collapsed Drive panel doesn't get noisy.
function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      title={label}
      aria-label={label}
      className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-[#2a2a2a] transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      {children}
    </button>
  );
}

export default function DriveVersionPanel({
  driveFiles,
  currentExtractionId,
  onRestoreVersion,
}: DriveVersionPanelProps) {
  // Track which row we just copied a link from so we can flip the icon to a ✓
  // for ~1.5s. Keyed by file id.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(file: DriveFile) {
    if (!file.extraction_json) {
      alert("This file doesn't have resume data attached — can't export as PDF.");
      return;
    }
    setDownloadingId(file.id);
    try {
      await downloadResumePdf(file.extraction_json, file.display_name);
    } catch (err) {
      console.error("[drive] pdf export failed:", err);
      alert("PDF export failed. Try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleShare(file: DriveFile) {
    if (!file.extraction_json) {
      alert("This file doesn't have resume data attached — can't share.");
      return;
    }
    const url = buildShareLink(file.extraction_json);
    if (!url) {
      alert("Resume is too large to share via URL. Try the PDF download instead.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId((id) => (id === file.id ? null : id)), 1500);
    } catch {
      alert("Couldn't copy the link. Try again.");
    }
  }

  if (driveFiles.length === 0) return null;

  // Group: original + its children, then standalone reports
  const originals = driveFiles.filter((f) => f.file_type === "original");
  const reports = driveFiles.filter((f) => f.file_type === "report");
  const others = driveFiles.filter(
    (f) => f.file_type !== "original" && f.file_type !== "report"
  );

  const hasResumes = originals.length > 0 || others.length > 0;
  const hasReports = reports.length > 0;

  return (
    <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider px-3 mb-2 flex items-center gap-1.5">
        <FileText className="w-2.5 h-2.5" />
        Drive
      </p>

      {/* Resumes folder */}
      {hasResumes && (
        <div className="mb-2">
          <p className="text-[9px] text-gray-700 uppercase tracking-wider px-3 mb-1">Resumes /</p>
          <div className="space-y-0.5">
            {originals.map((orig) => {
              const children = others.filter((f) => f.parent_id === orig.id);
              return (
                <div key={orig.id}>
                  {/* Original — locked, always at top */}
                  <div className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-500 hover:bg-[#141414]">
                    <Lock className="w-2.5 h-2.5 flex-shrink-0 text-gray-600" />
                    <span className="text-[11px] truncate flex-1">{orig.candidate_name ?? "Resume"}</span>
                    <div className="flex items-center gap-0.5">
                      <RowAction label="Download as PDF" onClick={() => handleDownload(orig)}>
                        <Download className="w-3 h-3" strokeWidth={2} />
                      </RowAction>
                      <RowAction label={copiedId === orig.id ? "Link copied" : "Copy share link"} onClick={() => handleShare(orig)}>
                        {copiedId === orig.id ? <Check className="w-3 h-3 text-emerald-400" strokeWidth={2.5} /> : <Link2 className="w-3 h-3" strokeWidth={2} />}
                      </RowAction>
                    </div>
                    <span className="text-[9px] text-gray-700 font-mono">Original</span>
                  </div>

                  {/* Working copy / versions */}
                  {children.map((child) => {
                    const isActive = child.is_current;
                    const isEditing = child.file_type === "working_copy";
                    const isCurrent = child.id === currentExtractionId;

                    const showExportActions = !isEditing;
                    return (
                      <div
                        key={child.id}
                        onClick={() => !child.is_read_only && onRestoreVersion(child)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if ((e.key === "Enter" || e.key === " ") && !child.is_read_only) {
                            e.preventDefault();
                            onRestoreVersion(child);
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors group ml-2 cursor-pointer ${
                          isCurrent
                            ? "bg-[#1e1e1e] border border-[#2a2a2a]"
                            : "hover:bg-[#1a1a1a] border border-transparent"
                        }`}
                      >
                        {fileIcon(child.file_type)}
                        <span
                          className={`text-[11px] truncate flex-1 ${
                            isCurrent ? "text-white" : "text-gray-500 group-hover:text-gray-300"
                          }`}
                        >
                          {shortName(child.display_name)}
                        </span>
                        {showExportActions && (
                          <div className="flex items-center gap-0.5">
                            <RowAction label={downloadingId === child.id ? "Exporting…" : "Download as PDF"} onClick={() => handleDownload(child)}>
                              <Download className={`w-3 h-3 ${downloadingId === child.id ? "animate-pulse" : ""}`} strokeWidth={2} />
                            </RowAction>
                            <RowAction label={copiedId === child.id ? "Link copied" : "Copy share link"} onClick={() => handleShare(child)}>
                              {copiedId === child.id ? <Check className="w-3 h-3 text-emerald-400" strokeWidth={2.5} /> : <Link2 className="w-3 h-3" strokeWidth={2} />}
                            </RowAction>
                          </div>
                        )}
                        {isEditing ? (
                          <span className="flex items-center gap-1 text-[9px] text-purple-400">
                            <span
                              className="w-1 h-1 rounded-full bg-purple-400"
                              style={{ animation: "pulse 1.5s ease-in-out infinite" }}
                            />
                            editing
                          </span>
                        ) : isActive ? (
                          <Pin className="w-2.5 h-2.5 text-[#4fc9a4] fill-[#4fc9a4]" aria-label="Active version" />
                        ) : (
                          <Clock className="w-2.5 h-2.5 text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Orphaned versions (no original yet) */}
            {others
              .filter((f) => !originals.some((o) => f.parent_id === o.id))
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() => onRestoreVersion(f)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-left hover:bg-[#1a1a1a] border border-transparent transition-colors group"
                >
                  {fileIcon(f.file_type)}
                  <span className="text-[11px] text-gray-500 truncate flex-1 group-hover:text-gray-300">
                    {fileLabel(f)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Reports folder */}
      {hasReports && (
        <div>
          <p className="text-[9px] text-gray-700 uppercase tracking-wider px-3 mb-1">Reports /</p>
          <div className="space-y-0.5">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-500">
                <FileBarChart className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="text-[11px] truncate flex-1">{shortName(r.display_name)}</span>
                <Lock className="w-2 h-2 text-gray-700" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
