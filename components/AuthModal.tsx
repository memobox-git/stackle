"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";

type Props = {
  onClose: () => void;
};

export default function AuthModal({ onClose }: Props) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    const supabase = getSupabaseClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      // Send the user to /auth/callback so the route handler exchanges the
      // code for a session. Previously this used origin-only which dumped
      // ?code= at the root page, where nothing parsed it.
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (err) setError(err.message);
    else setSent(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-black text-sm font-bold"
            style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
          >
            S
          </div>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 text-center mb-1">
          Sign in to Stackle
        </h2>
        <p className="text-sm text-gray-400 text-center mb-6">
          Career advisor for data & AI roles
        </p>

        {/* Google sign-in temporarily removed — OAuth callback wasn't
            wired up cleanly on the live domain. Magic link only for now. */}

        {/* Magic link */}
        {sent ? (
          <p className="text-sm text-center text-gray-500 py-2">
            Check your email for a sign-in link.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleMagicLink()}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleMagicLink}
              disabled={loading || !email.trim()}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-5">
          By continuing you agree to Stackle&apos;s{" "}
          <span className="underline cursor-pointer">Terms</span> and{" "}
          <span className="underline cursor-pointer">Privacy Policy</span>
        </p>
      </div>
    </div>
  );
}
