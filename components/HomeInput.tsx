"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import { parseFile, ACCEPTED_EXTENSIONS } from "@/lib/parseFile";
import { Paperclip, Send, Loader2, CheckCircle2, X } from "lucide-react";

interface HomeInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onFileUpload: (text: string, filename: string) => void;
  disabled?: boolean;
}

export default function HomeInput({ value, onChange, onSend, onFileUpload, disabled }: HomeInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !uploading) onSend();
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadedFile(null);
    try {
      const { text } = await parseFile(file);
      setUploadedFile(file.name);
      onFileUpload(text, file.name);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setUploading(false);
      // Reset so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-gray-50 border border-gray-300 rounded-3xl overflow-hidden">

        {/* Uploaded file badge */}
        {uploadedFile && (
          <div className="flex items-center gap-2 mx-5 mt-4 px-3 py-2 bg-white border border-gray-200 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5 text-gray-800 flex-shrink-0" strokeWidth={2} />
            <span className="text-xs text-gray-800 truncate">{uploadedFile}</span>
            <button
              onClick={() => setUploadedFile(null)}
              className="ml-auto text-gray-500 hover:text-gray-900 text-xs transition-colors"
            ><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="mx-5 mt-4 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-xl">
            <p className="text-xs text-red-400">{uploadError}</p>
          </div>
        )}

        {/* Textarea */}
        <div className="px-6 pt-4 pb-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled || uploading}
            placeholder="What's your next move in data or AI?"
            rows={3}
            className="w-full resize-none outline-none text-base text-gray-900 placeholder-[#666666] bg-transparent leading-7 min-h-[80px]"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-200 mx-4" />

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-4 py-3">
          {/* File upload button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-700 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 transition-all"
              title="Attach file — resume, JD, PDF, DOCX, JSON, CSV, TXT..."
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paperclip className="w-4 h-4" strokeWidth={2} />
              )}
            </button>
            <span className="text-[11px] text-gray-700">
              PDF, DOCX, TXT, JSON, CSV...
            </span>
          </div>

          {/* Send */}
          <button
            onClick={onSend}
            disabled={!value.trim() || disabled || uploading}
            style={{ background: "#000" }}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-black disabled:cursor-not-allowed disabled:saturate-50 active:scale-95 transition-all"
            aria-label="Send"
          >
            <Send className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
