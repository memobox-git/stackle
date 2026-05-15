"use client";

// Post-signup intake — single screen.
// First name · Last name · Username · Resume upload.
//
// All four fields are submitted together: profile row gets the
// username + names, the resume gets parsed and saved to Drive,
// and the rest of the profile fields (headline, summary, skills,
// location, years_experience) auto-populate from the resume.
//
// After submit, user lands on the chat hero with a fully-loaded
// resume context. Every downstream action (Review my resume,
// Tailor for a JD, Interview prep) can act on the primary resume
// without re-asking.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  buildProfileFromResume,
  isUsernameAvailable,
  isValidUsername,
  setUsername,
  suggestUsernameFrom,
} from "@/lib/supabase/profiles";
import { saveOriginalResume, type DriveFile } from "@/lib/supabase/drive";
import { createChat } from "@/lib/supabase/chats";
import { parseFile, ACCEPTED_EXTENSIONS } from "@/lib/parseFile";
import { Check, X as XIcon, Upload, FileText } from "lucide-react";
import type { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { useTypewriter } from "@/lib/useTypewriter";

export default function ProfileSetupPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsernameInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  // Typewriter on the heading. Every onboarding page opens with one —
  // matches the "Create your account" / "Sign in to Stackle" cadence on
  // the auth screens. Speed 32ms/char keeps it punchy without feeling
  // slow.
  const { displayed: headingText, done: headingDone } = useTypewriter(
    authChecked ? "Finish setting up" : "",
    32,
  );

  // Resume state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedExtraction, setParsedExtraction] = useState<ResumeExtraction | null>(null);
  const [parsedText, setParsedText] = useState<string>("");
  const [parseError, setParseError] = useState<string>("");

  // Live availability check (debounced).
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: read auth metadata for pre-fill.
  useEffect(() => {
    (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/signin");
        return;
      }
      const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string; given_name?: string; family_name?: string };
      const fullName = meta.full_name || meta.name || [meta.given_name, meta.family_name].filter(Boolean).join(" ") || "";
      if (fullName.trim()) {
        const [first, ...rest] = fullName.trim().split(/\s+/);
        if (meta.given_name) setFirstName(meta.given_name);
        else setFirstName(first);
        if (meta.family_name) setLastName(meta.family_name);
        else setLastName(rest.join(" "));
      }
      setUsernameInput(suggestUsernameFrom({ fullName, email: user.email ?? null }));
      setAuthChecked(true);
    })();
  }, [router]);

  const sanitised = useMemo(() => username.trim().toLowerCase(), [username]);
  const validFormat = useMemo(() => isValidUsername(sanitised), [sanitised]);

  // Used to be gated on `touched`, which only flips when the user types
  // into the username field. But the username is pre-filled on mount
  // from full_name / email — so `touched` stayed false, availability
  // never advanced past its initial state, and the Continue button
  // remained disabled even with a perfectly valid pre-filled username.
  // Fix: run the check whenever sanitised + validFormat are ready.
  useEffect(() => {
    if (!sanitised) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!validFormat) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
    debounceRef.current = setTimeout(async () => {
      const free = await isUsernameAvailable(sanitised);
      setAvailability(free ? "available" : "taken");
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [sanitised, validFormat]);

  // Parse the resume file as soon as it's selected so we have a
  // ResumeExtraction ready by the time the user clicks Continue.
  async function handleFile(file: File) {
    setResumeFile(file);
    setParseError("");
    setParsing(true);
    setParsedExtraction(null);
    try {
      const parsed = await parseFile(file);
      const text = parsed.text;
      if (!text || text.trim().length < 200) {
        setParseError("This file looks too short or empty — try a different one?");
        setParsing(false);
        setResumeFile(null);
        return;
      }
      setParsedText(text);
      // Extract structured data via the existing API.
      const res = await fetch("/api/agents/resume/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: text }),
      });
      if (!res.ok) {
        setParseError("Couldn't read this resume — try a different file?");
        setParsing(false);
        setResumeFile(null);
        return;
      }
      const ext: ResumeExtraction = await res.json();
      setParsedExtraction(ext);
      // Auto-fill name fields from the resume if the user hasn't typed them yet.
      const resumeFullName = (ext.name ?? "").trim();
      if (resumeFullName) {
        const [first, ...rest] = resumeFullName.split(/\s+/);
        if (!firstName.trim()) setFirstName(first);
        if (!lastName.trim()) setLastName(rest.join(" "));
      }
    } catch (err) {
      console.warn("[profile-setup] parse failed:", err);
      setParseError("Something went wrong reading that file. Try again?");
      setResumeFile(null);
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name required");
      return;
    }
    if (!validFormat) return;
    if (availability === "taken") return;
    if (!parsedExtraction || !parsedText || !resumeFile) {
      setError("Please upload your resume to continue.");
      return;
    }
    setSubmitting(true);

    // 1. Save profile row with username + names.
    const usernameRes = await setUsername({
      username: sanitised,
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
    });
    if (!usernameRes.ok) {
      setError(usernameRes.error);
      setSubmitting(false);
      return;
    }

    // 2. Seed a chat so the upload has somewhere to attach.
    let chatId: string | null = null;
    try {
      const chat = await createChat("chat", {
        resumeText: parsedText,
        resumeFilename: resumeFile.name,
        resumeExtraction: parsedExtraction,
        resumeAnalysis: null,
      });
      chatId = chat?.id ?? null;
    } catch (err) {
      console.warn("[profile-setup] seed-chat failed:", err);
    }

    // 3. Save the resume to Drive (original) + auto-build profile.
    let savedDriveFile: DriveFile | null = null;
    try {
      if (chatId) {
        savedDriveFile = await saveOriginalResume({
          chatId,
          extraction: parsedExtraction,
          rawText: parsedText,
          filename: resumeFile.name,
        });
      }
    } catch (err) {
      console.warn("[profile-setup] drive save failed:", err);
    }

    try {
      await buildProfileFromResume({
        extraction: parsedExtraction,
        sourceResumeId: savedDriveFile?.id ?? null,
      });
    } catch (err) {
      console.warn("[profile-setup] profile build failed:", err);
    }

    // 4. Kick off the resume analysis in the background — by the
    // time the user clicks "Review my resume" in chat, it'll be ready.
    // Not awaited; we don't want to block landing on the chat.
    fetch("/api/agents/resume/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resumeText: parsedText,
        reviewType: "Full Review",
        targetMarket: "US General",
        seniorityLevel: parsedExtraction.totalYearsExperience && parsedExtraction.totalYearsExperience >= 7 ? "Senior" : "Mid",
        jobDescription: "",
      }),
    }).catch(() => {/* analysis runs lazily on the chat side too */});

    // Land on the chat hero.
    router.replace("/");
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf7]">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafaf7] px-6 py-12">
      <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col items-stretch">
        <div
          className="w-10 h-10 rounded-2xl mx-auto flex items-center justify-center text-black text-sm font-bold mb-6"
          style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
        >S</div>
        <h1 className="text-[24px] font-semibold text-gray-900 text-center mb-6 min-h-[32px]">
          {headingText}
          {!headingDone && <span className="inline-block w-[2px] h-5 bg-gray-700 align-middle ml-0.5" aria-hidden />}
        </h1>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="px-3.5 py-2.5 rounded-xl border border-gray-300 text-[15px] outline-none focus:border-gray-900 transition-colors"
            required
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="px-3.5 py-2.5 rounded-xl border border-gray-300 text-[15px] outline-none focus:border-gray-900 transition-colors"
            required
          />
        </div>

        <label className="block mb-4">
          <div className="flex items-stretch border border-gray-300 rounded-xl overflow-hidden bg-white focus-within:border-gray-900 transition-colors">
            <span className="inline-flex items-center px-3 text-[14px] text-gray-500 bg-gray-50 border-r border-gray-300">
              stackle.io/profile/
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsernameInput(e.target.value); setTouched(true); }}
              onBlur={() => setTouched(true)}
              placeholder="your-name"
              className="flex-1 px-3.5 py-2.5 text-[15px] outline-none bg-white"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              minLength={3}
              maxLength={20}
              required
            />
            <span className="inline-flex items-center px-3 text-[14px] text-gray-500 bg-gray-50 border-l border-gray-300 w-8 justify-center">
              {availability === "available" && <Check className="w-4 h-4 text-emerald-600" strokeWidth={2.5} />}
              {availability === "taken" && <XIcon className="w-4 h-4 text-rose-600" strokeWidth={2.5} />}
              {availability === "invalid" && touched && <XIcon className="w-4 h-4 text-rose-600" strokeWidth={2.5} />}
              {availability === "checking" && <span className="w-3 h-3 rounded-full border border-gray-300 border-t-gray-700 animate-spin" />}
            </span>
          </div>
          <p className="text-[12px] text-gray-500 mt-1.5 h-4">
            {availability === "available" && <span className="text-emerald-700">Available</span>}
            {availability === "taken" && <span className="text-rose-700">That one's taken — try another.</span>}
            {availability === "invalid" && touched && <span className="text-rose-700">3-20 chars · lowercase · starts with a letter.</span>}
            {availability === "checking" && <span className="text-gray-500">Checking…</span>}
          </p>
        </label>

        {/* Resume drop-zone */}
        <div className="mb-3">
          <span className="text-[12px] font-medium text-gray-700 mb-1.5 block">Your resume</span>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {!resumeFile && !parsing && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl px-4 py-6 hover:border-gray-400 hover:bg-white transition-colors flex flex-col items-center gap-2 text-gray-600"
            >
              <Upload className="w-5 h-5" strokeWidth={1.75} />
              <span className="text-[14px] font-medium">Drop your resume</span>
              <span className="text-[12px] text-gray-500">PDF, DOCX, TXT</span>
            </button>
          )}
          {parsing && (
            <div className="w-full border border-gray-200 rounded-xl px-4 py-5 flex items-center gap-3 bg-white">
              <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
              <span className="text-[14px] text-gray-700">Reading your resume…</span>
            </div>
          )}
          {resumeFile && !parsing && parsedExtraction && (
            <div className="w-full border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <FileText className="w-5 h-5 text-emerald-700 flex-shrink-0" strokeWidth={1.75} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-emerald-900 truncate">{resumeFile.name}</p>
                <p className="text-[12px] text-emerald-800">
                  Parsed · {parsedExtraction.name || "Resume"}{parsedExtraction.experience?.[0]?.title ? ` · ${parsedExtraction.experience[0].title}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setResumeFile(null); setParsedExtraction(null); setParsedText(""); }}
                className="text-emerald-800 hover:text-emerald-900"
                aria-label="Remove file"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          )}
          {parseError && (
            <p className="text-[12px] text-rose-700 mt-2">{parseError}</p>
          )}
        </div>

        {error && (
          <p className="text-[13px] text-rose-700 mt-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || availability !== "available" || !parsedExtraction || parsing}
          className="mt-6 inline-flex items-center justify-center gap-2 text-sm font-semibold text-black px-5 py-3 rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
        >
          {submitting ? "Setting up…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
