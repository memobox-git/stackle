"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import Message, { ChatMessage } from "./Message";
import MarketInsightCard from "./MarketInsightCard";
import InterviewPrepCard from "./InterviewPrepCard";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import { MarketAnalysis } from "@/lib/agents/schemas/marketIntelligence";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { InterviewPrepPlan } from "@/lib/agents/schemas/interviewPrep";
import ResumeWelcomeCard from "@/components/ResumeWelcomeCard";
import FixProgressCard from "@/components/FixProgressCard";
import ArtifactCard from "@/components/ArtifactCard";
import type { Artifact } from "@/lib/artifacts";

interface ChatWindowProps {
  messages: ChatMessage[];
  isLoading: boolean;
  loadingLabel?: string;
  resumeAnalysis?: ResumeAnalysis | null;
  marketAnalysis?: MarketAnalysis | null;
  resumePreview?: { filename: string; text: string } | null;
  resumeExtraction?: ResumeExtraction | null;
  interviewPrepPlan?: InterviewPrepPlan | null;
  onSend?: (text: string) => void;
  onFixItem?: (action: string, index: number) => void;
  onFixAll?: () => void;
  completedActions?: Set<number>;
  // Report artifact
  onOpenReport?: () => void;
  isReportOpen?: boolean;
  resumeScore?: number;
  acceptedPoints?: number;
  // Benchmarking
  resumeText?: string | null;
  // Resume Builder welcome experience
  resumeBuilderMode?: boolean;
  // Fix progress checklist
  completedFixes?: Set<number>;
  acceptedFixes?: Set<number>;
  currentFixIndex?: number | null;
  // When set, replaces the default starter pills with these labels.
  // Used by the post-onboarding welcome to surface 2 specific actions
  // ("Fix my resume" + "What's going on?") instead of the generic four.
  // Also forces pills to render in chat mode (not just resume-builder).
  starterPromptOverride?: string[];
  onStarterPromptClick?: (text: string) => void;
  // When set, starter pills route directly through the document-edit flow
  // (typewriter + ✓/✗) instead of populating the chat input.
  onChatEditPrompt?: (text: string) => void;
  // Click the "Apply in Resume Builder →" button in main chat: switches view
  // and queues the instruction to auto-fire once Resume Builder mounts.
  onApplyInBuilder?: (instruction: string) => void;
  // When provided, user messages show an edit pencil. Callback receives the
  // index of the edited message + new content; parent is expected to truncate
  // the conversation from that point and resend.
  onEditUserMessage?: (index: number, newContent: string) => void;
  // When provided, the assistant hover-action row shows Retry — re-runs the
  // preceding user message and replaces this assistant response. The index
  // is the assistant message being retried.
  onRetryAssistant?: (assistantIndex: number) => void;
  // Fix 2 — when an assistant message carries an Artifact, clicking the
  // card calls this. The host (page.tsx) routes per artifact.kind to the
  // right preview surface (Resume Report, future Cover Letter pane, etc).
  onOpenArtifact?: (artifact: Artifact) => void;
  // Which artifact is currently open in the right pane (if any). Cards
  // flip to "Viewing" state when their id matches.
  openArtifactId?: string | null;
}

function PrioritiesCard({
  priorities,
  onFixItem,
  onFixAll,
  completedActions,
}: {
  priorities: string[];
  onFixItem?: (action: string, index: number) => void;
  onFixAll?: () => void;
  completedActions?: Set<number>;
}) {
  const priorityBadge = (action: string) => {
    const u = action.toUpperCase();
    if (u.startsWith("HIGH")) return { bg: "#fee2e2", color: "#dc2626", border: "#fecaca", label: "HIGH" };
    if (u.startsWith("MEDIUM")) return { bg: "#fef3c7", color: "#d97706", border: "#fde68a", label: "MED" };
    return { bg: "#ede9fe", color: "#7c3aed", border: "#ddd6fe", label: "LOW" };
  };

  const doneCount = completedActions?.size ?? 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm">🎯</span>
            <span className="text-xs font-semibold text-gray-900">Prioritised Action Plan</span>
            <span className="text-[10px] font-mono text-gray-500">{priorities.length} items</span>
            {doneCount > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50">
                {doneCount} fixed ✓
              </span>
            )}
          </div>
          {onFixAll && doneCount < priorities.length && (
            <button
              onClick={onFixAll}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-white text-black hover:bg-gray-100 transition-colors"
            >
              Fix All ({priorities.length - doneCount})
            </button>
          )}
        </div>
        <div className="p-3 flex flex-col gap-2">
          {priorities.map((action, i) => {
            const c = priorityBadge(action);
            const done = completedActions?.has(i) ?? false;
            // Strip priority prefix for display
            const display = action.replace(/^(HIGH|MEDIUM|LOW)\s*[—-]?\s*/i, "");
            return (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
                style={{
                  background: done ? "#0f1f0f" : "#1a1a1a",
                  border: `1px solid ${done ? "#1a3a1a" : "#2a2a2a"}`,
                  opacity: done ? 0.6 : 1,
                }}
              >
                <span
                  className="text-[9px] font-bold w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: done ? "#14532d" : c.bg, color: done ? "#4ade80" : c.color, border: `1px solid ${done ? "#166534" : c.border}` }}
                >
                  {done ? "✓" : `P${i + 1}`}
                </span>
                <span className={`flex-1 text-xs leading-snug ${done ? "text-gray-500 line-through" : "text-gray-700"}`}>{display}</span>
                <span
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: done ? "#14532d" : c.bg, color: done ? "#4ade80" : c.color }}
                >
                  {c.label}
                </span>
                {onFixItem && !done && (
                  <button
                    onClick={() => onFixItem(action, i)}
                    className="text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                    style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
                  >
                    Fix →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ icon, label, sub, color }: { icon: string; label: string; sub?: string; color: string }) {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-3">
      <div
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border"
        style={{ background: `${color}08`, borderColor: `${color}22` }}
      >
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium" style={{ color }}>{label}</span>
          {sub && <span className="text-xs text-gray-500 ml-2">{sub}</span>}
        </div>
        <span className="text-xs font-mono" style={{ color: `${color}88` }}>✓</span>
      </div>
    </div>
  );
}

const SENTINELS = ["__RESUME_PREVIEW__", "__RESUME_ANALYSIS__", "__RESUME_PRIORITIES__", "__MARKET_ANALYSIS__", "__RESUME_EXTRACTION__", "__INTERVIEW_PREP__", "__RESUME_WELCOME_CARD__", "__FIX_PROGRESS_CARD__", "__ANALYSIS_PROGRESS__"];

// Inline chip sentinel. Format: "__INLINE_CHIPS__:Label one|Label two|Label three"
// Renders as a row of clickable pills inside the chat (no avatar / bubble),
// right after the previous assistant message. Click → fires onStarterPromptClick
// with that label as the prompt.
const INLINE_CHIPS_PREFIX = "__INLINE_CHIPS__:";

// Pick an emoji for a chip based on keywords
function chipEmoji(label: string): string {
  const l = label.toLowerCase();

  // Specific tools — checked first to avoid generic matches stealing them
  if (l.includes("kafka")) return "🌊";
  if (l.includes("spark")) return "⚡";
  if (l.includes("flink")) return "🔥";
  if (l.includes("airflow")) return "🌬️";
  if (l.includes("dbt")) return "🔧";
  if (l.includes("snowflake")) return "❄️";
  if (l.includes("databricks")) return "🧱";
  if (l.includes("bigquery") || l.includes("big query")) return "🔭";
  if (l.includes("redshift")) return "🔴";
  if (l.includes("kubernetes") || l.includes("k8s")) return "☸️";
  if (l.includes("docker")) return "🐳";
  if (l.includes("terraform")) return "🏔️";
  if (l.includes("python")) return "🐍";
  if (l.includes("sql")) return "🗄️";
  if (l.includes("java") || l.includes("scala")) return "☕";
  if (l.includes("go lang") || l.includes("golang")) return "🐹";
  if (l.includes("rust")) return "🦀";
  if (l.includes("aws") || l.includes("amazon")) return "☁️";
  if (l.includes("gcp") || l.includes("google cloud")) return "🌐";
  if (l.includes("azure")) return "🔷";
  if (l.includes("redis")) return "🔴";
  if (l.includes("postgres") || l.includes("mysql") || l.includes("database")) return "🗄️";
  if (l.includes("mongodb") || l.includes("mongo")) return "🍃";
  if (l.includes("elasticsearch") || l.includes("opensearch")) return "🔍";
  if (l.includes("tableau") || l.includes("looker") || l.includes("metabase")) return "📊";
  if (l.includes("mlflow") || l.includes("kubeflow")) return "🔬";
  if (l.includes("pytorch") || l.includes("tensorflow")) return "🧠";
  if (l.includes("llm") || l.includes("gpt") || l.includes("openai") || l.includes("claude")) return "🤖";
  if (l.includes("vector") || l.includes("embedding")) return "🧬";
  if (l.includes("rag") || l.includes("retrieval")) return "📚";
  if (l.includes("api") || l.includes("rest") || l.includes("graphql")) return "🔌";
  if (l.includes("git") || l.includes("github") || l.includes("ci/cd")) return "🔀";

  // Career / topic areas
  if (l.includes("resume")) return "📄";
  if (l.includes("ats")) return "🔍";
  if (l.includes("review") || l.includes("full")) return "📋";
  if (l.includes("score") || l.includes("quick")) return "⚡";
  if (l.includes("interview") || l.includes("prep") || l.includes("mock")) return "🎤";
  if (l.includes("behavioral")) return "🗣️";
  if (l.includes("technical")) return "💻";
  if (l.includes("system design") || l.includes("architecture")) return "🏗️";
  if (l.includes("market") || l.includes("trend")) return "📈";
  if (l.includes("salary") || l.includes("pay") || l.includes("compensation")) return "💰";
  if (l.includes("junior") || l.includes("entry")) return "🌱";
  if (l.includes("senior") || l.includes("lead") || l.includes("staff") || l.includes("principal")) return "⭐";
  if (l.includes("data engineer")) return "⚙️";
  if (l.includes("data scientist")) return "🧬";
  if (l.includes("data analyst")) return "📊";
  if (l.includes("ml engineer") || l.includes("machine learning")) return "🤖";
  if (l.includes("platform") || l.includes("infra")) return "🏗️";
  if (l.includes("streaming") || l.includes("real-time") || l.includes("realtime")) return "🌊";
  if (l.includes("batch") || l.includes("pipeline")) return "⚙️";
  if (l.includes("analytics") || l.includes("reporting")) return "📊";
  if (l.includes("cloud")) return "☁️";
  if (l.includes("something else") || l.includes("other")) return "✨";
  if (l.includes("skill")) return "🛠️";
  if (l.includes("deep dive") || l.includes("deep")) return "🔬";
  if (l.includes("keep going") || l.includes("continue")) return "▶️";
  if (l.includes("switch") || l.includes("change")) return "🔄";
  if (l.includes("role") || l.includes("fit") || l.includes("explore")) return "🎯";
  if (l.includes("design")) return "🏗️";
  if (l.includes("case")) return "📊";
  if (l.includes("mid")) return "🔹";
  return "💡";
}

// Clean a raw option into a short, friendly chip label
function cleanLabel(raw: string): string {
  return raw
    .replace(/^(what'?s? on your mind\s*[—–-]\s*)/i, "")
    .replace(/^(i('?m)? (thinking about|wondering about|interested in)\s*)/i, "")
    .split(" ")
    .slice(0, 7)
    .join(" ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

// Strip leading emojis, asterisks, and whitespace from a chip label
function stripChipLabel(raw: string): string {
  return raw
    .replace(/^[\p{Emoji}\u200d\ufe0f\s]+/u, "")  // leading emojis
    .replace(/\*\*/g, "")                            // bold markers
    .replace(/\*/g, "")                              // italic markers
    .trim();
}

// Returns { options, stripped } — options to show as chips, stripped = message without the options line
function parseOptions(text: string): { options: string[]; stripped: string } {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { options: [], stripped: text };

  // Pattern 1: trailing emoji-prefixed chip lines (💡 / 📄 / ➡️ etc.)
  // Collect consecutive trailing lines that start with an emoji
  const EMOJI_LINE = /^[\p{Emoji}]\s/u;
  let emojiEnd = lines.length - 1;
  let emojiStart = emojiEnd;
  while (emojiStart > 0 && EMOJI_LINE.test(lines[emojiStart - 1].trim())) {
    emojiStart--;
  }
  if (EMOJI_LINE.test(lines[emojiEnd].trim()) && emojiEnd - emojiStart >= 1) {
    // 2+ consecutive emoji lines at the end
    const chips = lines.slice(emojiStart).map((l) => stripChipLabel(l.trim())).filter(Boolean);
    if (chips.length >= 2 && chips.length <= 6) {
      const stripped = lines.slice(0, emojiStart).join("\n").trimEnd();
      return { options: chips, stripped };
    }
  }
  // Single emoji line at end also qualifies if there are 2+ comma-separated parts
  const lastEmojiLine = lines[lines.length - 1].trim();
  if (EMOJI_LINE.test(lastEmojiLine)) {
    const label = stripChipLabel(lastEmojiLine);
    // Check if there are more emoji lines just above
    const prevLine = lines.length >= 2 ? lines[lines.length - 2].trim() : "";
    if (EMOJI_LINE.test(prevLine)) {
      // already handled above
    } else {
      // Single emoji chip — only show if the label is meaningful
      if (label.length > 2) {
        const stripped = lines.slice(0, -1).join("\n").trimEnd();
        return { options: [label], stripped };
      }
    }
  }

  // Pattern 2: "question — option one, option two, option three?"
  const lastLine = lines[lines.length - 1].trim();
  if (!lastLine.endsWith("?") || !lastLine.includes("—")) return { options: [], stripped: text };

  const afterDash = lastLine.split("—").slice(1).join("—").trim();
  if (!afterDash) return { options: [], stripped: text };

  const parts = afterDash
    .split(/,\s*(?:or\s+)?/)
    .map((p) => p.replace(/\?$/, "").trim())
    .filter(Boolean);

  if (
    parts.length >= 2 &&
    parts.length <= 6 &&
    parts.every((p) => p.length > 1 && p.split(/\s+/).length <= 6 && !p.match(/[.!]/))
  ) {
    const stripped = lines.slice(0, -1).join("\n").trimEnd();
    return { options: parts, stripped };
  }

  return { options: [], stripped: text };
}

// Canonical question patterns — when the synthesis prompt forgets to
// emit chips for a finite-option question, this safety net kicks in.
// The rule from product: "Don't drop pills randomly. Consistency
// matters." So common questions always render the same chip set.
function canonicalChipsForQuestion(text: string): string[] {
  const t = text.trim().toLowerCase();
  // Only fire on the last few lines — avoids matching old prose deep in
  // a long answer.
  const tail = t.split("\n").slice(-3).join(" ");
  if (!tail.includes("?")) return [];

  // Resume review — "what kind of review", "which review"
  if (/(what|which) (kind|type) of review/.test(tail) || /what review/.test(tail)) {
    return ["Full Review", "ATS Check", "Career Fit", "Senior Level"];
  }
  // Target role — "what role", "which role", "what are you targeting"
  if (/(what|which) (role|position)/.test(tail) || /(what|which) .*(targeting|target role)/.test(tail) || /what role are you/.test(tail)) {
    return ["Data Engineer", "ML Engineer", "Data Scientist", "Other"];
  }
  // Seniority — "what level", "junior or senior"
  if (/(what|which) (level|seniority)/.test(tail) || /\b(junior|mid|senior|staff)\b.*\b(or)\b.*\b(junior|mid|senior|staff)\b/.test(tail)) {
    return ["Junior", "Mid", "Senior", "Staff+"];
  }
  // Goal — "what's the goal", "new job or promotion"
  if (/(what'?s )?(the|your) goal/.test(tail) || /new job.*(promotion|switch)/.test(tail)) {
    return ["New Job", "Promotion", "Switch Field", "Just Exploring"];
  }
  // Yes/no confirmations — "want me to", "should I", "shall I"
  if (/^(want me to|should i|shall i|do you want me to)/.test(tail) || /\b(want me to|should i) .*\?$/.test(tail)) {
    return ["Yes", "Not now"];
  }
  return [];
}

// Steps up to 94% — these advance during the API call
const ANALYSIS_STEPS = [
  { label: "Reading resume sections",           pct: 7,  delay: 1200 },
  { label: "Identifying work history & roles",  pct: 14, delay: 2000 },
  { label: "Scoring ATS compatibility",         pct: 24, delay: 3000 },
  { label: "Evaluating content & impact",       pct: 35, delay: 3500 },
  { label: "Checking structure & formatting",   pct: 46, delay: 3500 },
  { label: "Auditing keyword coverage",         pct: 57, delay: 3500 },
  { label: "Analysing seniority signal",        pct: 67, delay: 3500 },
  { label: "Generating improvement priorities", pct: 76, delay: 4000 },
  { label: "Calculating score projections",     pct: 85, delay: 4000 },
  { label: "Building your report",              pct: 94, delay: 9999 }, // stays here until done
];

// While stuck at 94%, cycle through these sub-messages
const FINALISING_MSGS = [
  "Finalising ATS compatibility score...",
  "Writing your action plan...",
  "Crafting improvement recommendations...",
  "Compiling keyword analysis...",
  "Preparing your report...",
  "Almost there...",
];

function AnalysisProgress() {
  const [stepIdx, setStepIdx] = useState(0);
  const [pct, setPct] = useState(0);
  const [finIdx, setFinIdx] = useState(0);

  // Advance through steps based on each step's own delay
  useEffect(() => {
    const t = setTimeout(() => setPct(ANALYSIS_STEPS[0].pct), 200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (stepIdx >= ANALYSIS_STEPS.length - 1) return;
    const { delay } = ANALYSIS_STEPS[stepIdx];
    const t = setTimeout(() => {
      const next = stepIdx + 1;
      setStepIdx(next);
      setPct(ANALYSIS_STEPS[next].pct);
    }, delay);
    return () => clearTimeout(t);
  }, [stepIdx]);

  // Once at final step, rotate finalising messages every 2.5s
  useEffect(() => {
    if (stepIdx < ANALYSIS_STEPS.length - 1) return;
    const t = setInterval(() => setFinIdx((f) => (f + 1) % FINALISING_MSGS.length), 2500);
    return () => clearInterval(t);
  }, [stepIdx]);

  const isFinal = stepIdx === ANALYSIS_STEPS.length - 1;
  const label = isFinal ? FINALISING_MSGS[finIdx] : `${ANALYSIS_STEPS[stepIdx].label}…`;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 mb-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm animate-spin" style={{ animationDuration: "2s" }}>⚙️</span>
            <span className="text-sm font-medium text-gray-900">Analysing resume</span>
          </div>
          <span className="text-xs font-mono text-gray-500">{pct}%</span>
        </div>
        {/* Bar */}
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3">
          <div
            className="h-full rounded-full transition-all duration-[1200ms] ease-out"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg, #a99af9, #4fc9a4)" }}
          />
        </div>
        {/* Step label — fades in on change */}
        <p className="text-xs text-gray-500" key={`${stepIdx}-${finIdx}`} style={{ animation: "fadeIn 400ms ease" }}>
          {label}
        </p>
        {/* Step dots */}
        <div className="flex gap-1.5 mt-3">
          {ANALYSIS_STEPS.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i <= stepIdx ? "20px" : "6px",
                background: i <= stepIdx ? "#a99af9" : "#2a2a2a",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Animated analysis-progress card for the INLINE chat sentinel. The
// other AnalysisProgress (above) is the standalone loading-screen
// component used when the resume builder doesn't have a chat yet.
// This one renders when "__ANALYSIS_PROGRESS__" appears in the chat
// stream — paces through 4 stages over ~28s so the user sees movement
// instead of one static dot. Real analysis lands when it lands and
// the landed watcher replaces the sentinel in-place.
function InlineAnalysisProgress() {
  const STAGES = [
    "Reading your resume",
    "Comparing to target-role benchmarks",
    "Scoring across 5 dimensions",
    "Identifying biggest gains",
  ];
  // Tail messages shown after the 4 stages complete — keeps the panel
  // alive while the API is still working past the optimistic 28s
  // estimate. Rotates every 4s so the user sees text actually changing.
  const FINAL_MSGS = [
    "Wrapping up the report",
    "Cross-checking ATS rules",
    "Polishing the recommendations",
    "Almost there",
  ];
  const STAGE_MS = 7000;
  // Advance through stages then rotate final messages indefinitely.
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), STAGE_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const stage = Math.min(tick, STAGES.length - 1);
  const allDone = tick >= STAGES.length;
  const finalIdx = (tick - STAGES.length) % FINAL_MSGS.length;
  const stuck = elapsed > 75; // ~75s past expected — surface "longer than usual" hint
  return (
    <div className="flex mb-6 w-full max-w-3xl mx-auto px-4">
      <div className="flex-1 min-w-0 text-[15px] text-gray-900">
        <ul className="space-y-1.5">
          {STAGES.map((label, idx) => {
            const state =
              allDone || idx < stage ? "done"
                : idx === stage ? "active"
                  : "pending";
            return (
              <li key={idx} className="flex items-center gap-2 text-[13px]">
                {state === "done" && (
                  <span className="inline-flex w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold items-center justify-center flex-shrink-0">✓</span>
                )}
                {state === "active" && (
                  <span className="relative flex h-3.5 w-3.5 items-center justify-center flex-shrink-0">
                    <span className="absolute inline-flex h-2 w-2 rounded-full bg-gray-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-800" />
                  </span>
                )}
                {state === "pending" && (
                  <span className="inline-flex w-3.5 h-3.5 rounded-full border border-gray-300 flex-shrink-0" />
                )}
                <span className={state === "done" ? "text-gray-500 line-through decoration-gray-300" : state === "active" ? "text-gray-900 font-medium" : "text-gray-400"}>
                  {label}{state === "active" ? "…" : ""}
                </span>
              </li>
            );
          })}
        </ul>
        {allDone && (
          <div className="flex items-center gap-2 mt-2 text-[13px] text-gray-700">
            <span className="relative flex h-3.5 w-3.5 items-center justify-center flex-shrink-0">
              <span className="absolute inline-flex h-2 w-2 rounded-full bg-gray-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gray-800" />
            </span>
            <span key={finalIdx} className="font-medium" style={{ animation: "fadeIn 400ms ease" }}>
              {FINAL_MSGS[finalIdx]}…
            </span>
          </div>
        )}
        <p className="text-[12px] text-gray-500 mt-3">
          {stuck
            ? `Taking a bit longer than usual (${elapsed}s) — still working. If nothing lands in another minute, refresh and try again.`
            : `${elapsed}s elapsed. I'll drop the full report here when it's ready.`}
        </p>
      </div>
    </div>
  );
}

export default function ChatWindow({
  messages,
  isLoading,
  loadingLabel,
  resumeAnalysis,
  marketAnalysis,
  resumePreview,
  resumeExtraction,
  interviewPrepPlan,
  onSend,
  onFixItem,
  onFixAll,
  completedActions,
  onOpenReport,
  isReportOpen,
  resumeScore,
  acceptedPoints = 0,
  resumeText,
  resumeBuilderMode,
  completedFixes,
  acceptedFixes,
  currentFixIndex,
  starterPromptOverride,
  onStarterPromptClick,
  onChatEditPrompt,
  onApplyInBuilder,
  onEditUserMessage,
  onRetryAssistant,
  onOpenArtifact,
  openArtifactId,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  // Track which assistant messages arrived in this session (vs being
  // there at mount time). Only the freshly-arrived ones get the
  // typewriter reveal.
  //
  // Seeding is LAZY — we wait for the first non-empty messages render
  // before treating the list as 'history'. Otherwise: ChatWindow often
  // mounts with messages=[] (loadChats hasn't returned yet), seeds the
  // set as empty, then when the actual history populates a tick later,
  // every old message looks 'fresh' and animates. That was the bug.
  const seenAssistantKeys = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const freshKeysThisRender = new Set<string>();
  const keyOf = (m: { content: string; timestamp?: string }) =>
    `${m.content.length}::${m.content.slice(0, 80)}::${m.timestamp ?? ""}`;
  if (!seededRef.current && messages.length > 0) {
    // First time we see real content — treat the whole list as history.
    messages.forEach((m) => {
      if (m.role === "assistant") seenAssistantKeys.current.add(keyOf(m));
    });
    seededRef.current = true;
  } else if (seededRef.current) {
    // Subsequent renders: anything new is fresh.
    messages.forEach((m) => {
      if (m.role !== "assistant") return;
      const k = keyOf(m);
      if (!seenAssistantKeys.current.has(k)) {
        freshKeysThisRender.add(k);
        seenAssistantKeys.current.add(k);
      }
    });
  }
  // Claude-style scroll anchoring: when a new user message is sent, we
  // scroll IT to the top of the viewport so the user immediately sees
  // their question + the assistant response forming underneath. Replaces
  // the prior 'always scroll to bottom' behaviour which buried new
  // exchanges below the fold.
  const lastUserMsgAnchorRef = useRef<HTMLDivElement>(null);
  const lastUserMessageIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user" && !messages[i].content.startsWith("__FILE_UPLOAD__:")) return i;
    }
    return -1;
  })();
  // Track the count of user messages — incrementing means the user just
  // sent a new one. Anchor only on that transition, not on every render.
  const userMsgCountRef = useRef<number>(0);
  const userMsgCount = messages.filter((m) => m.role === "user" && !m.content.startsWith("__FILE_UPLOAD__:")).length;
  const userJustSent = userMsgCount > userMsgCountRef.current;
  userMsgCountRef.current = userMsgCount;
  // Report highlight — pulse border for 2s when report first arrives
  const [reportHighlight, setReportHighlight] = useState(false);
  const prevAnalysisRef = useRef<typeof resumeAnalysis>(null);
  useEffect(() => {
    if (resumeAnalysis && !prevAnalysisRef.current) {
      setReportHighlight(true);
      const t = setTimeout(() => setReportHighlight(false), 2400);
      prevAnalysisRef.current = resumeAnalysis;
      return () => clearTimeout(t);
    }
    if (resumeAnalysis) prevAnalysisRef.current = resumeAnalysis;
  }, [resumeAnalysis]);

  const checkNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 100;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsNearBottom(near);
  }, []);

  useEffect(() => {
    // Claude-style anchoring: if the user just sent a new message, scroll
    // THAT message to the top of the chat viewport so the user sees their
    // question + the assistant response forming below it. After that we
    // stop auto-scrolling — the assistant text fills downward naturally
    // and the user reads top-to-bottom (or scrolls manually).
    if (userJustSent && lastUserMsgAnchorRef.current) {
      // requestAnimationFrame gives the new message a render frame to
      // commit its size before we scroll — otherwise the browser
      // sometimes scrolls to a stale offset.
      requestAnimationFrame(() => {
        lastUserMsgAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    // For non-user-send updates (e.g. streaming chunk arriving), only
    // auto-scroll if the user is already near the bottom — never yank
    // them down if they've scrolled up to read history.
    if (isNearBottom && !userJustSent) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, userJustSent, isLoading]);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsNearBottom(true);
  }

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && !SENTINELS.includes(messages[i].content)) return i;
    }
    return -1;
  })();

  const { options: parsedOptions, stripped: strippedContent } =
    !isLoading && lastAssistantIdx >= 0
      ? parseOptions(messages[lastAssistantIdx].content)
      : { options: [], stripped: "" };
  // Fix 1 — always-pills safety net. If the agent forgot to emit chips
  // for a canonical question (review type, target role, seniority, etc),
  // synthesize them client-side so the user never sees a discrete-choice
  // question without pills. Only fires when parseOptions found nothing
  // AND the next message in the thread isn't already a __INLINE_CHIPS__
  // sentinel (avoid double-rendering when the agent did emit them).
  const nextIsChipSentinel =
    lastAssistantIdx >= 0 &&
    lastAssistantIdx + 1 < messages.length &&
    messages[lastAssistantIdx + 1].content.startsWith(INLINE_CHIPS_PREFIX);
  const canonicalChips =
    parsedOptions.length === 0 && !isLoading && lastAssistantIdx >= 0 && !nextIsChipSentinel
      ? canonicalChipsForQuestion(messages[lastAssistantIdx].content)
      : [];
  const inlineOptions = parsedOptions.length > 0 ? parsedOptions : canonicalChips;

  // Detect if the user has contributed anything yet — used to decide whether
  // to show the starter prompt pills in Resume Builder mode.
  const userHasSpoken = messages.some(
    (m) => m.role === "user" && !m.content.startsWith("__FILE_UPLOAD__:") && !SENTINELS.includes(m.content)
  );
  // Override pills work in chat mode too. Default pills only render in
  // Resume Builder mode (legacy behaviour) and only when the user hasn't
  // spoken yet.
  const showStarterPills = !!starterPromptOverride
    ? starterPromptOverride.length > 0 && !userHasSpoken && messages.length > 0 && !isLoading
    : !!resumeBuilderMode && !userHasSpoken && messages.length > 0 && !isLoading;

  const starterPrompts: string[] = starterPromptOverride ?? [
    resumeAnalysis?.likelyTargetRole
      ? `Rewrite my summary for a ${resumeAnalysis.likelyTargetRole} role`
      : `Rewrite my summary for a Senior ${(resumeExtraction?.experience?.[0]?.title ?? "Data Engineer").replace(/^(Senior|Lead|Staff|Principal)\s+/i, "")} role`,
    "Benchmark this resume against a job description",
    "Make this ATS-safe for FAANG and big tech",
    "Quantify the wins in my last three roles",
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
    {/* Scorecard strip removed. The per-category numbers weren't reliably
        reflecting accepted fixes and were more noise than signal. Real
        scoring lives in the Report tab — one source of truth. */}
    <div
      ref={scrollContainerRef}
      onScroll={(e) => {
        checkNearBottom();
        // Toggle .is-scrolling so the auto-hide scrollbar CSS turns the
        // thumb visible. A 1.2s timer wipes the class once the user has
        // gone idle — matches macOS / Claude behaviour.
        const el = e.currentTarget;
        el.classList.add("is-scrolling");
        if (scrollIdleTimerRef.current) clearTimeout(scrollIdleTimerRef.current);
        scrollIdleTimerRef.current = setTimeout(() => {
          el.classList.remove("is-scrolling");
        }, 1200);
      }}
      className="flex-1 overflow-y-auto pt-8 pb-4 relative auto-hide-scroll"
    >
      {messages.map((msg, i) => {
        // Fix 2 — artifact card. When a message carries an Artifact,
        // render the card instead of (or alongside) prose. The card is
        // self-contained: clicking opens preview, optional download
        // surfaces here.
        if (msg.artifact && msg.role === "assistant") {
          return (
            <div key={i}>
              {msg.content.trim().length > 0 && (
                <Message
                  message={(() => {
                    const isFresh = freshKeysThisRender.has(keyOf(msg));
                    return { ...msg, __isFresh: isFresh };
                  })()}
                  messageIndex={i}
                />
              )}
              <ArtifactCard
                artifact={msg.artifact}
                onOpen={onOpenArtifact}
                isOpen={openArtifactId === msg.artifact.id}
              />
            </div>
          );
        }

        // File upload chip — user side
        if (msg.content.startsWith("__FILE_UPLOAD__:")) {
          const filename = msg.content.slice("__FILE_UPLOAD__:".length);
          const ext = filename.split(".").pop()?.toLowerCase() ?? "";
          const icon = ext === "pdf" ? "📄" : ext === "docx" || ext === "doc" ? "📝" : "📎";
          return (
            <div key={i} className="flex justify-end w-full max-w-3xl mx-auto px-4 mb-3">
              <div
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border"
                style={{ background: "#f3f4f6", borderColor: "#e5e7eb", maxWidth: "280px" }}
              >
                <span className="text-xl flex-shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{filename}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Resume uploaded</p>
                </div>
              </div>
            </div>
          );
        }

        if (msg.content === "__RESUME_EXTRACTION__")
          return resumeExtraction
            ? <StatusBanner key={i} icon="📄" label={`${resumeExtraction.name} — Resume parsed`} sub="View in Resume tab →" color="#a99af9" />
            : null;
        if (msg.content === "__RESUME_PREVIEW__") return null;

        // Report artifact card
        if (msg.content === "__RESUME_ANALYSIS__") {
          if (!resumeAnalysis) return null;
          const baseScore = resumeScore ?? 0;
          const score = Math.min(100, baseScore + acceptedPoints);
          const scoreColor = score >= 75 ? "#4fc9a4" : score >= 55 ? "#f59e0b" : "#ef4444";
          const scoreLabel = score >= 75 ? "STRONG" : score >= 60 ? "GOOD" : score >= 45 ? "REVIEW" : "WEAK";
          const candidateName = resumeExtraction?.name ?? resumeAnalysis.likelyTargetRole ?? "Resume";
          const topStrength = resumeAnalysis.strengths?.[0] ?? null;
          return (
            <div key={i} className="w-full max-w-3xl mx-auto px-4 mb-3">
              <div
                className="rounded-xl border overflow-hidden"
                style={{
                  background: "#fafafa",
                  borderColor: reportHighlight ? "#a99af9" : "#2a2a2a",
                  boxShadow: reportHighlight ? "0 0 0 2px #a99af920" : "none",
                  transition: "border-color 600ms ease, box-shadow 600ms ease",
                }}
              >
                {/* Header bar */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "#e5e7eb", background: "#fafafa" }}>
                  <span className="text-sm">📊</span>
                  <span className="text-xs font-semibold text-gray-900 flex-1">Resume Report</span>
                  <span className="text-[10px] font-mono text-gray-500">artifact</span>
                </div>
                {/* Content */}
                <div className="px-4 py-3 flex gap-4 items-start">
                  {/* Left: score */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-700"
                      style={{ borderColor: scoreColor, background: `${scoreColor}14` }}
                    >
                      <span className="text-base font-bold transition-all duration-700" style={{ color: scoreColor }}>{score}</span>
                    </div>
                    <span className="text-[9px] font-bold tracking-widest" style={{ color: scoreColor }}>{scoreLabel}</span>
                    {acceptedPoints > 0 && (
                      <span className="text-[9px] font-semibold text-green-400">+{acceptedPoints} pts</span>
                    )}
                  </div>
                  {/* Right: info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{candidateName}</p>
                    {resumeAnalysis.likelyTargetRole && (
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{resumeAnalysis.likelyTargetRole}</p>
                    )}
                    {topStrength && (
                      <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">✓ {topStrength}</p>
                    )}
                    <div className="flex gap-3 mt-1.5 flex-wrap">
                      {acceptedPoints > 0 ? (
                        <span className="text-[10px] font-semibold text-green-400">{baseScore} → {score} score</span>
                      ) : (
                        <span className="text-[10px] text-gray-600">{resumeAnalysis.strengths.length} strengths</span>
                      )}
                      <span className="text-[10px] text-gray-600">{resumeAnalysis.keywordGaps.length} keyword gaps</span>
                      <span className="text-[10px] text-gray-600">{(resumeAnalysis.rewritePriorities?.length ?? 0) - (completedActions?.size ?? 0)} fixes left</span>
                    </div>
                  </div>
                  {/* Action button */}
                  <button
                    onClick={onOpenReport}
                    className="flex-shrink-0 self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: isReportOpen ? "#1a1a1a" : scoreColor,
                      color: isReportOpen ? "#888" : "#000",
                      border: isReportOpen ? "1px solid #2a2a2a" : "none",
                      cursor: isReportOpen ? "default" : "pointer",
                    }}
                  >
                    {isReportOpen ? "Viewing" : "View Report →"}
                  </button>
                </div>
              </div>
            </div>
          );
        }
        if (msg.content === "__RESUME_PRIORITIES__")
          return resumeAnalysis?.rewritePriorities?.length
            ? <PrioritiesCard key={i} priorities={resumeAnalysis.rewritePriorities} onFixItem={onFixItem} onFixAll={onFixAll} completedActions={completedActions} />
            : null;
        if (msg.content === "__MARKET_ANALYSIS__" && marketAnalysis)
          return <MarketInsightCard key={i} analysis={marketAnalysis} />;
        if (msg.content === "__MARKET_ANALYSIS__") return null;
        if (msg.content === "__INTERVIEW_PREP__" && interviewPrepPlan)
          return <InterviewPrepCard key={i} plan={interviewPrepPlan} />;
        if (msg.content === "__INTERVIEW_PREP__") return null;

        if (msg.content === "__RESUME_WELCOME_CARD__") {
          // Key includes extraction identity so the card remounts (and its
          // skeleton state resets) when the user switches chats / uploads a
          // new resume. Without this the skeleton can get stuck on old state.
          const cardKey = `welcome-${i}-${resumeExtraction?.name ?? "none"}-${resumeAnalysis ? "ready" : "pending"}`;
          return <ResumeWelcomeCard key={cardKey} analysis={resumeAnalysis ?? null} />;
        }

        // Analysis-in-progress placeholder. Pushed when user picks
        // "resume review" before the background analysis lands. Replaced
        // in-place by the analysis-landed watcher when results arrive.
        if (msg.content === "__ANALYSIS_PROGRESS__") {
          return <InlineAnalysisProgress key={`analysis-progress-${i}`} />;
        }

        if (msg.content === "__FIX_PROGRESS_CARD__") {
          if (!resumeAnalysis?.rewritePriorities?.length) return null;
          return (
            <FixProgressCard
              key={`fix-progress-${i}`}
              priorities={resumeAnalysis.rewritePriorities}
              completed={completedFixes ?? new Set()}
              accepted={acceptedFixes ?? new Set()}
              currentIndex={currentFixIndex ?? null}
              onJumpTo={onFixItem}
            />
          );
        }

        // Inline chips sentinel — rendered as a row of pill buttons right
        // inside the chat thread (no avatar, no bubble). Lets the welcome
        // present its CTAs as part of the conversation instead of a tray
        // hovering above the input. Each chip's label is the prompt text.
        if (msg.content.startsWith(INLINE_CHIPS_PREFIX)) {
          const labels = msg.content.slice(INLINE_CHIPS_PREFIX.length).split("|").map((s) => s.trim()).filter(Boolean);
          if (labels.length === 0) return null;
          return (
            <div key={`chips-${i}`} className="w-full max-w-3xl mx-auto px-4 -mt-2 mb-6">
              <div className="flex flex-wrap gap-2">
                {labels.map((label, j) => (
                  <button
                    key={j}
                    onClick={() => {
                      if (onChatEditPrompt) onChatEditPrompt(label);
                      else onStarterPromptClick?.(label);
                    }}
                    className="text-[12px] font-medium text-gray-800 bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-900 rounded-full px-2.5 py-1 transition-all shadow-sm hover:shadow"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        // Detect the Apply-in-Builder sentinel on assistant messages. The
        // synthesis prompt appends "__APPLY_IN_BUILDER__:<instruction>" on a
        // final line when the user asked to apply a rewrite; we strip it
        // from the rendered text and render a green CTA button below.
        let applyInstruction: string | null = null;
        let baseContent = msg.content;
        if (msg.role === "assistant") {
          const applyRe = /\n?__APPLY_IN_BUILDER__:([^\n]+)$/;
          const m = msg.content.match(applyRe);
          if (m) {
            applyInstruction = m[1].trim();
            baseContent = msg.content.replace(applyRe, "").trimEnd();
          }
        }

        // For the last assistant message with options — strip the options sentence from the bubble
        const displayMsg =
          i === lastAssistantIdx && inlineOptions.length > 0
            ? { ...msg, content: strippedContent }
            : applyInstruction !== null
              ? { ...msg, content: baseContent }
              : msg;

        return (
          <div
            key={i}
            ref={i === lastUserMessageIndex ? lastUserMsgAnchorRef : undefined}
            style={{ scrollMarginTop: "16px" }}
          >
            <Message
              message={(() => {
                if (msg.role !== "assistant") return displayMsg;
                const isFresh = freshKeysThisRender.has(keyOf(msg));
                return { ...displayMsg, __isFresh: isFresh };
              })()}
              messageIndex={i}
              onEdit={
                onEditUserMessage && msg.role === "user" && !msg.content.startsWith("__FILE_UPLOAD__:")
                  ? (newContent) => onEditUserMessage(i, newContent)
                  : undefined
              }
              onRetry={
                onRetryAssistant && msg.role === "assistant" && !msg.content.startsWith("__")
                  ? () => onRetryAssistant(i)
                  : undefined
              }
              onEditPrevious={(() => {
                if (msg.role !== "assistant" || !onEditUserMessage) return undefined;
                // Find the preceding non-sentinel user message.
                let prev = i - 1;
                while (prev >= 0) {
                  const m = messages[prev];
                  if (m.role === "user" && !m.content.startsWith("__FILE_UPLOAD__:") && !SENTINELS.includes(m.content)) break;
                  prev--;
                }
                if (prev < 0) return undefined;
                return () => {
                  // Emit a window event the user Message can pick up to enter
                  // edit mode without a parent-state refactor. Scoped by index
                  // so only the right bubble flips.
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("stackle:edit-message", { detail: { index: prev } }));
                  }
                };
              })()}
            />
            {/* Fix 1 — always-pills. Renders chips inferred from the
                assistant message (either parsed from the prose or
                synthesized from a canonical-question pattern). Only on
                the last assistant message. */}
            {i === lastAssistantIdx && inlineOptions.length > 0 && (
              <div className="w-full max-w-3xl mx-auto px-4 -mt-2 mb-4">
                <div className="flex flex-wrap gap-2">
                  {inlineOptions.map((label, j) => (
                    <button
                      key={`${label}-${j}`}
                      onClick={() => {
                        if (onChatEditPrompt) onChatEditPrompt(label);
                        else onStarterPromptClick?.(label);
                      }}
                      className="text-[12px] font-medium text-gray-800 bg-white hover:bg-gray-50 border border-gray-300 hover:border-gray-900 rounded-full px-2.5 py-1 transition-all shadow-sm hover:shadow inline-flex items-center gap-1"
                    >
                      <span>{chipEmoji(label)}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {applyInstruction && onApplyInBuilder && (
              <div className="w-full max-w-3xl mx-auto px-4 -mt-2 mb-4">
                <button
                  onClick={() => onApplyInBuilder(applyInstruction!)}
                  className="text-xs font-semibold text-gray-900 bg-emerald-600 hover:bg-emerald-500 rounded-lg px-4 py-2 transition-colors inline-flex items-center gap-2"
                  title="Open Resume Builder and apply this rewrite"
                >
                  ✨ Apply in Resume Builder →
                </button>
                <p className="text-[10px] text-gray-600 mt-1.5">
                  Opens the Resume Builder with this rewrite queued as a live proposal. You can still Accept, Reject, or Rewrite before it lands.
                </p>
              </div>
            )}
          </div>
        );
      })}
      {isLoading && (
        loadingLabel === "Analysing resume" ? (
          <AnalysisProgress key="analysis-progress" />
        ) : (
          <div className="flex gap-3 mb-8 w-full max-w-3xl mx-auto px-4">
            <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageSquare className="w-3.5 h-3.5 text-black" strokeWidth={2} />
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              {loadingLabel ? (
                <span className="text-sm text-gray-500 flex items-center gap-2">
                  {loadingLabel}
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              ) : (
                <>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </>
              )}
            </div>
          </div>
        )
      )}
      {/* Bottom spacer — gives the scroll container enough room to
          actually push the user's just-sent message to the top of the
          viewport. Without it, the browser can't scroll past the
          natural content height and short replies stay mid-screen. */}
      <div style={{ minHeight: "60vh" }} aria-hidden />
      <div ref={bottomRef} />

      {/* Scroll-to-bottom button */}
      {!isNearBottom && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-4 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-all shadow-lg"
          style={{ marginLeft: "auto", marginRight: "16px", display: "flex" }}
          title="Scroll to bottom"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4.5L7 9.5L12 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
    {/* Starter-pill tray removed — felt like rigid clutter above the input.
        The chat input placeholder + the AI Coach card on the Report tab
        already point users to the right next move. */}
    </div>
  );
}
