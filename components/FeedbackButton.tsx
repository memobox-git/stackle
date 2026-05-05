"use client";

// Floating "Feedback" launcher + modal.
//
// Mounted globally in app/layout.tsx so it's reachable from every page.
// Captures the current URL automatically; user only types their message
// (and optionally picks a severity). POSTs to /api/feedback which writes
// to a `feedback` table in Supabase.

import { useEffect, useState } from "react";
import { MessageSquareWarning, X, Check, Loader2, Bug, Lightbulb, Sparkles } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Severity = "bug" | "suggestion" | "praise";

const SEVERITY_OPTIONS: { value: Severity; label: string; Icon: typeof Bug; color: string }[] = [
  { value: "bug",        label: "Bug",        Icon: Bug,      color: "#dc2626" },
  { value: "suggestion", label: "Suggestion", Icon: Lightbulb, color: "#d97706" },
  { value: "praise",     label: "Praise",     Icon: Sparkles, color: "#16a34a" },
];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Severity>("bug");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill email from the signed-in user when available so they don't have
  // to type it. Anonymous users can still submit by leaving it blank.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSupabaseClient().auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const e = data.user?.email;
      if (e && !email) setEmail(e);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setMessage("");
    setSubmitted(false);
    setError(null);
    setSubmitting(false);
  }

  async function submit() {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          severity,
          email: email.trim() || null,
          // Auto-captured context — saves the user from explaining where
          // the bug was.
          pageUrl: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Submit failed (${res.status})`);
      }
      setSubmitted(true);
      // Auto-close after a brief celebration so the user doesn't have to
      // tap Done themselves.
      setTimeout(() => { setOpen(false); reset(); }, 1600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating launcher — bottom-right, always visible */}
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200 hover:text-gray-900 shadow-lg transition-all"
        style={{ backdropFilter: "blur(8px)" }}
      >
        <MessageSquareWarning className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span className="text-xs font-medium">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:justify-end bg-black/40 px-3 pb-3 md:pb-6 md:pr-6"
          style={{ animation: "fadeIn 180ms ease" }}
          onClick={() => { setOpen(false); reset(); }}
        >
          <div
            className="w-full max-w-md bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "fadeIn 220ms ease" }}
          >
            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-200 flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                <MessageSquareWarning className="w-3.5 h-3.5 text-gray-700" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-gray-900">Send feedback</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Found a bug or have an idea? We read every one.
                </p>
              </div>
              <button
                onClick={() => { setOpen(false); reset(); }}
                className="text-gray-500 hover:text-gray-900 w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            {submitted ? (
              <div className="px-5 py-8 flex flex-col items-center gap-2.5 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-950/40 border border-emerald-900/50 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />
                </div>
                <p className="text-sm font-medium text-gray-900">Thanks — we got it.</p>
                <p className="text-[11px] text-gray-500">Your note is in our queue.</p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-3">
                {/* Severity tabs */}
                <div className="flex items-center gap-1.5">
                  {SEVERITY_OPTIONS.map(({ value, label, Icon, color }) => {
                    const active = severity === value;
                    return (
                      <button
                        key={value}
                        onClick={() => setSeverity(value)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors border ${
                          active
                            ? "bg-gray-100 border-gray-300 text-gray-900"
                            : "border-transparent text-gray-500 hover:text-gray-900"
                        }`}
                      >
                        <Icon className="w-3 h-3" strokeWidth={1.75} style={{ color: active ? color : undefined }} />
                        {label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  placeholder={
                    severity === "bug"
                      ? "What broke? What did you expect? What did you see?"
                      : severity === "suggestion"
                        ? "What would make this better?"
                        : "What's working well?"
                  }
                  rows={5}
                  disabled={submitting}
                  autoFocus
                  className="w-full bg-gray-50 border border-gray-200 focus:border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-[#555] outline-none transition-colors resize-y leading-6"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optional — only if you want a reply)"
                  disabled={submitting}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder-[#555] outline-none transition-colors"
                />

                {error && (
                  <div className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900/50 rounded-md px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <p className="text-[10px] text-gray-600 mr-auto">⌘↩ to send</p>
                  <button
                    onClick={() => { setOpen(false); reset(); }}
                    className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={submitting || !message.trim()}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-white hover:bg-gray-100 text-black disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
                        Sending…
                      </>
                    ) : (
                      <>Send</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
