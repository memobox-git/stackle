"use client";

// Job Match list page (/job-match).
//
// Hybrid route per the plan: the list lives here, individual matches
// open inline on / via workspace lens. The list is a real bookmarkable
// page so users can come back to their pipeline of applications.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Target, Building2, MapPin } from "lucide-react";
import { listJobMatches, type JobMatch, type JobMatchStatus } from "@/lib/supabase/jobMatches";

const STATUS_STYLE: Record<JobMatchStatus, { label: string; chip: string }> = {
  analyzing:    { label: "Analyzing",    chip: "text-gray-700 bg-gray-100 border-gray-200" },
  ready:        { label: "Ready",        chip: "text-violet-700 bg-violet-50 border-violet-200" },
  applied:      { label: "Applied",      chip: "text-sky-700 bg-sky-50 border-sky-200" },
  interviewing: { label: "Interviewing", chip: "text-amber-700 bg-amber-50 border-amber-200" },
  offered:      { label: "Offered",      chip: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  rejected:     { label: "Rejected",     chip: "text-rose-700 bg-rose-50 border-rose-200" },
  skipped:      { label: "Skipped",      chip: "text-gray-500 bg-gray-100 border-gray-200" },
};

export default function JobMatchListPage() {
  const [matches, setMatches] = useState<JobMatch[] | null>(null);

  useEffect(() => {
    listJobMatches().then(setMatches);
  }, []);

  return (
    <div className="min-h-screen bg-[#fafaf7] text-gray-900">
      {/* Top bar */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ChevronLeft className="w-4 h-4" /> Back to chat
          </Link>
          <button
            type="button"
            disabled
            title="Paste-JD dialog ships in the next commit"
            className="inline-flex items-center gap-2 text-sm font-medium text-black px-4 py-2 rounded-full opacity-60 cursor-not-allowed"
            style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            New Job Match
          </button>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-10 pb-20">
        <div className="flex items-center gap-3 mb-2">
          <Target className="w-6 h-6 text-violet-600" strokeWidth={1.75} />
          <h1 className="text-[28px] font-semibold tracking-tight">Job Match</h1>
        </div>
        <p className="text-[15px] text-gray-700 mb-10 max-w-2xl">
          Paste a job description. Get a match verdict, a tailored resume, a cover letter, a study plan,
          and interview prep — all in one workspace, saved to your Drive.
        </p>

        {matches === null && (
          <div className="text-[14px] text-gray-500">Loading…</div>
        )}

        {matches !== null && matches.length === 0 && (
          <div className="border border-dashed border-gray-300 rounded-2xl px-8 py-16 text-center bg-white">
            <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-violet-50 flex items-center justify-center">
              <Target className="w-6 h-6 text-violet-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-[18px] font-semibold mb-2">No Job Matches yet</h2>
            <p className="text-[14px] text-gray-600 max-w-md mx-auto mb-6">
              Paste a job posting URL or the JD text. Stackle reads it,
              compares it to your resume, and tells you whether to apply.
            </p>
            <p className="text-[12px] text-gray-500">
              The paste-JD flow lands in the next commit.
            </p>
          </div>
        )}

        {matches !== null && matches.length > 0 && (
          <ul className="space-y-2">
            {matches.map((m) => {
              const style = STATUS_STYLE[m.status];
              return (
                <li key={m.id}>
                  <div className="block bg-white border border-gray-200 rounded-2xl px-5 py-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-gray-900 truncate">
                          {m.role || "Untitled role"}
                        </p>
                        <div className="flex items-center gap-3 text-[13px] text-gray-600 mt-0.5">
                          {m.company && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" /> {m.company}
                            </span>
                          )}
                          {m.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" /> {m.location}
                            </span>
                          )}
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-500">{new Date(m.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${style.chip}`}>
                        {style.label}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
