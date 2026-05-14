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
type View = "sessions" | "active" | "report";
// Simplified phase state — only what affects UI surface visibility:
//   "idle"        : agent collecting config or chatting; no question active
//   "running"     : a question is live, code editor visible, timer ticking
//   "evaluating"  : answer submitted, evaluator running
//   "done"        : session report generated, agent offers next move
// All routing decisions (skill / company / difficulty / count / hints /
// skip / next / end) live IN the agent, NOT in this state machine.
type Phase = "idle" | "running" | "evaluating" | "done";

const VERDICT_COLOURS: Record<Verdict, { fg: string; bg: string; label: string }> = {
  strong_hire: { fg: "#1D9E75", bg: "#E8F5EE", label: "Strong Hire" },
  hire:        { fg: "#639922", bg: "#F0F7E6", label: "Hire" },
  soft_pass:   { fg: "#BA7517", bg: "#FBEFD8", label: "Soft Pass" },
  no_hire:     { fg: "#A32D2D", bg: "#FBE6E6", label: "No Hire" },
};

export default function InterviewView({
  candidateName,
  resumeSkills,
  resumeContext,
}: {
  candidateName?: string | null;
  // Top skills extracted from the user's primary resume. Surfaced as
  // quick-start chips in the lobby — click → goes straight to a drill
  // on that skill. Empty / undefined → no chips, classic 'New Session'
  // entry still works.
  resumeSkills?: string[];
  // Compact slice of the user's resume passed through to the Skill
  // Agent so it can ground questions in real projects (e.g. "Walk me
  // through your Medallia event pipeline dedup strategy") instead of
  // generic SQL.
  resumeContext?: {
    topRole?: string | null;
    topCompany?: string | null;
    yearsExperience?: number | null;
    experiences?: Array<{ title: string; company: string; bullets: string[] }>;
    topSkills?: string[];
  } | null;
}) {
  const [view, setView] = useState<View>("sessions");
  const [sessions, setSessions] = useState<SkillSession[]>([]);
  const [activeSession, setActiveSession] = useState<SkillSession | null>(null);
  const [reportSession, setReportSession] = useState<SkillSession | null>(null);

  // Hydrate on mount.
  useEffect(() => { setSessions(loadSessions()); }, []);

  function refreshSessions() { setSessions(loadSessions()); }

  function startNewSession(opts?: { skill?: string; difficulty?: "beginner" | "intermediate" | "advanced" | "mixed" }) {
    const id = `session-${Date.now()}`;
    const session: SkillSession = {
      id,
      agent: "skill",
      startedAt: new Date().toISOString(),
      status: "active",
      config: {
        skill: opts?.skill ?? "SQL",
        difficulty: opts?.difficulty ?? "mixed",
        count: 3,
      },
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
          resumeSkills={resumeSkills}
          onNew={(opts) => startNewSession(opts)}
          onOpen={openReport}
          onDelete={(id) => { deleteSession(id); refreshSessions(); }}
        />
      )}
      {view === "active" && activeSession && (
        <ActiveSession
          session={activeSession}
          allSessions={sessions}
          candidateName={candidateName}
          resumeContext={resumeContext}
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
  sessions, candidateName, resumeSkills, onNew, onOpen, onDelete,
}: {
  sessions: SkillSession[];
  candidateName?: string | null;
  resumeSkills?: string[];
  onNew: (opts?: { skill?: string; difficulty?: "beginner" | "intermediate" | "advanced" | "mixed" }) => void;
  onOpen: (s: SkillSession) => void;
  onDelete: (id: string) => void;
}) {
  const firstName = candidateName?.trim().split(/\s+/)[0] ?? "there";
  const forecast = useMemo(() => buildFridayForecast(sessions), [sessions]);
  // Curate the resume skills into a tight list of interview-relevant
  // ones. We filter to canonical tech skills (anything more than 2 chars
  // and that looks tech-y) and cap at 8. The user can still click 'New
  // Session' for anything else.
  const suggestedSkills = useMemo(() => {
    if (!resumeSkills || resumeSkills.length === 0) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of resumeSkills) {
      const s = raw.trim();
      if (!s || s.length < 2 || s.length > 30) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= 8) break;
    }
    return out;
  }, [resumeSkills]);
  // Which skill the user clicked → swaps the chip row into a 4-button
  // difficulty picker for that skill. Click a difficulty → drill begins.
  const [pickedSkill, setPickedSkill] = useState<string | null>(null);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Hey {firstName} — interview prep.</h1>
        <p className="text-sm text-gray-600 mb-6">Each session is its own chat. Start a new one or revisit a past report.</p>

        {/* Friday Forecast — Phase 2. Readiness % aggregated across past
            completed sessions. Empty state nudges the first run. */}
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4 mb-4">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold">Friday Forecast</span>
            <span className="text-[11px] text-violet-700">{forecast.sessionCount === 0 ? "no data yet" : `${forecast.sessionCount} session${forecast.sessionCount !== 1 ? "s" : ""}`}</span>
          </div>
          {forecast.sessionCount === 0 ? (
            <p className="text-[13.5px] text-violet-900 leading-relaxed">Run your first session to start tracking interview readiness — the more you drill, the sharper this gets.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-3xl font-semibold text-violet-900 tabular-nums">{forecast.readiness}%</span>
                <span className="text-[12px] text-violet-700">interview-ready</span>
              </div>
              <p className="text-[13px] text-violet-800 leading-relaxed">
                {forecast.message}
              </p>
            </>
          )}
        </div>

        {/* Skill breakdown + drill recommendations — Phase 2 + 4.
            Surfaces only when there's enough data (1+ completed sessions).
            Bars per skill + a punch list of "drill these next" derived
            from weakest sub-categories across completed sessions. */}
        {forecast.sessionCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
            <SkillBreakdown sessions={sessions} />
            <DrillRecommendations sessions={sessions} />
          </div>
        )}

        {/* Suggested-from-resume skill chips. Click a skill → swaps
            this row into a difficulty picker → click a difficulty →
            session starts straight on that skill. */}
        {suggestedSkills.length > 0 && !pickedSkill && (
          <div className="mb-6">
            <p className="text-[11px] uppercase tracking-[0.1em] text-gray-500 font-semibold mb-2">
              Suggested for you · from your resume
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedSkills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => setPickedSkill(skill)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-800 bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-900 rounded-full px-3 py-1.5 shadow-sm transition-all"
                >
                  <span>{skill}</span>
                  <span className="text-gray-400 text-[11px]">▸ Start</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {pickedSkill && (
          <div className="mb-6 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[13px] text-violet-900">
                Drill <span className="font-semibold">{pickedSkill}</span> — pick a difficulty.
              </p>
              <button
                onClick={() => setPickedSkill(null)}
                className="text-[12px] text-violet-700 hover:text-violet-900"
              >
                Cancel
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["beginner", "intermediate", "advanced", "mixed"] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => onNew({ skill: pickedSkill, difficulty: diff })}
                  className="inline-flex items-center text-[13px] font-medium text-white bg-violet-700 hover:bg-violet-800 rounded-full px-3.5 py-1.5 transition-colors capitalize"
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Past sessions list. The 'New Session' button + 'No sessions
            yet' empty card were removed — the suggested-skill chips
            above already invite the first drill. A small secondary
            'Pick a different skill' link appears at the bottom of the
            list for free-form picks. */}
        {sessions.length > 0 && (
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

        {/* Secondary 'Pick a different skill' link — only when there are
            no suggestions OR the user wants something off-resume. */}
        {(suggestedSkills.length === 0 || sessions.length > 0) && !pickedSkill && (
          <button
            onClick={() => onNew()}
            className="mt-6 text-[13px] text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline transition-colors"
          >
            Or pick a different skill
          </button>
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
  session, allSessions, candidateName, resumeContext, onSessionUpdate, onExit,
}: {
  session: SkillSession;
  allSessions: SkillSession[];
  candidateName?: string | null;
  // When the user has a parsed resume loaded, we pass a compact slice
  // through so the Skill Agent can ground questions in real projects.
  resumeContext?: {
    topRole?: string | null;
    topCompany?: string | null;
    yearsExperience?: number | null;
    experiences?: Array<{ title: string; company: string; bullets: string[] }>;
    topSkills?: string[];
  } | null;
  onSessionUpdate: (s: SkillSession) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
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
  // Adaptive difficulty: the most recent verdict drives the next
  // question's pitch. Set after every evaluation, passed to the Skill
  // Agent on the next call.
  const [lastVerdict, setLastVerdict] = useState<Verdict | null>(null);

  // Company persona — set by the Skill Agent calling
  // set_session_config({company: ...}). Passed back into sessionState
  // on subsequent calls so the agent keeps the persona context.
  const [companyKey, setCompanyKey] = useState<string | null>(null);
  const companyPersona = useMemo(() => {
    if (!companyKey) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCompanyPersona } = require("@/lib/agents/interview/companies") as typeof import("@/lib/agents/interview/companies");
    const p = getCompanyPersona(companyKey);
    if (!p) return null;
    return {
      name: p.name,
      interviewStyle: p.interviewStyle,
      questionEmphasis: p.questionEmphasis,
      culturalSignals: p.culturalSignals,
      redFlagsInAnswers: p.redFlagsInAnswers,
    };
  }, [companyKey]);

  const profileSeed = useMemo(
    () => buildProfileSeed(allSessions.filter((s) => s.id !== session.id)),
    [allSessions, session.id],
  );

  // First-mount auto-greet: when the chat is empty, ping the Skill Agent
  // with no user message so it generates the welcome itself. The agent's
  // system prompt knows how to open. No hardcoded greeting.
  const greetedRef = useRef(false);
  useEffect(() => {
    if (greetedRef.current) return;
    if (messages.length > 0) return;
    greetedRef.current = true;
    callSkillAgent([]);
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

  // Single input handler — every user message routes to the Skill Agent.
  // No state-machine branching. The agent decides what to do (greet, set
  // config, start session, give hint, advance, end) via tools.
  async function handleUserInput(text: string) {
    const t = text.trim();
    if (!t) return;
    pushUser(t);
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
            companyPersona,
          },
          profileSeed,
          // Resume context + adaptive-difficulty signal — passes the
          // user's real projects through so the agent can ask about
          // them, and the previous question's verdict so the agent
          // can pitch the next question harder/easier accordingly.
          resumeContext,
          lastVerdict,
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
      // Apply partial config updates. Company gets stored in companyKey
      // state which feeds back as companyPersona on the next agent call.
      if (typeof input.company === "string" && input.company.trim()) {
        setCompanyKey(input.company.toLowerCase());
      }
      setConfig((c) => ({
        skill: typeof input.skill === "string" ? input.skill : c.skill,
        difficulty: typeof input.difficulty === "string" ? input.difficulty : c.difficulty,
        count: typeof input.count === "number" ? input.count : c.count,
      }));
    } else if (name === "start_session") {
      // The agent sometimes calls set_session_config + start_session in
      // the same turn — read the LATEST config including any updates from
      // the same tool batch. We snapshot from the React closure but
      // the agent's text already has the right framing.
      // To handle "do SQL medium 3" in one shot, peek at the most recent
      // set_session_config call's input if present; otherwise use config.
      const liveSkill = (input.skill as string) ?? config.skill;
      const liveDiff = (input.difficulty as string) ?? config.difficulty;
      const liveCount = (input.count as number) ?? config.count;
      const qs = pickQuestions({
        skill: liveSkill,
        difficulty: (liveDiff as Difficulty | "mixed"),
        count: liveCount,
      });
      if (qs.length === 0) {
        pushAssistant("No questions for that combo yet — try a different combo?", []);
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
      if (q) {
        onSessionUpdate({
          ...session,
          questions: [
            ...session.questions,
            { questionId: q.id, answer: "(skipped)", evaluation: { verdict: "no_hire", score: 0, reasoning: "Skipped.", whatWorked: [], whatMissed: ["Skipped."], pushToStrong: "Take a real attempt next time." } },
          ],
        });
      }
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
      // Agent's narration carries the hint text. Tool fire is a UI
      // signal we can wire into analytics or visual highlighting later.
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
      setLastVerdict(data.evaluation.verdict);
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
        // Drop back to idle so the chat UI doesn't show the canvas while
        // the agent narrates. The agent will call next_question() when
        // the user signals readiness.
        setPhase("idle");
        // Let the Skill Agent narrate next-step in chat.
        await callSkillAgent(messages.concat({ role: "user" as const, content: "(answer evaluated, see verdict above)" }));
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
          {phase === "running" && (
            <span className="text-[11px] uppercase tracking-wider text-violet-600 font-medium">In progress</span>
          )}
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
              placeholder={phase === "running" ? "Type for help, or write your code on the right..." : "Say what you want to drill — \"SQL medium 3\" or just chat..."}
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
              <div className="flex items-center gap-3">
                <ConfidenceMeter answer={answer} question={currentQ} />
                <div className="text-[12px] text-gray-500 font-mono tabular-nums">
                  {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
                  <span className="text-gray-300"> · bench {Math.floor(currentQ.timeBenchmarkSeconds / 60)}:{String(currentQ.timeBenchmarkSeconds % 60).padStart(2, "0")}</span>
                </div>
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

            {/* Helper chips — Phase 2. Free, fast assists that don't
                spoil the answer. Hint and Trap route through the chat
                so the Skill Agent answers; Starter pre-fills; Skip
                advances. */}
            {phase === "running" && (
              <div className="flex items-center gap-2 px-5 py-2 border-t border-gray-100 bg-gray-50 flex-wrap">
                <button
                  onClick={() => handleUserInput("Give me a hint without spoiling the answer.")}
                  disabled={streaming}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-50"
                >Hint</button>
                <button
                  onClick={() => handleUserInput("I'm stuck — point me toward the right approach.")}
                  disabled={streaming}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-50"
                >I'm stuck</button>
                <button
                  onClick={() => handleUserInput("What's the trap on this one?")}
                  disabled={streaming}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-50"
                >What's the trap?</button>
                <button
                  onClick={() => setAnswer(currentQ.starterCode ?? "")}
                  disabled={streaming}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-700 hover:border-gray-400 disabled:opacity-50"
                  title="Restore the starter template"
                >Starter</button>
                <button
                  onClick={() => handleUserInput("Skip this question.")}
                  disabled={streaming}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-500 hover:border-rose-300 hover:text-rose-700 ml-auto disabled:opacity-50"
                >Skip</button>
              </div>
            )}

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

// Confidence meter — Phase 2 closure. Heuristic, no LLM. Updates as the
// candidate types. Three signals:
//   - keyword coverage: % of question.expectedKeywords present in answer
//   - length: 0 if too short (<25 chars), 1 if 25-200 chars, 0.7 if >200
//     (overly verbose sometimes hides confusion)
//   - syntax: 0 if obvious red flags (banned starters, "I don't know"),
//     1 otherwise
// Final score = 0.6 * keyword + 0.3 * length + 0.1 * syntax → 0-100.
//
// Intentionally generous — we want to encourage attempts. Truth-of-the-
// matter scoring lives in the post-submission verdict evaluator (real LLM).
function ConfidenceMeter({ answer, question }: { answer: string; question: InterviewQuestion }) {
  const score = useMemo(() => {
    const txt = (answer ?? "").trim().toLowerCase();
    if (txt.length === 0) return 0;

    // Keyword coverage.
    const expected = (question.expectedKeywords ?? []).map((k) => k.toLowerCase());
    const hits = expected.filter((k) => txt.includes(k.toLowerCase())).length;
    const kw = expected.length === 0 ? 1 : hits / expected.length;

    // Length signal.
    let len = 0;
    if (txt.length >= 25 && txt.length <= 400) len = 1;
    else if (txt.length > 400) len = 0.7;
    else len = txt.length / 25;

    // Syntax red flags — empty + giving-up phrases.
    const redFlags = /\b(i don'?t know|no idea|not sure|skip this|gibberish)\b/i;
    const syntax = redFlags.test(txt) ? 0 : 1;

    return Math.round((0.6 * kw + 0.3 * len + 0.1 * syntax) * 100);
  }, [answer, question]);

  const colour = score >= 70 ? "#1D9E75" : score >= 40 ? "#BA7517" : "#A32D2D";
  return (
    <div className="flex items-center gap-2" title="Confidence (heuristic) — final verdict comes from the evaluator on submit">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">conf</div>
      <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${score}%`, background: colour }} />
      </div>
      <div className="text-[11px] font-medium tabular-nums" style={{ color: colour }}>{score}%</div>
    </div>
  );
}

// Skill breakdown — Phase 2 closure. Bars per skill the user has drilled,
// coloured by avg score (red <60, amber 60-74, green 75+).
function SkillBreakdown({ sessions }: { sessions: SkillSession[] }) {
  const completed = sessions.filter((s) => s.status === "completed" && s.report);
  // Aggregate per skill.
  const perSkill: Record<string, { sum: number; count: number }> = {};
  for (const s of completed) {
    const k = s.config.skill;
    if (!perSkill[k]) perSkill[k] = { sum: 0, count: 0 };
    perSkill[k].sum += s.report?.averageScore ?? 0;
    perSkill[k].count += 1;
  }
  const rows = Object.entries(perSkill).map(([skill, v]) => ({ skill, avg: Math.round(v.sum / v.count), count: v.count }));
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.avg - a.avg);

  function barColor(avg: number): string {
    if (avg >= 75) return "#1D9E75";
    if (avg >= 60) return "#BA7517";
    return "#A32D2D";
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-3">Skill breakdown</div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.skill}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[13px] text-gray-800">{r.skill}</span>
              <span className="text-[11px] text-gray-500 tabular-nums">{r.avg}/100 · {r.count} session{r.count !== 1 ? "s" : ""}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${r.avg}%`, background: barColor(r.avg) }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Drill recommendations — Phase 4. Pulls weakest sub-categories from
// completed sessions and produces a prioritised punch list of "drill
// these next" items. Same data surface Friday Forecast uses, framed as
// concrete next moves.
function DrillRecommendations({ sessions }: { sessions: SkillSession[] }) {
  const completed = sessions.filter((s) => s.status === "completed" && s.report);
  // Tally weakest sub-categories by frequency.
  const tally: Record<string, { count: number; lastSeenAt: string }> = {};
  for (const s of completed) {
    const k = s.report?.weakestSubcategory;
    if (!k) continue;
    if (!tally[k]) tally[k] = { count: 0, lastSeenAt: s.completedAt ?? s.startedAt };
    tally[k].count += 1;
    if ((s.completedAt ?? s.startedAt) > tally[k].lastSeenAt) tally[k].lastSeenAt = s.completedAt ?? s.startedAt;
  }
  const rows = Object.entries(tally)
    .map(([sub, v]) => ({ sub, count: v.count, lastSeenAt: v.lastSeenAt }))
    .sort((a, b) => b.count - a.count || b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-3">Drill these next</div>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.sub} className="flex items-baseline gap-3">
            <span className="text-[11px] text-gray-400 tabular-nums w-4">{i + 1}.</span>
            <span className="flex-1 text-[13px] text-gray-800">{r.sub}</span>
            <span className="text-[11px] text-rose-600">flagged {r.count}×</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
        Start a session and ask for these specifically — the agent will lean into them.
      </p>
    </div>
  );
}

// Friday Forecast — Phase 2. Aggregates completed sessions into a single
// readiness % the user can act on. Heuristic, not LLM:
//   readiness = avg(score across recent completed sessions, weighted to recent)
//   bonus +5 if 3+ sessions in last 7 days (consistency)
//   bonus +5 if difficulty mix includes hard
//   capped 0-100
//
// Returns a friendly message tailored to readiness band so the user
// always has a clear next move.
function buildFridayForecast(sessions: SkillSession[]): {
  sessionCount: number;
  readiness: number;
  message: string;
} {
  const completed = sessions.filter((s) => s.status === "completed" && s.report);
  if (completed.length === 0) {
    return { sessionCount: 0, readiness: 0, message: "" };
  }

  // Sort newest first.
  const sorted = completed.slice().sort((a, b) =>
    (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt),
  );
  const recentN = sorted.slice(0, 5);
  const avg = Math.round(recentN.reduce((s, x) => s + (x.report?.averageScore ?? 0), 0) / recentN.length);

  // Consistency bonus: 3+ sessions in last 7 days.
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = sorted.filter((s) => new Date(s.completedAt ?? s.startedAt).getTime() >= sevenDaysAgo).length;
  const consistencyBonus = recentCount >= 3 ? 5 : 0;

  // Difficulty bonus: any hard sessions in the mix.
  const hardBonus = completed.some((s) => s.config.difficulty === "hard") ? 5 : 0;

  const readiness = Math.max(0, Math.min(100, avg + consistencyBonus + hardBonus));

  let message = "";
  if (readiness >= 85) {
    message = "Recruiter-ready. Time to start applying — you're past the practice threshold.";
  } else if (readiness >= 70) {
    message = "Solid baseline. A few more hard-difficulty drills will get you to recruiter-ready.";
  } else if (readiness >= 55) {
    message = `Mid-pack. Drill ${recentN[0].report?.weakestSubcategory ?? "your weakest area"} — that's where you're leaking the most points.`;
  } else {
    message = "Early days. Consistency matters more than score right now — aim for one session a day.";
  }

  return { sessionCount: completed.length, readiness, message };
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
