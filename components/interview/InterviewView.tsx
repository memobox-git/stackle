"use client";

// ── Stackle Interview Prep — Phase 1 MVP ──────────────────────────────────
//
// Single-component view that handles the full flow:
//   entry → setup → session → verdict → done
//
// Phase 2+ adds: live reactions, confidence meter, helper chips, Friday
// Forecast dashboard, company personas, JD parser, code editor (CodeMirror),
// pricing enforcement, Supabase persistence. This MVP uses localStorage
// and a styled textarea.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Code, Briefcase, Building2, FileText, ArrowRight, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { pickQuestions, listSkills } from "@/lib/agents/interview/questionBank";
import type { InterviewQuestion, InterviewEvaluation, Verdict, Difficulty, InterviewSession } from "@/lib/agents/interview/questionBank/types";

type View = "entry" | "setup" | "session" | "verdict" | "done";

const VERDICT_COLOURS: Record<Verdict, { fg: string; bg: string; label: string }> = {
  strong_hire: { fg: "#1D9E75", bg: "#E8F5EE", label: "Strong Hire" },
  hire:        { fg: "#639922", bg: "#F0F7E6", label: "Hire" },
  soft_pass:   { fg: "#BA7517", bg: "#FBEFD8", label: "Soft Pass" },
  no_hire:     { fg: "#A32D2D", bg: "#FBE6E6", label: "No Hire" },
};

const STORAGE_KEY = "stackle_interview_sessions";

function loadSessions(): InterviewSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveSession(s: InterviewSession) {
  try {
    const all = loadSessions();
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.unshift(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 50)));
  } catch { /* non-fatal */ }
}

export default function InterviewView({ candidateName }: { candidateName?: string | null }) {
  const [view, setView] = useState<View>("entry");
  const [skill, setSkill] = useState<string>("SQL");
  const [difficulty, setDifficulty] = useState<Difficulty | "mixed">("mixed");
  const [count, setCount] = useState<number>(3);

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<InterviewEvaluation | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [history, setHistory] = useState<{ q: InterviewQuestion; a: string; e: InterviewEvaluation }[]>([]);
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const skills = useMemo(() => listSkills(), []);

  // Tick the timer while we're inside an active question.
  useEffect(() => {
    if (view !== "session") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    setTimer(0);
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [view, questionIdx]);

  function startSession() {
    const qs = pickQuestions({ skill, difficulty, count });
    if (qs.length === 0) {
      alert("No questions available for that filter. Try a different skill or difficulty.");
      return;
    }
    const id = `session-${Date.now()}`;
    setSessionId(id);
    setQuestions(qs);
    setQuestionIdx(0);
    setAnswer(qs[0].starterCode ?? "");
    setEvaluation(null);
    setHistory([]);
    setView("session");
    saveSession({
      id, startedAt: new Date().toISOString(),
      lens: "skill",
      context: { skill, difficulty, count },
      questions: qs.map((q) => ({ questionId: q.id })),
      status: "active",
    });
  }

  async function submitAnswer() {
    const q = questions[questionIdx];
    if (!q || evaluating) return;
    setEvaluating(true);
    try {
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.id, answer }),
      });
      if (!res.ok) throw new Error("evaluate failed");
      const data = await res.json() as { evaluation: InterviewEvaluation };
      setEvaluation(data.evaluation);
      setHistory((h) => [...h, { q, a: answer, e: data.evaluation }]);
      setView("verdict");
    } catch (err) {
      console.error(err);
      alert("Couldn't evaluate the answer. Try again.");
    } finally {
      setEvaluating(false);
    }
  }

  function nextQuestion() {
    const next = questionIdx + 1;
    if (next >= questions.length) {
      // Persist completed session.
      saveSession({
        id: sessionId,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        lens: "skill",
        context: { skill, difficulty, count },
        questions: history.map(({ q, a, e }) => ({ questionId: q.id, answer: a, evaluation: e })),
        status: "completed",
      });
      setView("done");
      return;
    }
    setQuestionIdx(next);
    setAnswer(questions[next].starterCode ?? "");
    setEvaluation(null);
    setView("session");
  }

  function backToEntry() {
    setView("entry");
    setEvaluation(null);
    setQuestions([]);
    setHistory([]);
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#fafaf7] overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-8">
        {view === "entry" && (
          <EntryScreen candidateName={candidateName} onPick={(lens) => {
            if (lens !== "skill") {
              alert("Coming in Phase 3 — for now, jump in with the Skill lens.");
              return;
            }
            setView("setup");
          }} />
        )}

        {view === "setup" && (
          <SetupScreen
            skill={skill} setSkill={setSkill}
            difficulty={difficulty} setDifficulty={setDifficulty}
            count={count} setCount={setCount}
            skills={skills}
            onBack={backToEntry}
            onStart={startSession}
          />
        )}

        {view === "session" && questions[questionIdx] && (
          <SessionScreen
            question={questions[questionIdx]}
            questionNumber={questionIdx + 1}
            totalQuestions={questions.length}
            answer={answer}
            setAnswer={setAnswer}
            timer={timer}
            evaluating={evaluating}
            onSubmit={submitAnswer}
            onSkip={() => {
              setHistory((h) => [...h, {
                q: questions[questionIdx],
                a: "(skipped)",
                e: { verdict: "no_hire" as const, score: 0, reasoning: "Skipped.", whatWorked: [], whatMissed: ["You skipped this question."], pushToStrong: "Try not to skip on the real interview." },
              }]);
              nextQuestion();
            }}
          />
        )}

        {view === "verdict" && evaluation && questions[questionIdx] && (
          <VerdictScreen
            evaluation={evaluation}
            question={questions[questionIdx]}
            isLast={questionIdx + 1 >= questions.length}
            onNext={nextQuestion}
          />
        )}

        {view === "done" && (
          <DoneScreen history={history} onRestart={backToEntry} />
        )}
      </div>
    </div>
  );
}

// ── Subviews ──────────────────────────────────────────────────────────────

function EntryScreen({ candidateName, onPick }: { candidateName?: string | null; onPick: (lens: "skill" | "role" | "company" | "jd") => void }) {
  const firstName = (candidateName ?? "").trim().split(/\s+/)[0] || "there";
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Hey {firstName} — let's get you ready.</h1>
      <p className="text-sm text-gray-600 mb-8">Practice with questions calibrated to real interviews. How do you want to start?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <LensCard icon={Code}      title="By Skill"  blurb="Drill specific weak areas (SQL, Python, Spark…)" available onClick={() => onPick("skill")} />
        <LensCard icon={Briefcase} title="By Role"   blurb="Practice for your target role." onClick={() => onPick("role")} />
        <LensCard icon={Building2} title="By Company" blurb="Tailored to a company's interview patterns." onClick={() => onPick("company")} />
        <LensCard icon={FileText}  title="By JD"      blurb="Paste a job description; we calibrate to it." accent onClick={() => onPick("jd")} />
      </div>

      <div className="rounded-lg bg-white border border-gray-200 px-5 py-4 text-sm text-gray-600">
        <span className="font-medium text-gray-900">Friday Forecast:</span> No data yet. Run a calibration session to start tracking readiness.
      </div>
    </div>
  );
}

function LensCard({
  icon: Icon, title, blurb, available, accent, onClick,
}: { icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; title: string; blurb: string; available?: boolean; accent?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border bg-white px-5 py-5 transition-all hover:border-gray-400 hover:shadow-sm ${accent ? "border-emerald-200" : "border-gray-200"}`}
    >
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-3 ${accent ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
        <Icon size={18} strokeWidth={2} />
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-base font-semibold text-gray-900">{title}</span>
        {!available && <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Soon</span>}
      </div>
      <p className="text-sm text-gray-600 leading-snug">{blurb}</p>
    </button>
  );
}

function SetupScreen({
  skill, setSkill, difficulty, setDifficulty, count, setCount, skills, onBack, onStart,
}: {
  skill: string; setSkill: (s: string) => void;
  difficulty: Difficulty | "mixed"; setDifficulty: (d: Difficulty | "mixed") => void;
  count: number; setCount: (c: number) => void;
  skills: string[]; onBack: () => void; onStart: () => void;
}) {
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
        <ChevronLeft size={16} /> Back
      </button>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Set up your session</h1>
      <p className="text-sm text-gray-600 mb-8">Pick the skill, difficulty, and length. We'll generate questions on demand.</p>

      <div className="space-y-7">
        <Field label="Which skill?">
          <ChipRow value={skill} onChange={setSkill} options={skills.map((s) => ({ value: s, label: s }))} />
        </Field>

        <Field label="What level?">
          <ChipRow
            value={difficulty}
            onChange={(v) => setDifficulty(v as Difficulty | "mixed")}
            options={[
              { value: "easy", label: "Easy" },
              { value: "medium", label: "Medium" },
              { value: "hard", label: "Hard" },
              { value: "mixed", label: "Mixed" },
            ]}
          />
        </Field>

        <Field label="How many questions?">
          <ChipRow
            value={String(count)}
            onChange={(v) => setCount(parseInt(v, 10))}
            options={[
              { value: "3", label: "Quick (3)" },
              { value: "5", label: "Standard (5)" },
              { value: "10", label: "Full (10)" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-10 flex items-center justify-end">
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black"
        >
          Start session <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-semibold tracking-wider uppercase text-gray-500 mb-2">{label}</div>
      {children}
    </div>
  );
}

function ChipRow({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SessionScreen({
  question, questionNumber, totalQuestions, answer, setAnswer, timer, evaluating, onSubmit, onSkip,
}: {
  question: InterviewQuestion; questionNumber: number; totalQuestions: number;
  answer: string; setAnswer: (s: string) => void; timer: number; evaluating: boolean;
  onSubmit: () => void; onSkip: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold tracking-wider uppercase text-gray-500">
          Question {questionNumber} of {totalQuestions}
        </span>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded ${
            question.difficulty === "easy" ? "bg-emerald-50 text-emerald-700"
            : question.difficulty === "medium" ? "bg-amber-50 text-amber-700"
            : "bg-rose-50 text-rose-700"
          }`}>{question.difficulty}</span>
          <span className="text-[12px] text-gray-500 font-mono tabular-nums">
            {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")} <span className="text-gray-300">· bench {Math.floor(question.timeBenchmarkSeconds / 60)}:{String(question.timeBenchmarkSeconds % 60).padStart(2, "0")}</span>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-4">
        <div className="text-[13px] text-gray-500 uppercase tracking-wider font-semibold mb-2">{question.subcategory}</div>
        <p className="text-[15px] text-gray-900 leading-relaxed mb-4">{question.prompt}</p>
        <pre className="text-[12px] text-gray-600 bg-gray-50 border border-gray-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">{question.contextSetup}</pre>
        <p className="text-[11px] text-gray-500 mt-2 italic">{question.sampleData}</p>
      </div>

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        spellCheck={false}
        className="w-full min-h-[260px] rounded-xl border border-gray-300 bg-[#1a1a1a] text-emerald-100 font-mono text-[13px] leading-relaxed p-4 focus:outline-none focus:border-violet-500"
        placeholder="Write your query here..."
      />

      <div className="flex items-center justify-between mt-4">
        <button
          onClick={onSkip}
          disabled={evaluating}
          className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
        >
          Skip this question
        </button>
        <button
          onClick={onSubmit}
          disabled={evaluating || answer.trim().length < 5}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50"
        >
          {evaluating ? "Evaluating..." : "Submit answer"}
        </button>
      </div>
    </div>
  );
}

function VerdictScreen({
  evaluation, question, isLast, onNext,
}: { evaluation: InterviewEvaluation; question: InterviewQuestion; isLast: boolean; onNext: () => void }) {
  const v = VERDICT_COLOURS[evaluation.verdict];
  return (
    <div>
      <div className="rounded-2xl border-2 p-6 mb-5" style={{ borderColor: v.fg, background: v.bg }}>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold" style={{ color: v.fg }}>{v.label}</span>
          <span className="text-2xl font-bold tabular-nums" style={{ color: v.fg }}>{evaluation.score}/100</span>
        </div>
        <p className="text-[14px] text-gray-700 mt-2 leading-relaxed">{evaluation.reasoning}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span className="text-[12px] font-semibold tracking-wider uppercase text-emerald-700">What worked</span>
          </div>
          <ul className="text-[13px] text-gray-700 space-y-2 leading-relaxed">
            {evaluation.whatWorked.length === 0 && <li className="text-gray-400 italic">Nothing significant.</li>}
            {evaluation.whatWorked.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={16} className="text-rose-600" />
            <span className="text-[12px] font-semibold tracking-wider uppercase text-rose-700">What missed</span>
          </div>
          <ul className="text-[13px] text-gray-700 space-y-2 leading-relaxed">
            {evaluation.whatMissed.length === 0 && <li className="text-gray-400 italic">Nothing to call out.</li>}
            {evaluation.whatMissed.map((s, i) => <li key={i}>• {s}</li>)}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} className="text-violet-700" />
          <span className="text-[12px] font-semibold tracking-wider uppercase text-violet-800">Push to Strong Hire</span>
        </div>
        <p className="text-[14px] text-violet-900 leading-relaxed">{evaluation.pushToStrong}</p>
      </div>

      <details className="mb-6 text-[13px] text-gray-600">
        <summary className="cursor-pointer text-gray-700 hover:text-gray-900">Show the rubric</summary>
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 space-y-2">
          <p><span className="font-semibold">Correct approach:</span> {question.rubric.correctApproach}</p>
          <p><span className="font-semibold">Common mistakes:</span> {question.rubric.commonMistakes.join("; ")}</p>
          <p><span className="font-semibold">Bonus:</span> {question.rubric.bonusPoints.join("; ")}</p>
          <p><span className="font-semibold">Traps:</span> {question.rubric.traps.join("; ")}</p>
        </div>
      </details>

      <div className="flex items-center justify-end">
        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black"
        >
          {isLast ? "Finish session" : "Next question"} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function DoneScreen({
  history, onRestart,
}: { history: { q: InterviewQuestion; a: string; e: InterviewEvaluation }[]; onRestart: () => void }) {
  const total = history.length;
  const avg = total === 0 ? 0 : Math.round(history.reduce((s, x) => s + x.e.score, 0) / total);
  const distribution = history.reduce<Record<Verdict, number>>((acc, x) => {
    acc[x.e.verdict] = (acc[x.e.verdict] ?? 0) + 1;
    return acc;
  }, { strong_hire: 0, hire: 0, soft_pass: 0, no_hire: 0 });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Session complete</h1>
      <p className="text-sm text-gray-600 mb-8">Saved to your local history. Run another to keep building readiness.</p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Average score</div>
          <div className="text-3xl font-semibold text-gray-900 tabular-nums">{avg}<span className="text-base text-gray-400">/100</span></div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">Verdicts</div>
          <div className="text-[13px] text-gray-700 space-y-1">
            {(Object.keys(VERDICT_COLOURS) as Verdict[]).map((v) => (
              <div key={v} className="flex justify-between">
                <span>{VERDICT_COLOURS[v].label}</span>
                <span className="tabular-nums" style={{ color: VERDICT_COLOURS[v].fg }}>{distribution[v]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={onRestart}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-black"
      >
        Run another session
      </button>
    </div>
  );
}
