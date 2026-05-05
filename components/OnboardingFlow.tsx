"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import ScoreReveal from "./ScoreReveal";

function useTypewriter(text: string, speed = 28) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!text) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(interval); setDone(true); }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return { displayed, done };
}

// Animate a value into an input one character at a time
function useFieldTypewriter(value: string, delay = 0, speed = 22) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    if (!value) { setDone(true); return; }
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayed(value.slice(0, i));
        if (i >= value.length) { clearInterval(interval); setDone(true); }
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [value, delay, speed]);
  return { displayed, done };
}

type ContactInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
};

type Props = {
  onComplete: (profile: {
    avatarUrl?: string;
    resumeText?: string;
    resumeFilename?: string;
    contact?: ContactInfo;
    resumeExtraction?: ResumeExtraction | null;
    resumeAnalysis?: ResumeAnalysis | null;
    // The user's stated goal from the new step 3. Free-form string,
    // typically one of the preset chips. Drives the Career Profile
    // CTA emphasis + gets injected into the synthesis system prompt.
    careerGoal?: string | null;
  }) => void;
  // Returning user clicked "Sign in" — parent opens the AuthModal so they
  // can sign in with magic link / Google instead of redoing onboarding.
  onSignIn?: () => void;
};

export default function OnboardingFlow({ onComplete, onSignIn }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Editor state — shown after upload, before the user hits "Use this photo".
  // We keep `rawAvatarUrl` alive even after the user saves so they can click
  // the small avatar to re-open the editor with their previous framing.
  const [rawAvatarUrl, setRawAvatarUrl] = useState<string | null>(null);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [avatarScale, setAvatarScale] = useState(1);
  const [avatarOffset, setAvatarOffset] = useState({ x: 0, y: 0 });
  const [avatarDragging, setAvatarDragging] = useState(false);
  const avatarDragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const rawImgRef = useRef<HTMLImageElement>(null);
  // Photo step retired — start at upload. Avatar code is left in place
  // (unused) in case we re-introduce it as an optional post-upload nudge.
  const [step, setStep] = useState<1 | 2 | 3 | 4>(2);
  const [uploading, setUploading] = useState(false);
  const [resumeFilename, setResumeFilename] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [resumeExtraction, setResumeExtraction] = useState<ResumeExtraction | null>(null);
  const resumeAnalysisRef = useRef<ResumeAnalysis | null>(null);
  const analysisInFlightRef = useRef<Promise<ResumeAnalysis | null> | null>(null);
  // Mirror analysis as state so the score-reveal screen re-renders the moment
  // the background analysis lands. Ref alone won't trigger re-render.
  const [resumeAnalysisState, setResumeAnalysisState] = useState<ResumeAnalysis | null>(null);

  // Step 3 — Career Goal
  const [careerGoal, setCareerGoal] = useState<string | null>(null);

  // Step 4 — extracted contact, editable by user
  const [contact, setContact] = useState<ContactInfo>({
    firstName: "", lastName: "", email: "", phone: "", city: "", state: "",
  });
  // Typewriter-filled versions (shown before user edits)
  const [fieldsReady, setFieldsReady] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const q1 = useTypewriter("Add a profile photo");
  const q2 = useTypewriter(step >= 2 ? "Upload your resume" : "");
  // Step 3 — Career Goal question (NEW). Personalises later screens.
  const q3 = useTypewriter(step >= 3 ? "What are you trying to do?" : "");
  // Step 4 — Confirm extracted contact (was step 3 pre-feature).
  const q4 = useTypewriter(step >= 4 ? "Here's what I found — update anything that looks off." : "");

  // Typewriter for each field value (starts only after q4 finishes)
  const fnTW = useFieldTypewriter(step === 4 && q4.done ? contact.firstName : "", 0);
  const lnTW = useFieldTypewriter(step === 4 && q4.done ? contact.lastName : "", 200);
  const emTW = useFieldTypewriter(step === 4 && q4.done ? contact.email : "", 400);
  const phTW = useFieldTypewriter(step === 4 && q4.done ? contact.phone : "", 600);
  const ciTW = useFieldTypewriter(step === 4 && q4.done ? contact.city : "", 800);
  const stTW = useFieldTypewriter(step === 4 && q4.done ? contact.state : "", 1000);

  useEffect(() => {
    if (step === 4 && stTW.done) setFieldsReady(true);
  }, [step, stTW.done]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [step, fieldsReady]);

  function handleAvatarChange(file: File) {
    // New file picked — revoke the old raw URL if any, reset framing
    if (rawAvatarUrl) URL.revokeObjectURL(rawAvatarUrl);
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    const url = URL.createObjectURL(file);
    setRawAvatarUrl(url);
    setIsEditingAvatar(true);
    setAvatarScale(1);
    setAvatarOffset({ x: 0, y: 0 });
    setAvatarUrl(null);
  }

  function handleAvatarCancel() {
    if (rawAvatarUrl) URL.revokeObjectURL(rawAvatarUrl);
    if (avatarUrl) URL.revokeObjectURL(avatarUrl);
    setRawAvatarUrl(null);
    setAvatarUrl(null);
    setIsEditingAvatar(false);
    setAvatarScale(1);
    setAvatarOffset({ x: 0, y: 0 });
  }

  // Close the editor without discarding — if the user has already saved an
  // avatar, clicking X on the editor just reverts to the saved one.
  function handleAvatarEditorClose() {
    if (avatarUrl) {
      setIsEditingAvatar(false); // keep rawAvatarUrl + scale/offset for next time
    } else {
      handleAvatarCancel();
    }
  }

  function handleReEditAvatar() {
    if (!rawAvatarUrl) return;
    setIsEditingAvatar(true);
  }

  function handleAvatarSave() {
    const img = rawImgRef.current;
    if (!img || !rawAvatarUrl) return;
    const size = 256; // output avatar size in px
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The editor shows the image inside a 192px-wide circle frame. We render
    // to the canvas at exactly that aspect ratio.
    const frame = 192;
    const ratio = size / frame;

    // Base image fit: cover the frame (scale=1). Compute the base size so the
    // shorter side = frame, then apply user scale.
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const coverScale = Math.max(frame / natW, frame / natH);
    const scaledW = natW * coverScale * avatarScale;
    const scaledH = natH * coverScale * avatarScale;
    // Offset positions the image relative to frame center.
    const drawX = (frame / 2 - scaledW / 2 + avatarOffset.x) * ratio;
    const drawY = (frame / 2 - scaledH / 2 + avatarOffset.y) * ratio;

    // Round-clip to produce a circular output
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, scaledW * ratio, scaledH * ratio);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("[avatar] canvas.toBlob returned null — keeping editor open");
          // Leave the editor state intact so the user can retry — don't silently
          // close with no avatar saved.
          return;
        }
        // Revoke the previous cropped URL if we're re-saving
        if (avatarUrl) URL.revokeObjectURL(avatarUrl);
        const url = URL.createObjectURL(blob);
        setAvatarUrl(url);
        setIsEditingAvatar(false); // leave edit mode, keep rawAvatarUrl alive
      },
      "image/png",
      0.92
    );
  }

  function handleAvatarPointerDown(e: React.PointerEvent) {
    if (!rawAvatarUrl) return;
    setAvatarDragging(true);
    avatarDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: avatarOffset.x,
      startY: avatarOffset.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function handleAvatarPointerMove(e: React.PointerEvent) {
    if (!avatarDragging) return;
    const { x, y, startX, startY } = avatarDragStartRef.current;
    setAvatarOffset({ x: startX + (e.clientX - x), y: startY + (e.clientY - y) });
  }
  function handleAvatarPointerUp() { setAvatarDragging(false); }

  async function handleResumeUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-file", { method: "POST", body: formData });
      const data = await res.json();
      setResumeText(data.text ?? "");
      setResumeFilename(file.name);
    } catch {
      setResumeFilename(file.name);
    } finally {
      setUploading(false);
    }
  }

  async function handleResumeConfirm() {
    // Resume is mandatory; button is disabled until upload completes and
    // returns text. This guard is just a safety net.
    if (!resumeText) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/agents/resume/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText }),
      });
      const ext: ResumeExtraction = await res.json();
      setResumeExtraction(ext);

      // Kick off full analysis in the background — don't block the user.
      analysisInFlightRef.current = fetch("/api/agents/resume/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((a: ResumeAnalysis | null) => {
          resumeAnalysisRef.current = a;
          if (a) setResumeAnalysisState(a);
          // If onboarding is already complete, update localStorage so the
          // main page can pick it up on next mount.
          try {
            const saved = localStorage.getItem("stackle_onboarding");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed.completed && !parsed.resumeAnalysis && a) {
                localStorage.setItem(
                  "stackle_onboarding",
                  JSON.stringify({ ...parsed, resumeAnalysis: a })
                );
              }
            }
          } catch { /* ignore */ }
          return a;
        })
        .catch(() => null);

      const fullName: string = ext.name ?? "";
      const parts = fullName.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ");
      // Parse city/state from location like "Austin, TX" or "Austin, Texas"
      const loc: string = ext.location ?? "";
      const locParts = loc.split(",").map((s: string) => s.trim());
      const city = locParts[0] ?? "";
      const state = locParts[1] ?? "";
      setContact({
        firstName,
        lastName,
        email: ext.email ?? "",
        phone: ext.phone ?? "",
        city,
        state,
      });
      setStep(3);
    } catch {
      // Extraction failed — still advance so the user can hand-enter details.
      setStep(3);
    } finally {
      setExtracting(false);
    }
  }

  // Writes the onboarding payload to localStorage. Separate from `onComplete`
  // so the profile lands in localStorage the moment the user clicks through
  // each step — if they reload or return later, their progress is intact.
  function persistProfile(overrides: Partial<ContactInfo> = {}) {
    const finalContact = { ...contact, ...overrides };
    const analysisSoFar = resumeAnalysisRef.current;
    const profile = {
      avatarUrl: avatarUrl ?? undefined,
      resumeText: resumeText || undefined,
      resumeFilename: resumeFilename || undefined,
      contact: finalContact,
      resumeExtraction: resumeExtraction ?? null,
      resumeAnalysis: analysisSoFar ?? null,
      careerGoal: careerGoal ?? null,
    };
    localStorage.setItem(
      "stackle_onboarding",
      JSON.stringify({
        ...profile,
        completed: true,
        resumeAnalysisPending: !!(resumeText && !analysisSoFar && analysisInFlightRef.current),
      })
    );
    return profile;
  }

  // User confirmed their contact details — persist and drop into the app.
  function handleContactContinue() {
    const profile = persistProfile();
    onComplete(profile);
  }

  // Step indicator — labelled dots at the top.
  const STEP_LABELS = ["Photo", "Resume", "Goal", "Confirm"] as const;

  // Score reveal — full-screen takeover the moment extraction is done.
  // Skips Career Goal + Contact review entirely; CTA drops user straight
  // into Resume Builder Report tab. This is the wow moment.
  if (step === 3) {
    const firstName = (resumeExtraction?.name ?? "").trim().split(/\s+/)[0] || null;
    return (
      <ScoreReveal
        analysis={resumeAnalysisState ?? resumeAnalysisRef.current}
        candidateFirstName={firstName}
        onContinue={() => {
          const profile = persistProfile();
          onComplete(profile);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-12 sm:py-16 px-6 relative overflow-hidden">
      {/* Soft brand-tinted gradient background — replaces the bare white.
          Two radial blobs in the brand yellow/pink, very low opacity. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% 0%,  rgba(255, 247, 173, 0.55), transparent 60%),
            radial-gradient(ellipse 70% 50% at 80% 100%, rgba(255, 169, 249, 0.45), transparent 60%),
            linear-gradient(180deg, #ffffff 0%, #fafaf9 100%)
          `,
        }}
      />
      {/* Subtle dot pattern overlay for texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(rgba(0,0,0,0.5) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* "Already have an account? Sign in" — pill in top-right */}
      {onSignIn && (
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <button
            onClick={onSignIn}
            className="text-xs px-3 py-1.5 rounded-full bg-white/70 backdrop-blur border border-gray-200 text-gray-600 hover:text-black hover:border-gray-300 hover:bg-white transition-all shadow-sm"
          >
            Already have an account?{" "}
            <span className="font-semibold text-gray-900">Sign in →</span>
          </button>
        </div>
      )}

      {/* Logo — pinned top-left corner. Wordmark next to the chip
          instead of stacked underneath, since horizontal real estate
          is cheap up there and we want vertical space back. */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-black text-sm font-bold shadow"
          style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
        >
          S
        </div>
        <span className="text-[11px] uppercase tracking-[0.2em] text-gray-600 font-semibold">
          Stackle
        </span>
      </div>

      {/* Discreet step accumulator pinned to the bottom of the viewport.
          One dot for the current step; an extra dot fades in for each
          completed step. No labels, no numbers, no "you have 4 steps
          to do" framing. The user feels forward motion without noticing
          it as a progress indicator. */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-none">
        {Array.from({ length: STEP_LABELS.length }).map((_, i) => {
          const visible = i < step;
          return (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-gray-300 transition-all duration-500 ease-out"
              style={{
                opacity: visible ? 0.55 : 0,
                transform: visible ? "scale(1)" : "scale(0.3)",
              }}
            />
          );
        })}
      </div>

      <div className="w-full max-w-sm flex flex-col gap-12">

        {/* Step 1 — Profile photo. Retired — gated so it never renders. */}
        {false && (
        <div className="animate-fadein flex flex-col items-center gap-4">

          {/* Empty state — no photo chosen yet */}
          {!rawAvatarUrl && !avatarUrl && (
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="group w-28 h-28 rounded-full flex items-center justify-center transition-all overflow-hidden bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.15)] hover:shadow-[0_0_0_2px_#0f0f0f,0_12px_32px_-12px_rgba(0,0,0,0.25)] hover:-translate-y-0.5"
            >
              <div
                className="w-full h-full rounded-full flex flex-col items-center justify-center gap-1"
                style={{
                  background: "radial-gradient(circle at 30% 30%, rgba(255, 247, 173, 0.6), rgba(255, 169, 249, 0.25) 65%, transparent 100%)",
                }}
              >
                <Camera className="w-6 h-6 text-gray-700 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                <span className="text-[10px] text-gray-500 font-medium tracking-wide">Click to add</span>
              </div>
            </button>
          )}

          {/* Editor — user picks a photo, now adjusts framing */}
          {rawAvatarUrl && isEditingAvatar && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div
                  onPointerDown={handleAvatarPointerDown}
                  onPointerMove={handleAvatarPointerMove}
                  onPointerUp={handleAvatarPointerUp}
                  onPointerCancel={handleAvatarPointerUp}
                  className="relative w-48 h-48 rounded-full overflow-hidden bg-gray-100 touch-none select-none"
                  style={{ cursor: avatarDragging ? "grabbing" : "grab" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={rawImgRef}
                    src={rawAvatarUrl ?? undefined}
                    alt="avatar preview"
                    draggable={false}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{
                      objectFit: "cover",
                      objectPosition: "center",
                      transform: `translate(${avatarOffset.x}px, ${avatarOffset.y}px) scale(${avatarScale})`,
                      transformOrigin: "center center",
                    }}
                  />
                </div>
                {/* X on editor: close without discarding if a saved avatar exists */}
                <button
                  type="button"
                  onClick={handleAvatarEditorClose}
                  aria-label={avatarUrl ? "Cancel editing" : "Remove photo"}
                  className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-gray-500" strokeWidth={2.25} />
                </button>
              </div>

              {/* Zoom slider */}
              <div className="flex items-center gap-3 w-56">
                <span className="text-xs text-gray-400">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={avatarScale}
                  onChange={(e) => setAvatarScale(parseFloat(e.target.value))}
                  className="flex-1 accent-gray-900"
                />
              </div>

              <p className="text-xs text-gray-400">Drag to reposition</p>

              <button
                onClick={() => {
                  handleAvatarSave();
                  // Only auto-advance on first save during step 1. Re-edits
                  // from step 2+ just close the editor.
                  if (step === 1) setStep(2);
                }}
                className="px-6 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                {step === 1 ? "Continue" : "Use this photo"}
              </button>
            </div>
          )}

          {/* Saved state — editor closed, final cropped avatar shown */}
          {avatarUrl && !isEditingAvatar && (
            <div className="relative group">
              <button
                type="button"
                onClick={handleReEditAvatar}
                aria-label="Adjust photo"
                className="w-24 h-24 rounded-full overflow-hidden bg-gray-50 ring-0 hover:ring-2 hover:ring-gray-300 transition-all cursor-pointer relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl ?? undefined} alt="avatar" className="w-full h-full object-cover" />
                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-medium">
                  Adjust
                </span>
              </button>
              <button
                type="button"
                onClick={handleAvatarCancel}
                aria-label="Remove photo"
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <X className="w-3 h-3 text-gray-500" strokeWidth={2.25} />
              </button>
            </div>
          )}

          {/* Heading lives BELOW the photo so the user's eye lands on the
              image first, then reads the prompt. Centered to match the
              circular control above. */}
          <p className="text-lg font-semibold text-gray-900 text-center">
            {q1.displayed}
            <span className={`inline-block w-0.5 h-5 bg-gray-900 ml-0.5 align-middle ${q1.done ? "opacity-0" : "animate-pulse"}`} />
          </p>

          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarChange(f); }} />
        </div>
        )}

        {/* Step 2 — Resume upload */}
        {step >= 2 && (
          <div className="animate-fadein flex flex-col items-center gap-4">
            <p className="text-lg font-semibold text-gray-900 text-center">
              {q2.displayed}
              <span className={`inline-block w-0.5 h-5 bg-gray-900 ml-0.5 align-middle ${q2.done ? "opacity-0" : "animate-pulse"}`} />
            </p>
            <p className="text-sm text-gray-400 -mt-2 text-center">
              I&apos;ll pull your details from it automatically.
            </p>

            {resumeFilename ? (
              <div className="flex flex-col gap-3">
                <div className="px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 flex items-center gap-2.5 shadow-[0_2px_8px_-4px_rgba(16,185,129,0.25)]">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">✓</span>
                  <span className="truncate"><strong className="font-semibold">{resumeFilename}</strong> — ready</span>
                </div>
                {step === 2 && (
                  <button onClick={handleResumeConfirm} disabled={uploading || extracting}
                    className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:cursor-not-allowed shadow-md hover:shadow-lg relative overflow-hidden ${
                      extracting
                        ? "bg-gray-900"
                        : "bg-gray-900 hover:bg-black active:scale-[0.99]"
                    }`}
                  >
                    {extracting && (
                      <span
                        aria-hidden
                        className="absolute inset-0 -translate-x-full"
                        style={{
                          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)",
                          animation: "shimmer 1.4s ease-in-out infinite",
                        }}
                      />
                    )}
                    <span className="relative">{extracting ? "Reading your resume…" : "Continue"}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => resumeInputRef.current?.click()}
                  disabled={uploading}
                  className="group w-full px-5 py-10 rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.12)] hover:shadow-[0_0_0_2px_#0f0f0f,0_12px_32px_-12px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 transition-all flex flex-col items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform"
                    style={{
                      background: "linear-gradient(135deg, rgba(255, 247, 173, 0.6), rgba(255, 169, 249, 0.4))",
                    }}
                  >
                    <Upload className="w-5 h-5 text-gray-800" strokeWidth={1.75} />
                  </div>
                  <div className="text-center">
                    <span className="block text-sm font-semibold text-gray-900">
                      {uploading ? "Uploading…" : "Click to upload"}
                    </span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      PDF or DOCX · drag & drop coming soon
                    </span>
                  </div>
                </button>
                <input ref={resumeInputRef} type="file" accept=".pdf,.docx" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResumeUpload(f); }} />
              </div>
            )}
          </div>
        )}

        {/* Step 3 — Career Goal (retired; ScoreReveal handles step 3 now via early return) */}
        {false && (
          <div className="animate-fadein flex flex-col items-center gap-4">
            <p className="text-lg font-semibold text-gray-900 text-center">
              {q3.displayed}
              <span className={`inline-block w-0.5 h-5 bg-gray-900 ml-0.5 align-middle ${q3.done ? "opacity-0" : "animate-pulse"}`} />
            </p>

            {q3.done && (() => {
              const targetRole = resumeAnalysisRef.current?.likelyTargetRole?.trim();
              // Personalised top option when we know the target role.
              const topOption = targetRole
                ? `Land a ${targetRole} role`
                : "Land my next role";
              const goalOptions = [
                topOption,
                "Improve my resume",
                "Switch into a different role",
                "Prepare for interviews",
                "Find projects to build",
                "Not sure yet",
              ];
              return (
                <div className="flex flex-col gap-2">
                  {goalOptions.map((opt) => {
                    const selected = careerGoal === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => {
                          setCareerGoal(opt);
                          // Defer so the user briefly sees the selected
                          // state before advancing. ~300ms feels intentional.
                          setTimeout(() => setStep(4), 300);
                        }}
                        className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                          selected
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => { setCareerGoal(null); setStep(4); }}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1 self-start"
                  >
                    Skip — I'll figure it out as I go
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 4 — Review extracted contact */}
        {step === 4 && (
          <div className="animate-fadein flex flex-col items-center gap-5">
            <p className="text-lg font-semibold text-gray-900 text-center">
              {q4.displayed}
              <span className={`inline-block w-0.5 h-5 bg-gray-900 ml-0.5 align-middle ${q4.done ? "opacity-0" : "animate-pulse"}`} />
            </p>

            {q4.done && <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs text-gray-400">First name</label>
                  <input
                    type="text"
                    value={fieldsReady ? contact.firstName : fnTW.displayed}
                    onChange={(e) => setContact(c => ({ ...c, firstName: e.target.value }))}
                    readOnly={!fieldsReady}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors bg-white"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Last name</label>
                  <input
                    type="text"
                    value={fieldsReady ? contact.lastName : lnTW.displayed}
                    onChange={(e) => setContact(c => ({ ...c, lastName: e.target.value }))}
                    readOnly={!fieldsReady}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Email</label>
                <input
                  type="email"
                  value={fieldsReady ? contact.email : emTW.displayed}
                  onChange={(e) => setContact(c => ({ ...c, email: e.target.value }))}
                  readOnly={!fieldsReady}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Phone</label>
                <input
                  type="text"
                  value={fieldsReady ? contact.phone : phTW.displayed}
                  onChange={(e) => setContact(c => ({ ...c, phone: e.target.value }))}
                  readOnly={!fieldsReady}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors bg-white"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs text-gray-400">City</label>
                  <input
                    type="text"
                    value={fieldsReady ? contact.city : ciTW.displayed}
                    onChange={(e) => setContact(c => ({ ...c, city: e.target.value }))}
                    readOnly={!fieldsReady}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors bg-white"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1">
                  <label className="text-xs text-gray-400">State</label>
                  <input
                    type="text"
                    value={fieldsReady ? contact.state : stTW.displayed}
                    onChange={(e) => setContact(c => ({ ...c, state: e.target.value }))}
                    readOnly={!fieldsReady}
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 outline-none focus:border-gray-400 transition-colors bg-white"
                  />
                </div>
              </div>
            </div>}

            {fieldsReady && (
              <button onClick={handleContactContinue}
                className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors animate-fadein">
                Looks good, let&apos;s go
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes fadein {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadein { animation: fadein 0.35s ease-out; }
      `}</style>
    </div>
  );
}
