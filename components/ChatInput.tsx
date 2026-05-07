"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import { Send, Plus, Square, FileText, Image as ImageIcon, Camera, Sparkles, ChevronRight } from "lucide-react";
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
              <div className="absolute bottom-full mb-2 left-0 w-60 rounded-xl border border-gray-200 bg-white shadow-[0_12px_28px_rgba(0,0,0,0.10)] py-1.5 z-10">
                {/* Group 1 — attach */}
                <MenuItem
                  icon={<FileText className="w-[15px] h-[15px]" strokeWidth={1.75} />}
                  label="Add files or photos"
                  onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }}
                />
                <MenuItem
                  icon={<ImageIcon className="w-[15px] h-[15px]" strokeWidth={1.75} />}
                  label="Add an image"
                  onClick={() => { setMenuOpen(false); imageInputRef.current?.click(); }}
                />
                <MenuItem
                  icon={<Camera className="w-[15px] h-[15px]" strokeWidth={1.75} />}
                  label="Take a screenshot"
                  hint="Soon"
                  disabled
                  onClick={() => {}}
                />
                {/* Divider */}
                <div className="my-1 mx-3 h-px bg-gray-100" />
                {/* Group 2 — style (placeholder for future writing-style picker) */}
                <MenuItem
                  icon={<Sparkles className="w-[15px] h-[15px]" strokeWidth={1.75} />}
                  label="Use a writing style"
                  trailing={<ChevronRight className="w-3.5 h-3.5 text-gray-400" strokeWidth={1.75} />}
                  hint="Soon"
                  disabled
                  onClick={() => {}}
                />
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

// Reusable row for the attach menu — Claude-style: icon left,
// label center, optional trailing chevron / hint right. Keeps the
// menu visually consistent and lets us add new actions cheaply.
function MenuItem({
  icon, label, onClick, trailing, hint, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-[13.5px] transition-colors ${
        disabled ? "text-gray-400 cursor-not-allowed" : "text-gray-800 hover:bg-gray-50"
      }`}
    >
      <span className={`flex items-center justify-center w-5 ${disabled ? "text-gray-400" : "text-gray-500"}`}>
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{hint}</span>}
      {trailing}
    </button>
  );
}
