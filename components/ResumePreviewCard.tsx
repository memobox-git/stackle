"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

interface ResumePreviewCardProps {
  filename: string;
  text: string;
}

export default function ResumePreviewCard({ filename, text }: ResumePreviewCardProps) {
  const [expanded, setExpanded] = useState(false);

  const preview = text.slice(0, 600);
  const hasMore = text.length > 600;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-6">
      <div className="bg-[#F9FAFB] border border-[#D1D5DB] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 bg-white border-b border-[#D1D5DB] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#F3F4F6] border border-[#D1D5DB] flex items-center justify-center flex-shrink-0">
              <FileText className="w-3 h-3 text-[#6B7280]" strokeWidth={2} />
            </div>
            <span className="text-xs font-medium text-[#6B7280]">Extracted from</span>
            <span className="text-xs font-semibold text-[#111827] truncate max-w-[200px]">{filename}</span>
          </div>
          <span className="text-[10px] text-[#D1D5DB]">{text.length.toLocaleString()} chars</span>
        </div>

        {/* Content */}
        <div className="px-4 py-3">
          <pre className="text-xs text-[#6B7280] font-mono whitespace-pre-wrap leading-relaxed">
            {expanded ? text : preview}
            {!expanded && hasMore && "..."}
          </pre>
        </div>

        {/* Toggle */}
        {hasMore && (
          <div className="px-4 pb-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[#4F46E5] hover:text-[#818cf8] transition-colors"
            >
              {expanded ? "Show less" : `Show full resume (${text.length.toLocaleString()} chars)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
