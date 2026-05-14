"use client";

// Post-signup intake — single screen, one job: capture a username.
// (Plus first/last name if Google didn't give us a name.)
//
// Routed to from app/page.tsx auth-init when the signed-in user has
// no `username` in their profile row. Skipped entirely for users who
// already have one.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  isUsernameAvailable,
  isValidUsername,
  setUsername,
  suggestUsernameFrom,
} from "@/lib/supabase/profiles";
import { Check, X as XIcon } from "lucide-react";

export default function ProfileSetupPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsernameInput] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  // Live availability check (debounced).
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount: read the user's Google metadata to pre-fill name +
  // suggest a username. If they're not signed in, kick to /signin.
  useEffect(() => {
    (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/signin");
        return;
      }
      // Always show First / Last / Username — pre-fill name fields
      // from OAuth metadata when we have it (user can still edit).
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

  useEffect(() => {
    if (!touched) return;
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
  }, [sanitised, validFormat, touched]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!validFormat) return;
    if (availability === "taken") return;
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name required");
      return;
    }
    setSubmitting(true);
    const res = await setUsername({
      username: sanitised,
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
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
        <h1 className="text-[24px] font-semibold text-gray-900 text-center mb-1">Finish setting up</h1>
        <p className="text-[14px] text-gray-600 text-center mb-6">
          Your username powers sharing — like <span className="font-mono text-gray-800">stackle.io/profile/your-name</span>.
        </p>

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

        <label className="block">
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
            {availability === "invalid" && touched && <span className="text-rose-700">3-20 chars · lowercase letters, digits, hyphens · must start with a letter.</span>}
            {availability === "checking" && <span className="text-gray-500">Checking…</span>}
          </p>
        </label>

        {error && (
          <p className="text-[13px] text-rose-700 mt-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || availability !== "available"}
          className="mt-6 inline-flex items-center justify-center gap-2 text-sm font-semibold text-black px-5 py-3 rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
