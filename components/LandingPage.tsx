"use client";

import { useEffect, useRef, useState } from "react";
import AuthModal from "./AuthModal";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  // Waitlist
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const waitlistInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/user-count")
      .then((r) => r.json())
      .then((d) => setLimitReached(d.limitReached ?? false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showWaitlist) waitlistInputRef.current?.focus();
  }, [showWaitlist]);

  async function handleTryFree() {
    const supabase = getSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleWaitlistSubmit() {
    if (!waitlistEmail.trim()) return;
    setWaitlistLoading(true);
    try {
      await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: waitlistEmail.trim() }),
      });
      setWaitlistDone(true);
    } finally {
      setWaitlistLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f9f9f7" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-5xl mx-auto w-full">
        <span className="text-xl font-bold text-gray-900 tracking-tight">Stackle</span>
        <div className="flex items-center gap-8">
          <a href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Courses</a>
          <a href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Resources</a>
          <button
            onClick={() => setShowAuth(true)}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Sign in
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center -mt-8">
        {/* Badge */}
        <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-gray-200 bg-white text-sm text-gray-600 mb-8">
          Built for data and AI professionals
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight max-w-2xl mb-5">
          Your career in data and AI starts here
        </h1>

        {/* Subheadline */}
        <p className="text-lg text-gray-500 max-w-xl mb-10 leading-relaxed">
          Get your resume reviewed, interview ready, and job search sorted — all in one place. Free to start.
        </p>

        {/* CTAs */}
        {!showWaitlist && !waitlistDone && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!limitReached && (
              <button
                onClick={handleTryFree}
                className="px-6 py-3.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
              >
                Try free — no credit card
              </button>
            )}
            <button
              onClick={() => setShowWaitlist(true)}
              className="px-6 py-3.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-semibold hover:border-gray-400 transition-colors"
            >
              Join waitlist — June 5th launch
            </button>
          </div>
        )}

        {/* Waitlist email form */}
        {showWaitlist && !waitlistDone && (
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full max-w-sm animate-fadein">
            <input
              ref={waitlistInputRef}
              type="email"
              placeholder="your@email.com"
              value={waitlistEmail}
              onChange={(e) => setWaitlistEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleWaitlistSubmit()}
              className="flex-1 w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors bg-white"
            />
            <button
              onClick={handleWaitlistSubmit}
              disabled={waitlistLoading || !waitlistEmail.trim()}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {waitlistLoading ? "Joining..." : "Join waitlist"}
            </button>
          </div>
        )}

        {waitlistDone && (
          <p className="text-sm text-gray-500 animate-fadein">
            You&apos;re on the list. We&apos;ll reach out before June 5th.
          </p>
        )}

        {/* Social proof */}
        <p className="text-sm text-gray-400 mt-6">
          700+ professionals already using Stackle
        </p>
      </div>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      <style>{`
        @keyframes fadein {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadein { animation: fadein 0.25s ease-out; }
      `}</style>
    </div>
  );
}
