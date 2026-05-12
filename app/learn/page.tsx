// Stackle Learn — index page.
//
// Phase 0: lists the DE Fundamentals track only, with all 4 modules and
// every lesson. Free lessons link; "Coming soon" lessons are dimmed but
// visible so the user sees the full curriculum scope. The hero pulls
// the user back to the chat if they want resume-driven lessons instead
// (Phase 1).

import Link from "next/link";
import { CURRICULUM } from "@/lib/learn/curriculum";
import { Lock, Clock, ArrowRight, CheckCircle2 } from "lucide-react";

export default function LearnIndex() {
  const track = CURRICULUM[0]; // de-fundamentals
  const allLessons = track.modules.flatMap((m) => m.lessons);
  const readyCount = allLessons.filter((l) => l.status === "ready").length;
  const totalMinutes = allLessons.reduce((s, l) => s + l.minutes, 0);

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-black text-xs font-bold"
              style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
            >S</div>
            <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Stackle</span>
            <span className="text-xs text-gray-400">/ Learn</span>
          </Link>
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">Back to app →</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-12 pb-10">
        <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-violet-700 mb-3">Track · Data Engineering</p>
        <h1 className="text-[40px] leading-[1.1] font-bold text-gray-900 mb-4">DE Fundamentals</h1>
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

      {/* Modules */}
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
                  const cls = `flex items-center gap-3 px-4 py-3 transition-colors ${ready ? "hover:bg-gray-50 cursor-pointer" : "opacity-60 cursor-not-allowed"}`;
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
                    <Link key={lesson.slug} href={`/learn/${track.track}/${lesson.slug}`} className={cls}>{inner}</Link>
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
