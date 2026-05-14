// Public profile page — /profile/{username}
//
// Anyone can visit. RLS gate: `profiles_public_read` lets unauth
// readers see rows where is_public = true. If the row is private
// or doesn't exist, we 404.
//
// Server component — fetched at request time using the anonymous
// Supabase client. SEO-friendly metadata generated per-username.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Briefcase, Sparkles } from "lucide-react";
import type { Metadata } from "next";

interface PublicProfile {
  user_id: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  professional_title: string | null;
  professional_summary: string | null;
  location: string | null;
  years_experience: number | null;
  skills: string[] | null;
  is_public: boolean;
}

async function fetchProfile(username: string): Promise<PublicProfile | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {/* read-only */},
      },
    },
  );
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, first_name, last_name, professional_title, professional_summary, location, years_experience, skills, is_public")
    .ilike("username", username)
    .eq("is_public", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as PublicProfile;
}

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> },
): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) return { title: "Profile · Stackle" };
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.username;
  const tagline = profile.professional_title || "Stackle member";
  return {
    title: `${fullName} · ${tagline}`,
    description: profile.professional_summary?.slice(0, 160) || `${fullName} on Stackle`,
  };
}

export default async function PublicProfilePage(
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) notFound();

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.username;
  const initial = (profile.first_name || profile.username).slice(0, 1).toUpperCase();
  const skills = profile.skills ?? [];

  return (
    <div className="min-h-screen bg-[#fafaf7] text-gray-900">
      {/* Top bar */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-black text-[11px] font-bold"
              style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
            >S</div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Stackle</span>
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium text-black px-3.5 py-1.5 rounded-full hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
          >
            Build yours
          </Link>
        </div>
      </header>

      {/* Hero card */}
      <main className="max-w-3xl mx-auto px-6 pt-12 pb-20">
        <section className="bg-white border border-gray-200 rounded-3xl px-6 py-8 md:px-10 md:py-10">
          {/* Avatar + identity */}
          <div className="flex items-start gap-4 mb-6">
            <div
              className="w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-black text-xl md:text-2xl font-bold flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
            >
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight">{fullName}</h1>
              <p className="text-[13px] text-gray-500 font-mono mt-0.5">@{profile.username}</p>
            </div>
          </div>

          {/* Headline + meta row */}
          {profile.professional_title && (
            <p className="text-[17px] md:text-[18px] text-gray-800 leading-7 font-medium mb-3">
              {profile.professional_title}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-gray-600 mb-6">
            {profile.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
                {profile.location}
              </span>
            )}
            {typeof profile.years_experience === "number" && profile.years_experience > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" strokeWidth={1.75} />
                {Math.round(profile.years_experience)}+ years experience
              </span>
            )}
          </div>

          {/* Summary */}
          {profile.professional_summary && (
            <div className="text-[15px] text-gray-700 leading-[1.65] whitespace-pre-line">
              {profile.professional_summary}
            </div>
          )}
        </section>

        {/* Skills */}
        {skills.length > 0 && (
          <section className="mt-6 bg-white border border-gray-200 rounded-3xl px-6 py-6 md:px-10 md:py-8">
            <h2 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-violet-700 mb-3">
              Skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center text-[13px] font-medium text-gray-800 bg-gray-100 border border-gray-200 rounded-full px-3 py-1"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* CTA strip — only for unauth visitors */}
        <section className="mt-10 text-center">
          <p className="text-[13px] text-gray-500 mb-3 inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" strokeWidth={2} />
            Built with Stackle
          </p>
          <Link
            href="/signup"
            className="block text-[13px] text-gray-700 hover:text-gray-900 underline underline-offset-2"
          >
            Make your own profile in 30 seconds
          </Link>
        </section>
      </main>
    </div>
  );
}
