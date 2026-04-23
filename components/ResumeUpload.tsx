"use client";

import { useRef, useState } from "react";
import { parseFile, ACCEPTED_EXTENSIONS } from "@/lib/parseFile";
import { Upload, CheckCircle2, X } from "lucide-react";

interface ResumeUploadProps {
  hasResume: boolean;
  onUpload: (text: string, filename: string) => void;
  onRemove: () => void;
  filename?: string;
}

export default function ResumeUpload({ hasResume, onUpload, onRemove, filename }: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const { text } = await parseFile(file);
      onUpload(text, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setLoading(false);
    }
  };

  if (hasResume) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#e0e0e0] bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg px-3 py-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
        <span className="truncate max-w-[130px] text-[#e0e0e0]">{filename}</span>
        <button
          onClick={onRemove}
          className="ml-1 text-[#888888] hover:text-white transition-colors"
          aria-label="Remove file"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-50 border border-[#2a2a2a] rounded-lg px-3 py-1.5 hover:border-[#3a3a3a]"
      >
        <Upload className="w-3.5 h-3.5" strokeWidth={2} />
        {loading ? "Reading file..." : "Upload file"}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
