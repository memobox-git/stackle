"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import { Send, Plus, Square, FileText, Image as ImageIcon } from "lucide-react";
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const uploadingRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Close the attach menu when clicking outside.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

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
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2.5 focus-within:border-gray-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors">

        {/* + Attach button — Claude-style. Menu opens upward with file +
            image options. */}
        {onFileUpload && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={disabled}
              className={`w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 transition-all flex-shrink-0 ${menuOpen ? "bg-gray-100 text-gray-900 rotate-45" : ""}`}
              title="Attach"
              aria-label="Attach"
              aria-expanded={menuOpen}
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full mb-2 left-0 w-56 rounded-xl border border-gray-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] py-1 z-10">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-[13.5px] text-gray-800 hover:bg-gray-50"
                >
                  <FileText className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                  <div className="flex flex-col">
                    <span>Upload a file</span>
                    <span className="text-[11px] text-gray-500">PDF, DOCX, TXT</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); imageInputRef.current?.click(); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-[13.5px] text-gray-800 hover:bg-gray-50"
                >
                  <ImageIcon className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                  <div className="flex flex-col">
                    <span>Upload a photo</span>
                    <span className="text-[11px] text-gray-500">PNG, JPG</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled && !busy}
          placeholder={busy ? "Working… press Stop to cancel" : (placeholder ?? "Ask anything...")}
          rows={1}
          className="flex-1 resize-none outline-none text-[15px] text-gray-900 placeholder-gray-400 bg-transparent leading-6 max-h-48 py-1"
        />

        {busy && onStop ? (
          <button
            onClick={onStop}
            type="button"
            className="w-9 h-9 flex items-center justify-center rounded-full text-white bg-gray-900 hover:bg-black active:scale-95 transition-all flex-shrink-0"
            aria-label="Stop"
            title="Stop (Esc)"
          >
            <Square className="w-3 h-3" strokeWidth={2.5} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed active:scale-95 transition-all flex-shrink-0"
            aria-label="Send"
          >
            <Send className="w-3.5 h-3.5" strokeWidth={2.25} />
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
