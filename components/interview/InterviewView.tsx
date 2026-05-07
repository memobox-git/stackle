"use client";

// ── Stackle Interview Prep — chat-first ──────────────────────────────────
//
// Layout: chat on the left, code editor canvas on the right. Same shape
// as Resume Builder. The chat IS the product — entry, setup, questions,
// live reactions, verdicts all happen in chat. The right panel is the
// canvas where the code is written.
//
// No SaaS tile grid. No standalone forecast card. The conversation drives
// everything.

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, ArrowUp } from "lucide-react";
import { pickQuestions, listSkills } from "@/lib/agents/interview/questionBank";
import type { InterviewQuestion, InterviewEvaluation, Verdict, Difficulty } from "@/lib/agents/interview/questionBank/types";

type ChatMsg =
  | { role: "assistant"; content: string; chips?: string[] }
  | { role: "user"; content: string };

type Phase = "lens" | "skill" | "level" | "count" | "running" | "evaluating" | "verdict" | "done";

const VERDICT_COLOURS: Record<Verdict, { fg: string; bg: string; label: string }> = {
  strong_hire: { fg: "#1D9E75", bg: "#E8F5EE", label: "Strong Hire" },
  hire:        { fg: "#639922", bg: "#F0F7E6", label: "Hire" },
  soft_pass:   { fg: "#BA7517", bg: "#FBEFD8", label: "Soft Pass" },
  no_hire:     { fg: "#A32D2D", bg: "#FBE6E6", label: "No Hire" },
};

export default function InterviewView({ candidateName }: { candidateName?: string | null }) {
  const firstName = (candidateName ?? "").trim().split(/\s+/)[0] || "there";
  const skills = useMemo(() => listSkills(), []);

  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    {
      role: "assistant",
      content: `Hey ${firstName} — let's get you ready. Drill a specific skill, prep for a target role, target a company, or paste a JD?`,
      chips: ["By skill", "By role (soon)", "By company (soon)", "Paste a JD (soon)"],
    },
  ]);
  const [phase, setPhase] = useState<Phase>("lens");
  const [skill, setSkill] = useState<string>("SQL");
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [count, setCount] = useState<number>(3);

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [timer, setTimer] = useState(0);
  const [composer, setComposer] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const verdictsRef = useRef<{ q: InterviewQuestion; e: InterviewEvaluation }[]>([]);

  // Auto-scroll chat to bottom when messages land.
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, phase]);

  // Timer ticks while a question is live.
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

  function handleChip(label: string) {
    pushUser(label);
    handleUserMessage(label);
  }

  function handleUserMessage(text: string) {
    const t = text.trim();
    if (!t) return;
    if (phase === "lens") {
      // Only "By skill" is wired in Phase 1. Other lenses respond gracefully.
      if (/^by\s+skill$/i.test(t)) {
        setPhase("skill");
        pushAssistant(`Which skill — ${skills.join(", ")}, or something else?`,
          [...skills, "Surprise me"]);
      } else if (/role|company|jd|job\s+description|paste/i.test(t)) {
        pushAssistant("That lens is coming in Phase 3 — it pulls company patterns and JD specifics. For now, want to drill a skill?",
          ["By skill", "Tell me when it's ready"]);
      } else {
        // Treat free text as a skill name.
        setSkill(t);
        setPhase("level");
        pushAssistant(`${t} it is. What level — easy, medium, hard, or mixed?`,
          ["Easy", "Medium", "Hard", "Mixed"]);
      }
    } else if (phase === "skill") {
      const matched = skills.find((s) => s.toLowerCase() === t.toLowerCase());
      const chosen = matched ?? t;
      setSkill(chosen);
      setPhase("level");
      pushAssistant(`${chosen}. Level — easy, medium, hard, or mixed?`,
        ["Easy", "Medium", "Hard", "Mixed"]);
    } else if (phase === "level") {
      const lc = t.toLowerCase();
      const d: Difficulty | "mixed" = lc.startsWith("e") ? "easy" : lc.startsWith("m") && lc.includes("ix") ? "mixed" : lc.startsWith("m") ? "medium" : lc.startsWith("h") ? "hard" : "mixed";
      setDifficulty(d);
      setPhase("count");
      pushAssistant(`${d.charAt(0).toUpperCase() + d.slice(1)}. How many — quick (3), standard (5), or full (10)?`,
        ["Quick (3)", "Standard (5)", "Full (10)"]);
    } else if (phase === "count") {
      const m = t.match(/(\d+)/);
      const n = m ? Math.max(1, Math.min(20, parseInt(m[1], 10))) : 3;
      setCount(n);
      startSession(skill, difficulty, n);
    } else if (phase === "verdict" || phase === "done") {
      // After-session free chat: simple replies for now.
      if (/another|again|more|next/i.test(t)) {
        // Reset to lens.
        setPhase("lens");
        verdictsRef.current = [];
        setQuestions([]);
        setQuestionIdx(0);
        setAnswer("");
        pushAssistant("Restarting. Drill a specific skill, prep for a role, target a company, or paste a JD?",
          ["By skill", "By role (soon)", "By company (soon)", "Paste a JD (soon)"]);
      } else {
        pushAssistant("Type 'another' for a fresh session, or close the tab when you're done.");
      }
    }
  }

  function startSession(s: string, d: Difficulty | "mixed", n: number) {
    const qs = pickQuestions({ skill: s, difficulty: d, count: n });
    if (qs.length === 0) {
      pushAssistant("No questions match that combo yet — try a different skill or level.",
        ["By skill", "Easy", "Medium"]);
      setPhase("lens");
      return;
    }
    setQuestions(qs);
    setQuestionIdx(0);
    setAnswer(qs[0].starterCode ?? "");
    verdictsRef.current = [];
    pushAssistant(`Locked in: ${s} · ${d} · ${n} ${n === 1 ? "question" : "questions"}. Editor on the right is yours. Submit when you're done.`);
    pushAssistant(`Question 1 of ${n} — ${qs[0].subcategory}\n\n${qs[0].prompt}\n\n${qs[0].contextSetup}\n\nSample data: ${qs[0].sampleData}`);
    setPhase("running");
  }

  async function submitAnswer() {
    const q = questions[questionIdx];
    if (!q) return;
    pushUser("(submitted)");
    setPhase("evaluating");
    pushAssistant("Evaluating...");
    try {
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, answer }),
      });
      if (!res.ok) throw new Error("evaluate failed");
      const data = await res.json() as { evaluation: InterviewEvaluation };
      verdictsRef.current.push({ q, e: data.evaluation });

      // Replace the "Evaluating..." placeholder with the real verdict.
      setMessages((m) => {
        const next = m.slice(0, -1);
        const v = VERDICT_COLOURS[data.evaluation.verdict];
        const lines: string[] = [
          `**${v.label}** · ${data.evaluation.score}/100`,
          data.evaluation.reasoning,
          "",
          ...(data.evaluation.whatWorked.length ? ["**What worked**", ...data.evaluation.whatWorked.map((s) => "• " + s)] : []),
          ...(data.evaluation.whatMissed.length ? ["", "**What missed**", ...data.evaluation.whatMissed.map((s) => "• " + s)] : []),
          "",
          `**To push to Strong Hire:** ${data.evaluation.pushToStrong}`,
        ];
        next.push({ role: "assistant", content: lines.join("\n") });
        return next;
      });
      setPhase("verdict");

      const isLast = questionIdx + 1 >= questions.length;
      if (isLast) {
        const total = verdictsRef.current.length;
        const avg = total === 0 ? 0 : Math.round(verdictsRef.current.reduce((s, x) => s + x.e.score, 0) / total);
        const dist = verdictsRef.current.reduce<Record<Verdict, number>>((acc, x) => {
          acc[x.e.verdict] = (acc[x.e.verdict] ?? 0) + 1;
          return acc;
        }, { strong_hire: 0, hire: 0, soft_pass: 0, no_hire: 0 });
        const distText = (Object.keys(VERDICT_COLOURS) as Verdict[])
          .filter((v) => dist[v] > 0)
          .map((v) => `${dist[v]} ${VERDICT_COLOURS[v].label}`)
          .join(" · ");
        pushAssistant(`Session complete. Average ${avg}/100 — ${distText}. Want another round?`,
          ["Drill weak area", "Run another", "Jump to behaviorals (soon)"]);
        setPhase("done");
      } else {
        // Auto-advance: short prompt to keep flow.
        pushAssistant("Ready for the next one?", ["Next question"]);
      }
    } catch (err) {
      console.error(err);
      setMessages((m) => {
        const next = m.slice(0, -1);
        next.push({ role: "assistant", content: "Couldn't evaluate the answer — temporary outage. Try again?" });
        return next;
      });
      setPhase("running");
    }
  }

  function nextQuestion() {
    const next = questionIdx + 1;
    if (next >= questions.length) return;
    setQuestionIdx(next);
    const q = questions[next];
    setAnswer(q.starterCode ?? "");
    pushAssistant(`Question ${next + 1} of ${questions.length} — ${q.subcategory}\n\n${q.prompt}\n\n${q.contextSetup}\n\nSample data: ${q.sampleData}`);
    setPhase("running");
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const currentQ = questions[questionIdx];
  const showCanvas = phase === "running" || phase === "evaluating";

  return (
    <div className="flex w-full h-full bg-[#fafaf7] overflow-hidden">
      {/* Left — chat */}
      <div className="flex-1 min-w-0 flex flex-col border-r border-gray-200">
        {/* Chat thread */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
                <div className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl px-4 py-2.5 bg-gray-900 text-white text-[14px]"
                    : "max-w-[85%] text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap"
                }>
                  {m.role === "assistant"
                    ? renderAssistant(m.content)
                    : m.content}
                  {m.role === "assistant" && m.chips && m.chips.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {m.chips.map((c) => {
                        // Click-to-act on the chip — phase-aware so we
                        // don't re-fire chips from old messages.
                        const isLast = i === messages.length - 1;
                        return (
                          <button
                            key={c}
                            onClick={() => isLast && handleChip(c)}
                            disabled={!isLast}
                            className={`text-[12px] px-3 py-1 rounded-full border transition-colors ${
                              isLast ? "bg-white border-gray-300 hover:border-gray-500 text-gray-800 cursor-pointer" : "bg-gray-50 border-gray-200 text-gray-400 cursor-default"
                            }`}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {phase === "verdict" && questionIdx + 1 < questions.length && (
              <div className="flex">
                <button
                  onClick={nextQuestion}
                  className="text-[13px] px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black"
                >
                  Next question →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 bg-white px-6 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            <input
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && composer.trim()) {
                  const v = composer.trim();
                  setComposer("");
                  pushUser(v);
                  handleUserMessage(v);
                }
              }}
              placeholder={phase === "running" ? "Use the editor on the right; type here for help" : "Type a reply..."}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-[14px] focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={() => {
                const v = composer.trim();
                if (!v) return;
                setComposer("");
                pushUser(v);
                handleUserMessage(v);
              }}
              disabled={!composer.trim()}
              className="p-2 rounded-lg bg-gray-900 text-white disabled:opacity-30"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Right — canvas (code editor when a question is active) */}
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

// Lightweight markdown-ish render for the assistant bubble — bold via **,
// preserves whitespace via whitespace-pre-wrap on the wrapping div.
function renderAssistant(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}
