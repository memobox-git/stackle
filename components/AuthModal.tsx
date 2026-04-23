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

  async function handleGoogle() {
    const supabase = getSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    const supabase = getSupabaseClient();
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
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

        {/* Google */}
        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-800 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.583c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.583 9 3.583z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

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
