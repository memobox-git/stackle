"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Send, Paperclip, Square } from "lucide-react";
import { parseFile, ACCEPTED_EXTENSIONS } from "@/lib/parseFile";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  onFileUpload?: (text: string, filename: string) => void;
  placeholder?: string;
  // When true, the send button flips to a stop button. Clicking fires onStop.
  // Used for: agent calls in flight, writer streaming, typewriter running.
  busy?: boolean;
  onStop?: () => void;
}

export default function ChatInput({ value, onChange, onSend, disabled, onFileUpload, placeholder, busy, onStop }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  const handleFile = async (file: File) => {
    if (!onFileUpload || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const { text } = await parseFile(file);
      onFileUpload(text, file.name);
    } catch (err) {
      console.error("[ChatInput] File parse error:", err instanceof Error ? err.message : err);
    } finally {
      uploadingRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-gray-300 transition-colors">

        {/* Attach button */}
        {onFileUpload && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 transition-all flex-shrink-0 mb-0.5"
            title="Attach resume, JD, PDF, DOCX..."
          >
            <Paperclip className="w-4 h-4" strokeWidth={2} />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled && !busy}
          placeholder={busy ? "Working… press Stop to cancel" : (placeholder ?? "Ask me anything...")}
          rows={1}
          className="flex-1 resize-none outline-none text-base text-gray-900 placeholder-[#444] bg-transparent leading-7 max-h-48"
        />

        {busy && onStop ? (
          <button
            onClick={onStop}
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-white bg-gray-900 hover:bg-black active:scale-95 transition-all flex-shrink-0"
            aria-label="Stop"
            title="Stop (Esc)"
          >
            <Square className="w-3.5 h-3.5" strokeWidth={2.5} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim() || disabled}
            style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-black disabled:cursor-not-allowed disabled:saturate-50 active:scale-95 transition-all flex-shrink-0"
            aria-label="Send"
          >
            <Send className="w-4 h-4" strokeWidth={2} />
          </button>
        )}
      </div>

      <p className="text-center text-[11px] text-gray-800 mt-2.5">
        Stackle can make mistakes. Verify important career decisions.
      </p>

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
