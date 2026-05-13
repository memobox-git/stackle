"use client";

// Stackle Foundations — in-app Learn surface.
//
// Renders inside the main app shell (activeView === "learn"). Holds
// its own internal state for which lesson is currently open. Index
// shows all modules + lessons; clicking a ready lesson swaps the
// view to the reader. Reader has a sidebar TOC for the parent module
// and prev/next nav at the bottom.

import { useState, useMemo } from "react";
import { CURRICULUM } from "@/lib/learn/curriculum";
import { getLessonContent } from "@/lib/learn/lessons";
import LessonMarkdown from "@/components/LessonMarkdown";
import { Lock, Clock, ArrowRight, ChevronLeft, CheckCircle2 } from "lucide-react";

export default function LearnView() {
  const track = CURRICULUM[0]; // de-fundamentals — only track for now
  const [selectedLessonSlug, setSelectedLessonSlug] = useState<string | null>(null);

  const allLessons = useMemo(
    () => track.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleSlug: m.slug, moduleTitle: m.title }))),
    [track],
  );
  const readyCount = allLessons.filter((l) => l.status === "ready").length;
  const totalMinutes = allLessons.reduce((s, l) => s + l.minutes, 0);

  // ── Lesson reader ────────────────────────────────────────
  if (selectedLessonSlug) {
    const idx = allLessons.findIndex((l) => l.slug === selectedLessonSlug);
    const lesson = allLessons[idx];
    const module = track.modules.find((m) => m.slug === lesson.moduleSlug)!;
    const content = getLessonContent(track.track, lesson.slug);
    const prev = idx > 0 ? allLessons[idx - 1] : null;
    const next = idx < allLessons.length - 1 ? allLessons[idx + 1] : null;

    return (
      <div className="flex-1 overflow-y-auto bg-white">
        <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <button
              onClick={() => setSelectedLessonSlug(null)}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="w-4 h-4" /> All lessons
            </button>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 pt-10 pb-20 flex gap-10">
          {/* Module TOC */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <div className="sticky top-24">
              <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-3">{module.title}</p>
              <ul className="space-y-1">
                {module.lessons.map((l) => {
                  const isCurrent = l.slug === selectedLessonSlug;
                  const ready = l.status === "ready";
                  const cls = `block px-3 py-2 rounded-lg text-[13px] transition-colors ${
                    isCurrent
                      ? "bg-violet-50 text-violet-900 font-medium border-l-2 border-violet-600"
                      : ready
                        ? "text-gray-700 hover:bg-gray-100 cursor-pointer"
                        : "text-gray-400 cursor-not-allowed"
                  }`;
                  const inner = (
                    <span className="flex items-center gap-2">
                      {ready ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" />
                      )}
                      <span className="flex-1">{l.title}</span>
                    </span>
                  );
                  return (
                    <li key={l.slug}>
                      {ready ? (
                        <button onClick={() => setSelectedLessonSlug(l.slug)} className={`${cls} w-full text-left`}>{inner}</button>
                      ) : (
                        <div className={cls}>{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* Reader */}
          <main className="flex-1 min-w-0 max-w-2xl">
            <div className="flex items-center gap-3 text-[12px] text-gray-500 mb-2">
              <span className="font-medium text-gray-700">{module.title}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {lesson.minutes} min</span>
              {!lesson.free && (
                <span className="inline-flex items-center gap-1 text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
                  <Lock className="w-2.5 h-2.5" /> Premium
                </span>
              )}
            </div>

            {content ? (
              <LessonMarkdown source={content} />
            ) : lesson.status === "coming-soon" ? (
              <div className="mt-8">
                <h1 className="text-[32px] font-bold text-gray-900 mb-4">{lesson.title}</h1>
                <div className="border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center bg-gray-50">
                  <p className="text-[15px] text-gray-700 mb-1">This lesson is being written.</p>
                  <p className="text-[13px] text-gray-500">Check back soon, or jump to a ready lesson from the sidebar.</p>
                </div>
              </div>
            ) : (
              <div>Lesson content missing.</div>
            )}

            <div className="mt-14 pt-6 border-t border-gray-200 flex items-center justify-between gap-4">
              {prev ? (
                <button onClick={() => setSelectedLessonSlug(prev.slug)} className="group flex-1 text-left">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">← Previous</p>
                  <p className="text-[14px] text-gray-900 font-medium group-hover:text-violet-700">{prev.title}</p>
                </button>
              ) : <div className="flex-1" />}
              {next ? (
                <button onClick={() => setSelectedLessonSlug(next.slug)} className="group flex-1 text-right">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Next →</p>
                  <p className="text-[14px] text-gray-900 font-medium group-hover:text-violet-700">{next.title}</p>
                </button>
              ) : <div className="flex-1" />}
            </div>
          </main>
        </div>
      </div>
    );
  }

  // ── Index ────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <section className="max-w-5xl mx-auto px-6 pt-12 pb-10">
        <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-violet-700 mb-3">Track · Data Engineering</p>
        <h1 className="text-[40px] leading-[1.1] font-bold text-gray-900 mb-4">DE Foundations</h1>
        <p className="text-[17px] text-gray-700 leading-7 max-w-2xl mb-6">
          From zero to fluent in every core data-engineering concept. Written for people prepping for interviews or stepping into their first DE role.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-gray-600">
          <span>{track.modules.length} modules</span>
          <span>·</span>
          <span>{allLessons.length} lessons</span>
          <span>·</span>
          <span>~{Math.round(totalMinutes / 60)}h to complete</span>
          <span>·</span>
          <span className="text-emerald-700 font-medium">{readyCount} ready now</span>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="space-y-10">
          {track.modules.map((mod, mi) => (
            <div key={mod.slug}>
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-[11px] font-mono font-semibold text-violet-700">{String(mi + 1).padStart(2, "0")}</span>
                <h2 className="text-[22px] font-bold text-gray-900">{mod.title}</h2>
              </div>
              <p className="text-[14px] text-gray-600 mb-4 ml-8">{mod.blurb}</p>

              <ul className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden ml-8 bg-white">
                {mod.lessons.map((lesson) => {
                  const ready = lesson.status === "ready";
                  const cls = `flex items-center gap-3 px-4 py-3 transition-colors ${ready ? "hover:bg-gray-50 cursor-pointer w-full text-left" : "opacity-60 cursor-not-allowed"}`;
                  const inner = (
                    <>
                      <span className="flex-shrink-0">
                        {ready ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" strokeWidth={1.75} />
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-gray-300" />
                        )}
                      </span>
                      <span className="flex-1 text-[15px] text-gray-900 font-medium">{lesson.title}</span>
                      <span className="hidden sm:inline-flex items-center gap-1 text-[12px] text-gray-500">
                        <Clock className="w-3 h-3" /> {lesson.minutes} min
                      </span>
                      {lesson.free ? (
                        <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">Free</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded-full">
                          <Lock className="w-2.5 h-2.5" /> Premium
                        </span>
                      )}
                      {ready && <ArrowRight className="w-3.5 h-3.5 text-gray-400" />}
                    </>
                  );
                  return ready ? (
                    <button key={lesson.slug} onClick={() => setSelectedLessonSlug(lesson.slug)} className={cls}>{inner}</button>
                  ) : (
                    <div key={lesson.slug} className={cls}>{inner}</div>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
