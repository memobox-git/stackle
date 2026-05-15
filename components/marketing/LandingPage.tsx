"use client";

// Stackle public landing page — shown to unauthenticated visitors at `/`.
// Authed users skip this and land on the chat hero in app/page.tsx.
//
// Single-file marketing surface: nav + hero + value-prop cards + proof
// strip + footer. Reuses the lucide icon set from the in-app chip row
// so the landing visually pre-figures what the user will see after
// signup.

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fafaf7] text-gray-900 flex flex-col">
      {/* Nav */}
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-black text-xs font-bold"
            style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
          >S</div>
          <span className="text-base font-semibold">Stackle</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/signin" className="text-sm text-gray-700 hover:text-gray-900 px-3 py-1.5">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium text-white px-4 py-2 rounded-full"
            style={{ background: "#000" }}
          >
            Get started
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center max-w-3xl mx-auto w-full">
        <div className="inline-flex items-center gap-2 text-[12px] font-medium text-gray-600 bg-white border border-gray-200 rounded-full px-3 py-1 mb-6">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
          A senior coach on tap — free to try
        </div>
        <h1 className="text-[40px] md:text-[56px] leading-[1.05] font-semibold tracking-tight mb-5">
          Your next career move<br />starts here.
        </h1>
        <div className="flex items-center gap-3 mt-8">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white px-5 py-3 rounded-full hover:opacity-90 transition-opacity"
            style={{ background: "#000" }}
          >
            Get started — it&apos;s free
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
          <Link
            href="/signin"
            className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-3"
          >
            Sign in
          </Link>
        </div>
        <p className="text-[12px] text-gray-500 mt-4">No credit card. Cancel anytime — but you won&apos;t want to.</p>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[12px] text-gray-600">
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded-md flex items-center justify-center text-black text-[10px] font-bold"
              style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
            >S</div>
            <span>Stackle · made for people who deserve better resumes</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/signin" className="hover:text-gray-900">Sign in</Link>
            <a href="mailto:hello@stackle.io" className="hover:text-gray-900">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
