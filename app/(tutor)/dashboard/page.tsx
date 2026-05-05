import Sidebar from "@/components/tutor/Sidebar";
import { Sparkles, UserPlus, ArrowUpRight, Send } from "lucide-react";

// Mock data — Phase 2 step 1 is visual approval only. No DB fetches.
const tutor = { name: "Maya" };

const metrics = [
  { label: "Today's sessions", value: 2 },
  { label: "Active courses",   value: 3 },
  { label: "Students",         value: 8 },
];

const todaySessions = [
  { time: "4:00 PM", student: "Ava K.",    course: "Algebra II",    topic: "factoring quadratics" },
  { time: "5:30 PM", student: "Jordan P.", course: "AP Chemistry",  topic: "stoichiometry review" },
];

const needsFollowUp = [
  { student: "Jordan P.", reason: "Struggled with mole ratios",                time: "2 days ago" },
  { student: "Sam T.",    reason: "Missed last session, behind on homework",   time: "4 days ago" },
  { student: "Priya R.",  reason: "Asked for harder problems — push the pace", time: "6 days ago" },
];

const recentChats = [
  { id: "c1", title: "AP Chemistry syllabus" },
  { id: "c2", title: "Jordan — quadratics prep" },
  { id: "c3", title: "Ava recap, April 15" },
  { id: "c4", title: "Priya — advanced problem set" },
  { id: "c5", title: "New course: SAT Math" },
];

const assistantMessages = [
  {
    role: "assistant" as const,
    text: "Morning. 2 sessions today — Ava at 4pm on factoring, Jordan at 5:30 on stoichiometry. Want a prep brief on either?",
  },
];

export default function DashboardPage() {
  return (
    <div className="flex-1 flex min-h-0">
      <Sidebar active="dashboard" recentChats={recentChats} />

      {/* Center column */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-10 py-10">
          <h1 className="text-[18px] font-medium text-gray-900">
            Good morning, {tutor.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            2 sessions today · 3 students need follow-up
          </p>

          {/* Metric cards */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {metrics.map((m) => (
              <div key={m.label} className="bg-gray-100 rounded-xl px-4 py-3.5">
                <div className="text-[11px] font-medium tracking-wider text-gray-500 uppercase">
                  {m.label}
                </div>
                <div className="text-[22px] font-semibold text-gray-900 mt-1.5 leading-none">
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button className="flex items-start gap-3 px-4 py-4 rounded-xl border-2 border-info-600 bg-white hover:bg-info-100/40 transition-colors text-left">
              <Sparkles className="w-4 h-4 text-info-600 mt-0.5 shrink-0" strokeWidth={2} />
              <div>
                <div className="text-sm font-medium text-gray-900">Create a course</div>
                <div className="text-xs text-gray-500 mt-0.5">Guided syllabus builder</div>
              </div>
            </button>
            <button className="flex items-start gap-3 px-4 py-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-left">
              <UserPlus className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" strokeWidth={2} />
              <div>
                <div className="text-sm font-medium text-gray-900">Add a student</div>
                <div className="text-xs text-gray-500 mt-0.5">Profile + session log</div>
              </div>
            </button>
          </div>

          {/* Today's sessions */}
          <section className="mt-8 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <h2 className="text-sm font-medium text-gray-900 px-5 py-3 border-b border-gray-200">
              Today&apos;s sessions
            </h2>
            <ul>
              {todaySessions.map((s, i) => (
                <li
                  key={i}
                  className={
                    "flex items-center px-5 py-3.5 " +
                    (i < todaySessions.length - 1 ? "border-b border-gray-100" : "")
                  }
                >
                  <div className="text-[13px] font-mono text-gray-500 w-[70px] shrink-0">
                    {s.time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900">
                      {s.student}
                      <span className="text-gray-700 mx-1.5">·</span>
                      <span className="text-gray-500">{s.course}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{s.topic}</div>
                  </div>
                  <button className="flex items-center gap-1 text-xs text-info-600 font-medium hover:text-info-700 shrink-0 ml-3">
                    Prep <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Needs follow-up */}
          <section className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
            <h2 className="text-sm font-medium text-gray-900 px-5 py-3 border-b border-gray-200">
              Needs follow-up
            </h2>
            <ul>
              {needsFollowUp.map((f, i) => (
                <li
                  key={i}
                  className={
                    "flex items-center px-5 py-3.5 " +
                    (i < needsFollowUp.length - 1 ? "border-b border-gray-100" : "")
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900">{f.student}</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{f.reason}</div>
                  </div>
                  <div className="text-xs text-gray-500 shrink-0 ml-3">{f.time}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>

      {/* Right rail — persistent Tutor Assistant panel (mock) */}
      <aside className="w-[260px] shrink-0 border-l border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <span
            className="inline-block px-2 py-1 text-[11px] font-medium"
            style={{ backgroundColor: "#E1F5EE", color: "#085041", borderRadius: 10 }}
          >
            Tutor Assistant
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {assistantMessages.map((m, i) => (
            <div key={i} className="text-sm text-gray-700 leading-relaxed">
              {m.text}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 focus-within:border-gray-400 focus-within:bg-white transition-colors">
            <input
              type="text"
              placeholder="Ask anything..."
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-400"
            />
            <button
              type="button"
              aria-label="Send"
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Send className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
