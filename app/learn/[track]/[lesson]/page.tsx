// Stackle Learn — single lesson reader.
//
// Phase 0: renders the lesson's markdown content with a slim sidebar
// showing the parent module's other lessons. Premium gating is
// cosmetic for now — clicking a Premium lesson shows a "Coming with
// paywall in Phase 4" banner instead of unlocking content.

import Link from "next/link";
import { notFound } from "next/navigation";
import { findLesson, getTrack } from "@/lib/learn/curriculum";
import { getLessonContent } from "@/lib/learn/lessons";
import LessonMarkdown from "@/components/LessonMarkdown";
import { Clock, ChevronLeft, Lock, CheckCircle2 } from "lucide-react";

interface PageProps {
  params: Promise<{ track: string; lesson: string }>;
}

export default async function LessonPage({ params }: PageProps) {
  const { track: trackSlug, lesson: lessonSlug } = await params;
  const found = findLesson(trackSlug, lessonSlug);
  if (!found) notFound();
  const { module, lesson } = found;
  const track = getTrack(trackSlug)!;
  const content = getLessonContent(trackSlug, lessonSlug);

  // Build prev/next within the whole track (not just module) for a
  // natural reading-order traversal.
  const flatLessons = track.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleSlug: m.slug })));
  const idx = flatLessons.findIndex((l) => l.slug === lessonSlug);
  const prev = idx > 0 ? flatLessons[idx - 1] : null;
  const next = idx < flatLessons.length - 1 ? flatLessons[idx + 1] : null;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/learn" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <ChevronLeft className="w-4 h-4" /> All lessons
          </Link>
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">Back to app →</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-10 pb-20 flex gap-10">
        {/* Sidebar — module TOC */}
        <aside className="hidden md:block w-64 flex-shrink-0">
          <div className="sticky top-24">
            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-gray-500 mb-3">{module.title}</p>
            <ul className="space-y-1">
              {module.lessons.map((l) => {
                const isCurrent = l.slug === lessonSlug;
                const ready = l.status === "ready";
                const cls = `block px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  isCurrent
                    ? "bg-violet-50 text-violet-900 font-medium border-l-2 border-violet-600"
                    : ready
                      ? "text-gray-700 hover:bg-gray-100"
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
                      <Link href={`/learn/${trackSlug}/${l.slug}`} className={cls}>{inner}</Link>
                    ) : (
                      <div className={cls}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Main reader */}
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

          {/* Prev / next */}
          <div className="mt-14 pt-6 border-t border-gray-200 flex items-center justify-between gap-4">
            {prev ? (
              <Link href={`/learn/${trackSlug}/${prev.slug}`} className="group flex-1 text-left">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">← Previous</p>
                <p className="text-[14px] text-gray-900 font-medium group-hover:text-violet-700">{prev.title}</p>
              </Link>
            ) : <div className="flex-1" />}
            {next ? (
              <Link href={`/learn/${trackSlug}/${next.slug}`} className="group flex-1 text-right">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Next →</p>
                <p className="text-[14px] text-gray-900 font-medium group-hover:text-violet-700">{next.title}</p>
              </Link>
            ) : <div className="flex-1" />}
          </div>
        </main>
      </div>
    </div>
  );
}
