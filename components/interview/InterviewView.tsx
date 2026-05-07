"use client";

// ── Stackle Interview Prep — V2 architecture ──────────────────────────────
//
// Three-layer agent pattern lives behind this view:
//   Layer 1: Stackle Orchestrator (Haiku, /api/agents/orchestrator) — routes
//            new chats across verticals (Resume / Interview / etc.)
//   Layer 2: Interview Manager (lib/agents/interview/interviewManager.ts) —
//            picks which sub-agent runs for THIS session.
//   Layer 3: Skill Agent (Sonnet, /api/agents/interview/skill) — owns the
//            chat for skill-drill sessions. Tools: set_session_config,
//            start_session, next_question, skip_question, end_session,
//            request_hint.
//
// The Verdict Evaluator (separate single-purpose agent) grades submitted
// answers via /api/interview/evaluate. The Skill Agent invokes it.
//
// Three views inside Interview Prep:
//   - "sessions": ChatGPT-style list of past sessions + "+ New Session"
//   - "active":   chat-first session with code editor canvas
//   - "report":   frozen replay of a past session

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus, Send, ArrowUp, FileText, RotateCcw } from "lucide-react";
import { pickQuestions, getQuestionById } from "@/lib/agents/interview/questionBank";
import type { InterviewQuestion, InterviewEvaluation, Verdict, Difficulty } from "@/lib/agents/interview/questionBank/types";
import {
  loadSessions, saveSession, deleteSession, generateReport, buildProfileSeed,
  type SkillSession, type ChatMsg, type SessionReport,
} from "@/lib/interview/sessionStore";
import { interviewManagerWelcome, pickInterviewSubAgent } from "@/lib/agents/interview/interviewManager";

type View = "sessions" | "active" | "report";
type Phase = "lens" | "config" | "running" | "evaluating" | "verdict" | "done";

const VERDICT_COLOURS: Record<Verdict, { fg: string; bg: string; label: string }> = {
  strong_hire: { fg: "#1D9E75", bg: "#E8F5EE", label: "Strong Hire" },
  hire:        { fg: "#639922", bg: "#F0F7E6", label: "Hire" },
  soft_pass:   { fg: "#BA7517", bg: "#FBEFD8", label: "Soft Pass" },
  no_hire:     { fg: "#A32D2D", bg: "#FBE6E6", label: "No Hire" },
};

export default function InterviewView({ candidateName }: { candidateName?: string | null }) {
  const [view, setView] = useState<View>("sessions");
  const [sessions, setSessions] = useState<SkillSession[]>([]);
  const [activeSession, setActiveSession] = useState<SkillSession | null>(null);
  const [reportSession, setReportSession] = useState<SkillSession | null>(null);

  // Hydrate on mount.
  useEffect(() => { setSessions(loadSessions()); }, []);

  function refreshSessions() { setSessions(loadSessions()); }

  function startNewSession() {
    const id = `session-${Date.now()}`;
    const session: SkillSession = {
      id,
      agent: "skill",
      startedAt: new Date().toISOString(),
      status: "active",
      config: { skill: "SQL", difficulty: "mixed", count: 3 },
      messages: [],
      questions: [],
    };
    setActiveSession(session);
    setView("active");
  }

  function openReport(s: SkillSession) {
    setReportSession(s);
    setView("report");
  }

  return (
    <div className="flex w-full h-full bg-[#fafaf7] overflow-hidden">
      {view === "sessions" && (
        <SessionsList
          sessions={sessions}
          candidateName={candidateName}
          onNew={startNewSession}
          onOpen={openReport}
          onDelete={(id) => { deleteSession(id); refreshSessions(); }}
        />
      )}
      {view === "active" && activeSession && (
        <ActiveSession
          session={activeSession}
          allSessions={sessions}
          candidateName={candidateName}
          onSessionUpdate={(s) => {
            setActiveSession(s);
            saveSession(s);
            if (s.status === "completed") refreshSessions();
          }}
          onExit={() => { setView("sessions"); refreshSessions(); }}
        />
      )}
      {view === "report" && reportSession && (
        <ReportView
          session={reportSession}
          onBack={() => setView("sessions")}
        />
      )}
    </div>
  );
}

// ── Sessions list (ChatGPT-style) ─────────────────────────────────────────

function SessionsList({
  sessions, candidateName, onNew, onOpen, onDelete,
}: {
  sessions: SkillSession[];
  candidateName?: string | null;
  onNew: () => void;
  onOpen: (s: SkillSession) => void;
  onDelete: (id: string) => void;
}) {
  const firstName = candidateName?.trim().split(/\s+/)[0] ?? "there";
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Hey {firstName} — interview prep.</h1>
        <p className="text-sm text-gray-600 mb-8">Each session is its own chat. Start a new one or revisit a past report.</p>

        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black mb-8"
        >
          <Plus size={16} /> New Session
        </button>

        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
            <p className="text-sm text-gray-500">No sessions yet. Run your first one — it builds your readiness profile.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-xl border border-gray-200 bg-white px-5 py-3 flex items-center justify-between hover:border-gray-400 transition-colors">
                <button onClick={() => onOpen(s)} className="flex-1 text-left">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[14px] font-semibold text-gray-900">{s.config.skill}</span>
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{s.config.difficulty}</span>
                    {s.report && (
                      <span className="text-[12px] tabular-nums" style={{ color: VERDICT_COLOURS[topVerdict(s.report.verdictDistribution)].fg }}>
                        {s.report.averageScore}/100
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 ml-auto mr-3">{relativeTime(s.completedAt ?? s.startedAt)}</span>
                  </div>
                  {s.report && (
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      {Object.entries(s.report.verdictDistribution).filter(([, n]) => n > 0).map(([v, n]) => `${n} ${VERDICT_COLOURS[v as Verdict].label}`).join(" · ")}
                      {s.report.weakestSubcategory ? ` · weakest: ${s.report.weakestSubcategory}` : ""}
                    </p>
                  )}
                </button>
                <button
                  onClick={() => { if (confirm("Delete this session?")) onDelete(s.id); }}
                  className="text-[11px] text-gray-400 hover:text-rose-600 px-2"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function topVerdict(dist: Record<Verdict, number>): Verdict {
  const order: Verdict[] = ["strong_hire", "hire", "soft_pass", "no_hire"];
  for (const v of order) if (dist[v] > 0) return v;
  return "no_hire";
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Active session ────────────────────────────────────────────────────────

function ActiveSession({
  session, allSessions, candidateName, onSessionUpdate, onExit,
}: {
  session: SkillSession;
  allSessions: SkillSession[];
  candidateName?: string | null;
  onSessionUpdate: (s: SkillSession) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("lens");
  const [config, setConfig] = useState(session.config);
  const [messages, setMessages] = useState<ChatMsg[]>(session.messages);
  const [composer, setComposer] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Active question state.
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const profileSeed = useMemo(
    () => buildProfileSeed(allSessions.filter((s) => s.id !== session.id)),
    [allSessions, session.id],
  );

  // First-mount: ask the Interview Manager for the lens welcome.
  useEffect(() => {
    if (messages.length > 0) return;
    const welcome = interviewManagerWelcome(candidateName);
    pushAssistant(welcome.text, welcome.chips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll chat.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Persist session updates as the chat moves.
  useEffect(() => {
    onSessionUpdate({ ...session, messages, config, status: phase === "done" ? "completed" : "active" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, config, phase]);

  // Question timer.
  useEffect(() => {
    if (phase !== "running") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setTimer(0);
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase, questionIdx]);

  function pushAssistant(content: string, chips?: string[]) {
    setMessages((m) => [...m, { role: "assistant", content, chips }]);
  }
  function pushUser(content: string) {
    setMessages((m) => [...m, { role: "user", content }]);
  }

  async function handleUserInput(text: string) {
    const t = text.trim();
    if (!t) return;
    pushUser(t);

    // Lens phase — Interview Manager handles deterministically.
    if (phase === "lens") {
      const route = pickInterviewSubAgent(t);
      if (route.comingSoon) {
        pushAssistant(route.comingSoonText ?? "Coming soon. Drill a skill instead?", ["Skill drill", "Cancel"]);
        return;
      }
      if (route.subAgent === "skill") {
        setPhase("config");
        // Hand to Skill Agent.
        await callSkillAgent([
          ...messages,
          { role: "user", content: t },
        ]);
        return;
      }
      pushAssistant("Pick a lens — skill, role, company, or JD?", ["Skill drill", "By role (soon)", "By company (soon)", "By JD (soon)"]);
      return;
    }

    // Config / running / verdict / done — Skill Agent drives.
    await callSkillAgent([...messages, { role: "user", content: t }]);
  }

  async function callSkillAgent(history: ChatMsg[]) {
    setStreaming(true);
    const placeholderIdx = messages.length + 1; // after user push
    pushAssistant("");

    try {
      const res = await fetch("/api/agents/interview/skill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          sessionState: {
            phase,
            config,
            questionIdx,
            totalQuestions: questions.length,
            currentQuestion: questions[questionIdx]
              ? { subcategory: questions[questionIdx].subcategory, difficulty: questions[questionIdx].difficulty, prompt: questions[questionIdx].prompt }
              : undefined,
            candidateName,
          },
          profileSeed,
        }),
      });
      if (!res.ok || !res.body) throw new Error("skill-agent HTTP error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let chips: string[] = [];
      const toolEvents: { name: string; input: Record<string, unknown> }[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const frame = JSON.parse(data);
            if (frame.kind === "text") {
              acc += frame.text;
              setMessages((m) => {
                const next = [...m];
                if (next[placeholderIdx]) next[placeholderIdx] = { role: "assistant", content: acc };
                return next;
              });
            } else if (frame.kind === "tool") {
              toolEvents.push({ name: frame.name, input: frame.input ?? {} });
            } else if (frame.kind === "chips") {
              chips = frame.chips ?? [];
            }
          } catch { /* skip malformed */ }
        }
      }

      // Strip [CHIPS] line from acc, attach chips to the message.
      const cleaned = acc.replace(/\n*\[CHIPS\][^\n]*$/i, "").trim();
      setMessages((m) => {
        const next = [...m];
        if (next[placeholderIdx]) next[placeholderIdx] = { role: "assistant", content: cleaned, chips: chips.length > 0 ? chips : undefined };
        return next;
      });

      // Dispatch tool calls.
      for (const evt of toolEvents) {
        await dispatchTool(evt.name, evt.input);
      }
    } catch (err) {
      console.error("[skill-agent]", err);
      setMessages((m) => {
        const next = [...m];
        next[placeholderIdx] = { role: "assistant", content: "Hit a snag — try again?" };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  async function dispatchTool(name: string, input: Record<string, unknown>) {
    if (name === "set_session_config") {
      setConfig((c) => ({
        skill: typeof input.skill === "string" ? input.skill : c.skill,
        difficulty: typeof input.difficulty === "string" ? input.difficulty : c.difficulty,
        count: typeof input.count === "number" ? input.count : c.count,
      }));
    } else if (name === "start_session") {
      const qs = pickQuestions({ skill: config.skill, difficulty: config.difficulty as Difficulty | "mixed", count: config.count });
      if (qs.length === 0) {
        pushAssistant("No questions for that combo — pick something else?", ["SQL Easy", "SQL Medium", "SQL Mixed"]);
        return;
      }
      setQuestions(qs);
      setQuestionIdx(0);
      setAnswer(qs[0].starterCode ?? "");
      setPhase("running");
    } else if (name === "next_question") {
      const next = questionIdx + 1;
      if (next >= questions.length) {
        endSession();
        return;
      }
      setQuestionIdx(next);
      setAnswer(questions[next].starterCode ?? "");
      setPhase("running");
    } else if (name === "skip_question") {
      const q = questions[questionIdx];
      onSessionUpdate({
        ...session,
        questions: [
          ...session.questions,
          { questionId: q.id, answer: "(skipped)", evaluation: { verdict: "no_hire", score: 0, reasoning: "Skipped.", whatWorked: [], whatMissed: ["Skipped."], pushToStrong: "Take a real attempt next time." } },
        ],
      });
      const next = questionIdx + 1;
      if (next >= questions.length) {
        endSession();
        return;
      }
      setQuestionIdx(next);
      setAnswer(questions[next].starterCode ?? "");
      setPhase("running");
    } else if (name === "end_session") {
      endSession();
    } else if (name === "request_hint") {
      // No-op at the UI level — the agent's narration includes the hint
      // text. The tool call is purely a signal we can use later for
      // analytics or to highlight the hint visually.
    }
  }

  async function submitAnswer() {
    const q = questions[questionIdx];
    if (!q) return;
    setPhase("evaluating");
    pushUser("(submitted)");
    pushAssistant("Evaluating...");

    try {
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, answer }),
      });
      if (!res.ok) throw new Error("evaluate failed");
      const data = await res.json() as { evaluation: InterviewEvaluation };

      // Replace the "Evaluating..." placeholder with the verdict.
      const v = VERDICT_COLOURS[data.evaluation.verdict];
      const verdictText = [
        `**${v.label}** · ${data.evaluation.score}/100`,
        data.evaluation.reasoning,
        ...(data.evaluation.whatWorked.length ? ["", "**What worked**", ...data.evaluation.whatWorked.map((s) => "• " + s)] : []),
        ...(data.evaluation.whatMissed.length ? ["", "**What missed**", ...data.evaluation.whatMissed.map((s) => "• " + s)] : []),
        "",
        `**To push to Strong Hire:** ${data.evaluation.pushToStrong}`,
      ].join("\n");
      setMessages((m) => {
        const next = m.slice(0, -1);
        next.push({ role: "assistant", content: verdictText });
        return next;
      });

      // Record the answered question in the session.
      onSessionUpdate({
        ...session,
        questions: [...session.questions, { questionId: q.id, answer, evaluation: data.evaluation }],
      });

      const isLast = questionIdx + 1 >= questions.length;
      if (isLast) {
        endSession();
      } else {
        pushAssistant("Ready for the next one?", ["Next question", "End session"]);
        setPhase("verdict");
      }
    } catch (err) {
      console.error(err);
      setMessages((m) => {
        const next = m.slice(0, -1);
        next.push({ role: "assistant", content: "Couldn't evaluate — try again?" });
        return next;
      });
      setPhase("running");
    }
  }

  function endSession() {
    const answered = session.questions;
    const orderedQuestions = answered.map((a) => getQuestionById(a.questionId)).filter((q): q is InterviewQuestion => !!q);
    const report = generateReport(orderedQuestions, answered);
    const finalSession: SkillSession = {
      ...session,
      messages,
      config,
      questions: answered,
      report,
      status: "completed",
      completedAt: new Date().toISOString(),
    };
    saveSession(finalSession);
    onSessionUpdate(finalSession);
    pushAssistant(
      `Session complete. Average ${report.averageScore}/100. ${report.weakestSubcategory ? `Weakest: ${report.weakestSubcategory}.` : ""} ${report.recommendedNext}`,
      ["Run another", "Back to sessions"],
    );
    setPhase("done");
  }

  const currentQ = questions[questionIdx];
  const showCanvas = phase === "running" || phase === "evaluating";

  return (
    <div className="flex w-full h-full">
      {/* Left — chat */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-gray-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
          <button onClick={onExit} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <ChevronLeft size={16} /> Sessions
          </button>
          <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{phase}</span>
        </div>
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              return (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                  <div className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl px-4 py-2.5 bg-gray-900 text-white text-[14px]"
                      : "max-w-[85%] text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap"
                  }>
                    {m.role === "assistant" ? renderAssistant(m.content) : m.content}
                    {m.role === "assistant" && m.chips && m.chips.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {m.chips.map((c) => (
                          <button
                            key={c}
                            onClick={() => isLast && !streaming && handleUserInput(c)}
                            disabled={!isLast || streaming}
                            className={`text-[12px] px-3 py-1 rounded-full border transition-colors ${
                              isLast && !streaming ? "bg-white border-gray-300 hover:border-gray-500 text-gray-800" : "bg-gray-50 border-gray-200 text-gray-400"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border-t border-gray-200 bg-white px-6 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <input
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && composer.trim()) {
                  const v = composer.trim();
                  setComposer("");
                  handleUserInput(v);
                }
              }}
              placeholder={phase === "running" ? "Use the editor on the right; type here for a hint" : "Type a reply..."}
              disabled={streaming}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-[14px] focus:outline-none focus:border-violet-500 disabled:opacity-50"
            />
            <button
              onClick={() => {
                const v = composer.trim();
                if (!v) return;
                setComposer("");
                handleUserInput(v);
              }}
              disabled={!composer.trim() || streaming}
              className="p-2 rounded-lg bg-gray-900 text-white disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Right — code editor canvas (only during running/evaluating) */}
      <div className="flex flex-col" style={{ width: showCanvas ? "45%" : "0", minWidth: showCanvas ? "420px" : "0", transition: "width 220ms ease" }}>
        {showCanvas && currentQ && (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
              <div className="text-[11px] font-semibold tracking-wider uppercase text-gray-500">
                {currentQ.subcategory} · {currentQ.difficulty}
              </div>
              <div className="text-[12px] text-gray-500 font-mono tabular-nums">
                {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
                <span className="text-gray-300"> · bench {Math.floor(currentQ.timeBenchmarkSeconds / 60)}:{String(currentQ.timeBenchmarkSeconds % 60).padStart(2, "0")}</span>
              </div>
            </div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              spellCheck={false}
              disabled={phase === "evaluating"}
              className="flex-1 w-full bg-[#1a1a1a] text-emerald-100 font-mono text-[13px] leading-relaxed p-5 focus:outline-none disabled:opacity-60"
              placeholder="Write your query here..."
            />
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-white">
              <span className="text-[12px] text-gray-500">{answer.trim().length} chars</span>
              <button
                onClick={submitAnswer}
                disabled={phase === "evaluating" || answer.trim().length < 5}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-[13px] font-medium hover:bg-black disabled:opacity-50"
              >
                {phase === "evaluating" ? "Evaluating..." : "Submit"} <Send size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Frozen report view ────────────────────────────────────────────────────

function ReportView({ session, onBack }: { session: SkillSession; onBack: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-4">
          <ChevronLeft size={16} /> Sessions
        </button>

        <div className="flex items-baseline gap-3 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">{session.config.skill} · {session.config.difficulty}</h1>
          <span className="text-[12px] text-gray-500">{relativeTime(session.completedAt ?? session.startedAt)}</span>
        </div>

        {session.report && <ReportSummary report={session.report} />}

        <h2 className="text-sm font-semibold text-gray-900 mt-8 mb-3 uppercase tracking-wider">Replay</h2>
        <div className="space-y-3">
          {session.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
              <div className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl px-4 py-2.5 bg-gray-900 text-white text-[13px]"
                  : "max-w-[85%] text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap rounded-2xl px-4 py-2.5 bg-white border border-gray-200"
              }>
                {m.role === "assistant" ? renderAssistant(m.content) : m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportSummary({ report }: { report: SessionReport }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="grid grid-cols-3 gap-5">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Average</div>
          <div className="text-2xl font-semibold text-gray-900 tabular-nums">{report.averageScore}<span className="text-base text-gray-400">/100</span></div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Weakest</div>
          <div className="text-sm font-medium text-rose-700">{report.weakestSubcategory || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Strongest</div>
          <div className="text-sm font-medium text-emerald-700">{report.strongestSubcategory || "—"}</div>
        </div>
      </div>
      <p className="text-[13px] text-gray-700 mt-4 italic">{report.recommendedNext}</p>
      <div className="flex gap-2 mt-4 text-[11px]">
        {(Object.keys(VERDICT_COLOURS) as Verdict[]).filter((v) => report.verdictDistribution[v] > 0).map((v) => (
          <span key={v} className="px-2 py-0.5 rounded" style={{ background: VERDICT_COLOURS[v].bg, color: VERDICT_COLOURS[v].fg }}>
            {report.verdictDistribution[v]} {VERDICT_COLOURS[v].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Lightweight markdown render for assistant bubbles — handles **bold** only.
function renderAssistant(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}
