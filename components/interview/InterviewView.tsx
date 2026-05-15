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
import { ChevronLeft, Send, ArrowUp } from "lucide-react";
import { pickQuestions, getQuestionById, countQuestionsBySkill } from "@/lib/agents/interview/questionBank";
import type { InterviewQuestion, InterviewEvaluation, Verdict, Difficulty } from "@/lib/agents/interview/questionBank/types";
import {
  saveSession, generateReport, buildProfileSeed, loadSessions,
  type SkillSession, type ChatMsg,
} from "@/lib/interview/sessionStore";
import { loadCachedQuestions, saveQuestions } from "@/lib/supabase/interviewQuestions";
type View = "welcome" | "active";
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
  resumeFilename,
}: {
  candidateName?: string | null;
  // The active resume's filename. Surfaced on the welcome screen as
  // "Drilling against: {filename}" so the user always sees which
  // resume the session is grounded in. Resume is the heart of every
  // surface — Interview Prep included.
  resumeFilename?: string | null;
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
  const [view, setView] = useState<View>("welcome");
  const [activeSession, setActiveSession] = useState<SkillSession | null>(null);

  function startNewSession(opts: { skill: string; difficulty: "beginner" | "intermediate" | "advanced" | "mixed" }) {
    const id = `session-${Date.now()}`;
    const session: SkillSession = {
      id,
      agent: "skill",
      startedAt: new Date().toISOString(),
      status: "active",
      config: { skill: opts.skill, difficulty: opts.difficulty, count: 3 },
      messages: [],
      questions: [],
    };
    setActiveSession(session);
    setView("active");
  }

  return (
    <div className="flex w-full h-full bg-[#fafaf7] overflow-hidden">
      {view === "welcome" && (
        <WelcomeScreen
          candidateName={candidateName}
          resumeSkills={resumeSkills}
          resumeFilename={resumeFilename}
          onStart={(opts) => startNewSession(opts)}
        />
      )}
      {view === "active" && activeSession && (
        <ActiveSession
          session={activeSession}
          allSessions={[]}
          candidateName={candidateName}
          resumeContext={resumeContext}
          onSessionUpdate={(s) => {
            setActiveSession(s);
            saveSession(s);
          }}
          onExit={() => setView("welcome")}
        />
      )}
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────
// No sessions, no history. Just a chat-style welcome message and skill
// chips with Start buttons inline. Click Start → pick difficulty → drill.

function WelcomeScreen({
  candidateName, resumeSkills, resumeFilename, onStart,
}: {
  candidateName?: string | null;
  resumeSkills?: string[];
  resumeFilename?: string | null;
  onStart: (opts: { skill: string; difficulty: "beginner" | "intermediate" | "advanced" | "mixed" }) => void;
}) {
  // Title-case the first name so "RAHUL" doesn't shout at the user.
  const firstName = (() => {
    const raw = candidateName?.trim().split(/\s+/)[0] ?? "there";
    if (raw === "there") return raw;
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  })();
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
      if (out.length >= 10) break;
    }
    return out;
  }, [resumeSkills]);

  // Every Interview Prep open starts fresh — no auto-jumping into a
  // difficulty picker from a previous session. pickedSkill always
  // initializes to null. lastDifficulty (a preference, not a state)
  // stays remembered so the previous choice is ring-highlighted when
  // the user does pick a skill.
  const [pickedSkill, setPickedSkill] = useState<string | null>(null);
  const [lastDifficulty, setLastDifficulty] = useState<"beginner" | "intermediate" | "advanced" | "mixed">(() => {
    if (typeof window === "undefined") return "mixed";
    const saved = localStorage.getItem("stackle_interview_last_difficulty");
    return (["beginner", "intermediate", "advanced", "mixed"] as const).includes(saved as never)
      ? (saved as "beginner" | "intermediate" | "advanced" | "mixed")
      : "mixed";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("stackle_interview_last_difficulty", lastDifficulty);
  }, [lastDifficulty]);

  function handleStart(diff: "beginner" | "intermediate" | "advanced" | "mixed") {
    if (!pickedSkill) return;
    setLastDifficulty(diff);
    onStart({ skill: pickedSkill, difficulty: diff });
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Welcome bubble — chat-style */}
        <div className="text-[15px] text-gray-800 leading-relaxed mb-2">
          Hey {firstName} — welcome to interview prep.
          {suggestedSkills.length > 0 ? (
            <> Based on your resume, here are skills we can drill. Pick one to start.</>
          ) : (
            <> Upload your resume on the chat surface and I&apos;ll surface skills to drill here.</>
          )}
        </div>
        {/* Resume cue — every session is grounded in a specific resume.
            Resume is the heart, so we show the user exactly which file
            this drill is built around. */}
        {resumeFilename && (
          <div className="text-[12px] text-gray-500 mb-6 inline-flex items-center gap-1.5">
            <span className="inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Drilling against <span className="font-medium text-gray-700">{resumeFilename}</span>
          </div>
        )}

        {suggestedSkills.length > 0 && !pickedSkill && (
          <div className="flex flex-wrap gap-2 mb-6">
            {suggestedSkills.map((skill) => {
              const count = countQuestionsBySkill(skill);
              return (
                <button
                  key={skill}
                  onClick={() => setPickedSkill(skill)}
                  className="inline-flex items-center gap-2 text-[13px] font-medium text-gray-900 bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-900 rounded-full pl-3 pr-1 py-1 shadow-sm transition-all"
                >
                  <span>{skill}</span>
                  {count > 0 && (
                    <span className="text-[11px] text-gray-500">· {count} q{count === 1 ? "" : "s"}</span>
                  )}
                  <span
                    className="inline-flex items-center text-[12px] font-semibold text-black rounded-full px-2.5 py-0.5"
                    style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
                  >
                    Start
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {pickedSkill && (
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[14px] text-gray-800">
                Drill <span className="font-semibold">{pickedSkill}</span> — pick a difficulty.
              </p>
              <button
                onClick={() => setPickedSkill(null)}
                className="text-[12px] text-gray-500 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["beginner", "intermediate", "advanced", "mixed"] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => handleStart(diff)}
                  className={`inline-flex items-center text-[13px] font-semibold text-black rounded-full px-3.5 py-1.5 hover:opacity-90 transition-opacity capitalize ${
                    diff === lastDifficulty ? "ring-2 ring-offset-1 ring-gray-900" : ""
                  }`}
                  style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
  // Time pressure mode (#9). When on, the per-question timer turns amber
  // at 80% of benchmark and red past benchmark. No hard cutoff — visible
  // urgency only. Persisted across reloads.
  const [timePressureOn, setTimePressureOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("stackle_interview_time_pressure") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("stackle_interview_time_pressure", timePressureOn ? "1" : "0");
  }, [timePressureOn]);

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
    // #3 — Drill again chip restarts the session: exit to welcome,
    // localStorage already has skill+difficulty so Start is one tap.
    if (t.toLowerCase().startsWith("drill again")) {
      onExit();
      return;
    }
    // #7 — "Walk me through this answer" expands to a real prompt the
    // Skill Agent can answer as a senior interviewer doing a post-mortem.
    if (t.toLowerCase() === "walk me through this answer") {
      pushUser(t);
      await callSkillAgent([
        ...messages,
        { role: "user", content: "Walk me through how I should have approached this answer step by step. Cite what I missed and what the strong-hire version of this answer would look like — 4–6 sentences." },
      ]);
      return;
    }
    pushUser(t);
    await callSkillAgent([...messages, { role: "user", content: t }]);
  }

  async function callSkillAgent(history: ChatMsg[]) {
    setStreaming(true);
    // history.length IS the placeholder index after we push the empty
    // assistant message — it's where the placeholder lands.
    //   handleSubmit:    history = [...messages, userMsg] → length = N+1
    //   auto-greet:      history = []                       → length = 0
    //   post-eval:       history = messages.concat(synth)   → length = N+1
    // The old `messages.length + 1` assumed a user push always happened
    // and left the auto-greet path (no user push) writing to an
    // undefined slot, so the streamed response never appeared.
    const placeholderIdx = history.length;
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
      // the same turn — read the LATEST config from the tool batch
      // first, falling back to React state.
      const liveSkill = (input.skill as string) ?? config.skill;
      const liveDiffRaw = (input.difficulty as string) ?? config.difficulty;
      const liveCount = (input.count as number) ?? config.count;

      // Welcome UI emits beginner/intermediate/advanced; the bank +
      // API use easy/medium/hard. Map here so both worlds agree.
      const diffMap: Record<string, Difficulty | "mixed"> = {
        beginner: "easy",
        intermediate: "medium",
        advanced: "hard",
        easy: "easy",
        medium: "medium",
        hard: "hard",
        mixed: "mixed",
      };
      const liveDiff: Difficulty | "mixed" = diffMap[liveDiffRaw?.toLowerCase()] ?? "medium";

      // Build the seen-ids list from past sessions so the cache returns
      // questions the user hasn't drilled before. Variety > repetition.
      const seenIds = new Set<string>();
      try {
        const allSessions = loadSessions();
        for (const s of allSessions) {
          for (const q of s.questions ?? []) {
            if (q.questionId) seenIds.add(q.questionId);
          }
        }
      } catch { /* localStorage may be off — fine */ }

      // Cache lookup first (only meaningful when difficulty is not "mixed").
      // "mixed" implies the user wants a spread, so we don't trust a
      // bucket-filtered cache to deliver that — we go straight to gen.
      const fallbackDifficulty: Difficulty = liveDiff === "mixed" ? "medium" : liveDiff;
      let cached: InterviewQuestion[] = [];
      if (liveDiff !== "mixed") {
        try {
          const rows = await loadCachedQuestions({
            skill: liveSkill,
            difficulty: liveDiff,
            excludeIds: Array.from(seenIds),
            limit: liveCount,
          });
          cached = rows.map((r) => r.payload);
        } catch (err) {
          console.warn("[start_session] cache lookup failed:", err);
        }
      }

      const needed = Math.max(0, liveCount - cached.length);
      if (needed === 0) {
        // Full cache hit — skip generation entirely.
        pushAssistant(`Pulling ${cached.length} ${liveDiff} ${liveSkill} question${cached.length === 1 ? "" : "s"} from your saved set.`);
        setQuestions(cached);
        setQuestionIdx(0);
        setAnswer(cached[0]?.starterCode ?? "");
        setPhase("running");
        return;
      }

      // Partial or no cache → generate the delta and save.
      pushAssistant(
        cached.length > 0
          ? `Pulling ${cached.length} from cache + generating ${needed} fresh ${liveDiff} ${liveSkill} question${needed === 1 ? "" : "s"}…`
          : `Generating ${needed} ${liveDiff} ${liveSkill} question${needed === 1 ? "" : "s"}…`,
      );

      try {
        const res = await fetch("/api/agents/interview/generate-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skill: liveSkill,
            difficulty: liveDiff,
            count: needed,
            resumeContext,
          }),
        });
        if (!res.ok) throw new Error(`generate-questions HTTP ${res.status}`);
        const data = await res.json() as { questions: InterviewQuestion[] };
        const fresh = data.questions ?? [];

        // Save the freshly-generated questions to the cache. Resume-
        // grounded ones are scoped per-user; generic ones (no resume
        // context) are shareable. We don't know which is which per
        // question here, so heuristic: if resumeContext was provided,
        // mark the batch resume-grounded.
        if (fresh.length > 0) {
          saveQuestions({
            questions: fresh,
            resumeGrounded: !!resumeContext,
          }).catch(() => { /* best-effort */ });
        }

        const combined = [...cached, ...fresh].slice(0, liveCount);
        if (combined.length === 0) {
          const bankFallback = pickQuestions({ skill: liveSkill, difficulty: fallbackDifficulty, count: liveCount });
          if (bankFallback.length === 0) {
            pushAssistant(`Couldn't generate ${liveSkill} questions. Try a different skill?`, []);
            return;
          }
          setQuestions(bankFallback);
          setQuestionIdx(0);
          setAnswer(bankFallback[0].starterCode ?? "");
          setPhase("running");
          return;
        }
        setQuestions(combined);
        setQuestionIdx(0);
        setAnswer(combined[0].starterCode ?? "");
        setPhase("running");
      } catch (err) {
        console.error("[start_session] generator failed, falling back to bank:", err);
        const qs = pickQuestions({ skill: liveSkill, difficulty: fallbackDifficulty, count: liveCount });
        const combined = [...cached, ...qs].slice(0, liveCount);
        if (combined.length === 0) {
          pushAssistant(`Couldn't generate ${liveSkill} questions right now. Try again or pick a different skill?`, []);
          return;
        }
        setQuestions(combined);
        setQuestionIdx(0);
        setAnswer(combined[0].starterCode ?? "");
        setPhase("running");
      }
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
        // Dynamically-generated questions have ids prefixed "gen-" that
        // aren't in the static bank. Send the full question inline so
        // the evaluator can score them; static-bank questions just send
        // the id (server looks it up).
        body: JSON.stringify(
          q.id.startsWith("gen-")
            ? { question: q, answer }
            : { questionId: q.id, answer },
        ),
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
        "",
        "**How you were graded:** clarity of logic · correctness · edge cases · style.",
      ].join("\n");

      // #5 — typewriter the verdict into chat instead of dropping the
      // whole block at once. Replace the "Evaluating..." placeholder
      // with progressively-more-text. Cadence: ~6ms/char (fast enough
      // to feel responsive, slow enough to feel alive). The chip row
      // ("Walk me through this answer") attaches once the text settles.
      setMessages((m) => {
        const next = m.slice(0, -1);
        next.push({ role: "assistant", content: "" });
        return next;
      });
      const placeholderIdx = messages.length; // after slice(-1) + push
      const total = verdictText.length;
      const chunkSize = Math.max(1, Math.floor(total / 80));
      for (let i = 0; i < total; i += chunkSize) {
        const slice = verdictText.slice(0, Math.min(total, i + chunkSize));
        setMessages((m) => {
          const next = [...m];
          if (next[placeholderIdx]) next[placeholderIdx] = { role: "assistant", content: slice };
          return next;
        });
        await new Promise((r) => setTimeout(r, 14));
      }
      setMessages((m) => {
        const next = [...m];
        if (next[placeholderIdx]) {
          next[placeholderIdx] = {
            role: "assistant",
            content: verdictText,
            chips: ["Walk me through this answer", "Next question"],
          };
        }
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
      [`Drill again — ${config.skill} ${config.difficulty}`, "Try a new skill"],
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
            <ChevronLeft size={16} /> Back
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
                <button
                  onClick={() => setTimePressureOn((v) => !v)}
                  title="Toggle time pressure mode — timer turns red past benchmark"
                  className={`text-[10px] uppercase tracking-wider font-semibold rounded-full px-2 py-0.5 border transition-colors ${
                    timePressureOn
                      ? "bg-rose-50 border-rose-300 text-rose-700"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
                  }`}
                >
                  ⏱ Pressure
                </button>
                <div
                  className="text-[12px] font-mono tabular-nums"
                  style={{
                    color: !timePressureOn
                      ? "#6b7280"
                      : timer >= currentQ.timeBenchmarkSeconds
                      ? "#dc2626"
                      : timer >= 0.8 * currentQ.timeBenchmarkSeconds
                      ? "#d97706"
                      : "#6b7280",
                  }}
                >
                  {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
                  <span className="text-gray-300"> · bench {Math.floor(currentQ.timeBenchmarkSeconds / 60)}:{String(currentQ.timeBenchmarkSeconds % 60).padStart(2, "0")}</span>
                </div>
              </div>
            </div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                // #4 — Cmd/Ctrl+Enter submits without leaving the keyboard.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (phase === "running" && answer.trim().length >= 5) submitAnswer();
                }
              }}
              spellCheck={false}
              disabled={phase === "evaluating"}
              className="flex-1 w-full bg-[#1a1a1a] text-emerald-100 font-mono text-[13px] leading-relaxed p-5 focus:outline-none disabled:opacity-60"
              placeholder="Write your query here…  (⌘/Ctrl+Enter to submit)"
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


// Drill recommendations — Phase 4. Pulls weakest sub-categories from
// completed sessions and produces a prioritised punch list of "drill

// Friday Forecast — Phase 2. Aggregates completed sessions into a single
// readiness % the user can act on. Heuristic, not LLM:
//   readiness = avg(score across recent completed sessions, weighted to recent)
//   bonus +5 if 3+ sessions in last 7 days (consistency)
//   bonus +5 if difficulty mix includes hard
//   capped 0-100
//

// Lightweight markdown render for assistant bubbles — handles **bold** only.
function renderAssistant(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}
