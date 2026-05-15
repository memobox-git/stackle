"use client";

// Account settings. Reachable from the avatar dropdown.
//
// Scope today:
//   - Edit first / last name (writable)
//   - Show username (read-only; rename is a separate flow we'll add
//     when public profiles are live — username changes break links)
//   - Edit headline + summary + location (resume normally populates
//     these, but the user can override)
//   - Toggle public profile on/off (controls future /profile/{username}
//     visibility)
//   - Sign out

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  getCurrentProfile,
  updateProfile,
  type UserProfile,
} from "@/lib/supabase/profiles";

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [location, setLocation] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/signin?next=/settings";
        return;
      }
      const p = await getCurrentProfile();
      setProfile(p);
      setFirstName(p?.first_name ?? "");
      setLastName(p?.last_name ?? "");
      setHeadline(p?.professional_title ?? "");
      setSummary(p?.professional_summary ?? "");
      setLocation(p?.location ?? "");
      setIsPublic(p?.is_public ?? false);
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    setError("");
    setSaving(true);
    const res = await updateProfile({
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      headline: headline.trim() || null,
      summary: summary.trim() || null,
      location: location.trim() || null,
      isPublic,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedAt(Date.now());
  }

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut().catch(() => {});
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf7]">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf7] text-gray-900">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ChevronLeft className="w-4 h-4" /> Back to chat
          </Link>
          <span className="text-sm font-medium text-gray-700">Settings</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-10 pb-20 space-y-10">
        {/* Identity */}
        <section>
          <h2 className="text-[18px] font-semibold mb-1">Your name</h2>
          <p className="text-[13px] text-gray-600 mb-4">How Stackle addresses you across the app.</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              className="px-3.5 py-2.5 rounded-xl border border-gray-300 text-[15px] outline-none focus:border-gray-900 bg-white transition-colors"
            />
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="px-3.5 py-2.5 rounded-xl border border-gray-300 text-[15px] outline-none focus:border-gray-900 bg-white transition-colors"
            />
          </div>
        </section>

        {/* Username (read-only for now) */}
        <section>
          <h2 className="text-[18px] font-semibold mb-1">Username</h2>
          <p className="text-[13px] text-gray-600 mb-4">
            Powers sharing. Renaming will be available when public profiles ship.
          </p>
          <div className="flex items-stretch border border-gray-200 rounded-xl overflow-hidden bg-gray-50 max-w-md">
            <span className="inline-flex items-center px-3 text-[14px] text-gray-500 bg-gray-100 border-r border-gray-200">
              stackle.io/profile/
            </span>
            <span className="flex-1 px-3.5 py-2.5 text-[15px] text-gray-800 font-mono">
              {profile?.username ?? "—"}
            </span>
          </div>
        </section>

        {/* Public profile */}
        <section>
          <h2 className="text-[18px] font-semibold mb-1">Public profile</h2>
          <p className="text-[13px] text-gray-600 mb-4">
            When on, anyone with the link above can see your profile (name, headline, summary,
            top skills). Off by default.
          </p>
          <label className="inline-flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setIsPublic((v) => !v)}
              role="switch"
              aria-checked={isPublic}
              className={`relative w-11 h-6 rounded-full transition-colors ${isPublic ? "bg-emerald-500" : "bg-gray-300"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isPublic ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
            <span className="text-[14px] text-gray-700">{isPublic ? "Profile is public" : "Profile is private"}</span>
          </label>
        </section>

        {/* Bio fields */}
        <section>
          <h2 className="text-[18px] font-semibold mb-1">About</h2>
          <p className="text-[13px] text-gray-600 mb-4">
            Auto-filled from your resume the first time you upload one. Edit if you want a different angle.
          </p>
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className="text-[12px] text-gray-600 mb-1 block">Headline</span>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Senior Data Engineer at Stripe"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-[15px] outline-none focus:border-gray-900 bg-white transition-colors"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-gray-600 mb-1 block">Location</span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="San Francisco, CA"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-[15px] outline-none focus:border-gray-900 bg-white transition-colors"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-gray-600 mb-1 block">Summary</span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="A few lines about what you do and what you're looking for."
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-[15px] outline-none focus:border-gray-900 bg-white transition-colors resize-y"
              />
            </label>
          </div>
        </section>

        {/* Save bar */}
        <div className="sticky bottom-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-white px-5 py-2.5 rounded-full disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ background: "#000" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && !saving && (
            <span className="inline-flex items-center gap-1 text-[13px] text-emerald-700">
              <Check className="w-4 h-4" strokeWidth={2.5} /> Saved
            </span>
          )}
          {error && <span className="text-[13px] text-rose-700">{error}</span>}
        </div>

        {/* Danger zone */}
        <section className="border-t border-gray-200 pt-8 mt-4">
          <h2 className="text-[14px] font-semibold text-gray-700 mb-3 uppercase tracking-wider">Account</h2>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-[14px] text-rose-700 hover:text-rose-900 underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </section>
      </main>
    </div>
  );
}
