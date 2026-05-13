"use client";

// Stackle public landing page — shown to unauthenticated visitors at `/`.
// Authed users skip this and land on the chat hero in app/page.tsx.
//
// Single-file marketing surface: nav + hero + value-prop cards + proof
// strip + footer. Reuses the lucide icon set from the in-app chip row
// so the landing visually pre-figures what the user will see after
// signup.

import Link from "next/link";
import {
  Sparkles,
  FileText,
  Target,
  MessagesSquare,
  BookOpen,
  ArrowRight,
} from "lucide-react";

const VALUE_PROPS = [
  {
    icon: FileText,
    title: "Resume review",
    blurb: "Honest read in 30 seconds. Score, weaknesses, the one thing to fix first.",
  },
  {
    icon: Target,
    title: "Tailor for a JD",
    blurb: "Paste a job description. Get a version that mirrors the must-haves without faking experience.",
  },
  {
    icon: MessagesSquare,
    title: "Interview prep",
    blurb: "Practice the question types you'll actually get. Company-specific drills, instant verdict.",
  },
  {
    icon: BookOpen,
    title: "Foundations",
    blurb: "DE / SE / DS concepts you're expected to know. Quick lessons, real diagrams, end-of-lesson check.",
  },
];

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
            className="text-sm font-medium text-black px-4 py-2 rounded-full"
            style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
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
        <p className="text-[17px] md:text-[18px] text-gray-700 leading-7 max-w-xl mb-8">
          Drop your resume and Stackle reads it like a senior data engineer would —
          honest score, the bullets that work, the gaps that don&apos;t. Then helps you fix them.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 text-sm font-semibold text-black px-5 py-3 rounded-full hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
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

      {/* Value props */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-violet-700 text-center mb-3">
          What you can do
        </p>
        <h2 className="text-[28px] md:text-[32px] font-semibold tracking-tight text-center mb-10">
          One coach. Four surfaces. Zero busywork.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {VALUE_PROPS.map(({ icon: Icon, title, blurb }) => (
            <div
              key={title}
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-gray-800" strokeWidth={2} />
                </div>
                <h3 className="text-[16px] font-semibold">{title}</h3>
              </div>
              <p className="text-[14px] text-gray-700 leading-6">{blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Proof strip */}
      <section className="px-6 py-12 max-w-3xl mx-auto w-full text-center">
        <p className="text-[14px] text-gray-700 italic leading-7">
          &ldquo;Took me twenty minutes to find what a Stackle review surfaced in thirty seconds —
          and the fix it suggested was the exact thing my hiring manager flagged.&rdquo;
        </p>
        <p className="text-[12px] text-gray-500 mt-3">— Senior Data Engineer, FAANG</p>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-[24px] md:text-[28px] font-semibold tracking-tight mb-4">
          Ready when you are.
        </h2>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 text-sm font-semibold text-black px-5 py-3 rounded-full hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
        >
          Get started — it&apos;s free
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </Link>
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
