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
      <div className="flex items-center gap-2 text-xs text-gray-800 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2} />
        <span className="truncate max-w-[130px] text-gray-800">{filename}</span>
        <button
          onClick={onRemove}
          className="ml-1 text-gray-500 hover:text-gray-900 transition-colors"
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
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-50 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-300"
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
