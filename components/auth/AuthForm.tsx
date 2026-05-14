"use client";

// Shared form for /signin and /signup. The two pages reuse this with
// `mode` set differently. Supports four sign-in paths:
//   - email + password
//   - magic link (OTP)
//   - Google OAuth
//   - GitHub OAuth
//   - LinkedIn OAuth (provider name in Supabase: 'linkedin_oidc')
//
// OAuth provider keys must be configured in the Supabase dashboard
// (Authentication → Providers). The buttons gracefully fail with the
// provider's error message if not enabled.

import { useState } from "react";
import { useTypewriter } from "@/lib/useTypewriter";
import { getSupabaseClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

// LinkedIn + GitHub stripped from the OAuth row — Google only for now.
// They can come back as separate entries once the post-signup intake
// gracefully handles each provider's identity payload.
const PROVIDERS: { key: "google"; label: string }[] = [
  { key: "google", label: "Continue with Google" },
];

export default function AuthForm({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleOAuth(provider: "google") {
    setError("");
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (err) setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEmail() {
    setError(""); setInfo("");
    const trimmed = email.trim();
    if (!trimmed) { setError("Email required"); return; }
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      if (usePassword) {
        if (!password) { setError("Password required"); setBusy(false); return; }
        if (mode === "signup") {
          const { error: err } = await supabase.auth.signUp({
            email: trimmed,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
          if (err) setError(err.message);
          else setInfo("Check your email for a confirmation link.");
        } else {
          const { error: err } = await supabase.auth.signInWithPassword({ email: trimmed, password });
          if (err) setError(err.message);
          else window.location.href = "/";
        }
      } else {
        // Magic link path (no password)
        const { error: err } = await supabase.auth.signInWithOtp({
          email: trimmed,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (err) setError(err.message);
        else setInfo("Check your email for the sign-in link.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-6">
        <div
          className="inline-flex w-10 h-10 rounded-xl items-center justify-center text-black text-base font-bold mb-3"
          style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
        >S</div>
        <Headline mode={mode} />
        {mode === "signin" && (
          <p className="text-sm text-gray-500">Pick up where you left off.</p>
        )}
      </div>

      {/* OAuth buttons */}
      <div className="flex flex-col gap-2 mb-5">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            onClick={() => handleOAuth(p.key)}
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-medium hover:border-gray-500 disabled:opacity-50 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-[11px] uppercase tracking-wider text-gray-400">or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Email + password */}
      <div className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          disabled={busy}
          className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-violet-500"
        />
        {usePassword && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleEmail(); }}
            placeholder={mode === "signup" ? "Create a password (8+ chars)" : "Password"}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-violet-500"
          />
        )}

        <button
          onClick={handleEmail}
          disabled={busy || !email.trim()}
          className="w-full px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50 transition-colors"
        >
          {busy ? "…" : mode === "signup" ? "Create account" : usePassword ? "Sign in" : "Send magic link"}
        </button>

        <button
          onClick={() => { setUsePassword((v) => !v); setError(""); setInfo(""); }}
          className="text-[12px] text-gray-500 hover:text-gray-900 mt-1"
        >
          {usePassword ? "Use a magic link instead" : "Use password instead"}
        </button>
      </div>

      {error && <p className="mt-4 text-[13px] text-rose-700">{error}</p>}
      {info && <p className="mt-4 text-[13px] text-emerald-700">{info}</p>}

      <div className="mt-8 text-center">
        {mode === "signup" ? (
          <p className="text-[13px] text-gray-500">
            Already have an account? <a href="/signin" className="text-gray-900 underline">Sign in</a>
          </p>
        ) : (
          <p className="text-[13px] text-gray-500">
            New here? <a href="/signup" className="text-gray-900 underline">Create an account</a>
          </p>
        )}
      </div>
    </div>
  );
}


// Typewriter headline. Only animates on the signup screen — sign-in
// reads instantly to avoid making returning users wait to read a
// familiar prompt.
function Headline({ mode }: { mode: "signin" | "signup" }) {
  const target = mode === "signup" ? "Create your account" : "Sign in to Stackle";
  const { displayed, done } = useTypewriter(mode === "signup" ? target : "", 32);
  const text = mode === "signup" ? displayed : target;
  return (
    <h1 className="text-xl font-semibold text-gray-900 mb-1">
      {text}
      {mode === "signup" && !done && (
        <span className="inline-block w-[2px] h-5 bg-gray-900 align-middle ml-0.5 animate-pulse" aria-hidden />
      )}
    </h1>
  );
}
