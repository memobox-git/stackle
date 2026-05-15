"use client";

// Job Match — chat-first flow with 4 pills.
//
// Flow:
//   1. Welcome message: "Paste a JD URL or paste the text."
//   2. User pastes → POST /api/agents/jobmatch/parse → JD parsed,
//      job_matches row created.
//   3. Welcome refresh: "Got it — {role} at {company}. What now?"
//      + 4 pills (Match Report, Tailor Resume, Study Plan, Interview Prep).
//   4. Click a pill → pending ArtifactCard → agent fires → real card.
//
// Owns: paste handler, pill routing, job_matches row id, parsed JD
// state. Renders via ChatSurface so the look matches the rest of the app.

import { useEffect, useRef, useState } from "react";
import ChatSurface from "@/components/ChatSurface";
import { ChatMessage } from "@/components/Message";
import { createJobMatch, getJobMatch, type JobMatch } from "@/lib/supabase/jobMatches";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { buildMatchReportArtifact, buildTailoredResumeArtifact, buildStudyPlanArtifact, type Artifact } from "@/lib/artifacts";
import type { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";

interface JobMatchViewProps {
  // The resume the user wants to match against. Required to fire the
  // match analyzer; the welcome flow still works without it (user just
  // can't run pills until a resume is loaded).
  resumeExtraction: ResumeExtraction | null;
  resumeFilename?: string | null;
  // Optional generic resume analysis (from the chat-mode review). Used
  // by the tailor pill — when present the JD-tailored rewrite is
  // grounded in the user's existing strengths/gaps. Optional; the
  // tailor agent synthesizes priorities from the JD if missing.
  resumeAnalysis?: ResumeAnalysis | null;
  // Optional: a Job Match id to resume. When present, JobMatchView
  // hydrates state from job_matches + outputs and skips the paste
  // welcome.
  jobMatchId?: string | null;
  // Callback when the user clicks a tailored-resume artifact card.
  // The host (app/page.tsx) routes to Resume Builder with the
  // rewrite queued. Optional; if absent the card is non-clickable.
  onOpenTailoredResume?: (tailored: ResumeExtraction) => void;
}

const PILL_LABELS = [
  "Match Report",
  "Tailor my resume",
  "Tell me what to study",
  "Interview prep for this JD",
] as const;
type PillLabel = (typeof PILL_LABELS)[number];

function now() {
  const d = new Date();
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() < 12 ? "am" : "pm";
  return `${hh}:${mm} ${ampm}`;
}

export default function JobMatchView({ resumeExtraction, resumeFilename, resumeAnalysis, jobMatchId, onOpenTailoredResume }: JobMatchViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [jobMatch, setJobMatch] = useState<JobMatch | null>(null);
  const greetedRef = useRef(false);
  // Holds tailored ResumeExtraction payloads keyed by artifact id so
  // the onOpen handler can route the right one to Resume Builder.
  // Keeping it in a ref (not state) so re-renders don't blow it away.
  const tailoredCacheRef = useRef<Map<string, ResumeExtraction>>(new Map());

  // Hydrate from existing Job Match if id is provided.
  useEffect(() => {
    if (!jobMatchId) return;
    (async () => {
      const jm = await getJobMatch(jobMatchId);
      if (jm) {
        setJobMatch(jm);
        // Push a "resumed" welcome that shows the parsed JD + pills.
        setMessages([
          {
            role: "assistant",
            content: `Picking up where we left off — **${jm.role ?? "this role"}**${jm.company ? ` at **${jm.company}**` : ""}${jm.location ? ` (${jm.location})` : ""}. What do you want to do?`,
            timestamp: now(),
          },
          {
            role: "assistant",
            content: `__INLINE_CHIPS__:${PILL_LABELS.join("|")}`,
          },
        ]);
        greetedRef.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobMatchId]);

  // Initial greeting when there's no Job Match yet.
  useEffect(() => {
    if (greetedRef.current) return;
    if (jobMatchId) return; // hydration path handles it
    greetedRef.current = true;
    setMessages([
      {
        role: "assistant",
        content: "Paste a job description — either a URL (Greenhouse / Lever / Ashby work; LinkedIn might need pasted text) or the full JD text. I'll read it and we go from there.",
        timestamp: now(),
      },
    ]);
  }, [jobMatchId]);

  function pushUser(content: string) {
    setMessages((m) => [...m, { role: "user", content, timestamp: now() }]);
  }
  function pushAssistant(content: string, artifact?: Artifact) {
    setMessages((m) => [...m, { role: "assistant", content, timestamp: now(), artifact }]);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");

    // Two paths: paste-the-JD (first turn) OR pill response / free chat.
    if (!jobMatch) {
      // First-paste path. Send the text to the parser.
      pushUser(text);
      setIsLoading(true);
      try {
        const res = await fetch("/api/agents/jobmatch/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: text }),
        });
        if (!res.ok) throw new Error(`parse HTTP ${res.status}`);
        const data = await res.json() as { jobMatch: JobMatch };
        setJobMatch(data.jobMatch);
        const jm = data.jobMatch;
        pushAssistant(
          `Got it — **${jm.role ?? "this role"}**${jm.company ? ` at **${jm.company}**` : ""}${jm.location ? ` (${jm.location})` : ""}. What do you want to do?`,
        );
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `__INLINE_CHIPS__:${PILL_LABELS.join("|")}` },
        ]);
      } catch (err) {
        console.error("[jobmatch:parse] failed:", err);
        pushAssistant("Couldn't read that one — try a different URL or paste the JD text directly?");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // After JD is parsed: just append to chat. Pills handle the actions.
    pushUser(text);
  }

  async function handlePillClick(label: string) {
    const pill = label as PillLabel;
    if (!jobMatch) return;
    if (!resumeExtraction) {
      pushAssistant(
        `Upload your resume on the main chat first — I need it to ${pill.toLowerCase()}.`,
      );
      return;
    }

    if (pill === "Match Report") {
      // Push pending artifact, fire match analyzer.
      const pendingId = `match-report-pending-${jobMatch.id}-${Date.now()}`;
      const pending = buildMatchReportArtifact({
        id: pendingId,
        company: jobMatch.company,
        role: jobMatch.role,
        score: 0,
      });
      pending.title = `Analyzing match — ${jobMatch.role ?? "role"}${jobMatch.company ? ` at ${jobMatch.company}` : ""}`;
      pending.subtitle = "Scoring against your primary resume";
      pending.pending = true;
      pushAssistant("On it.", pending);

      try {
        const res = await fetch("/api/agents/jobmatch/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobMatchId: jobMatch.id,
            resumeExtraction,
          }),
        });
        if (!res.ok) throw new Error(`match HTTP ${res.status}`);
        const data = await res.json() as {
          analysis: { score: number; verdict: string; honestCall: string };
        };
        const real = buildMatchReportArtifact({
          id: `match-report-${jobMatch.id}-${Date.now()}`,
          company: jobMatch.company,
          role: jobMatch.role,
          score: data.analysis.score,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.artifact?.id === pendingId
              ? {
                  role: "assistant",
                  content: data.analysis.honestCall || "Here's where you stand:",
                  timestamp: now(),
                  artifact: real,
                }
              : m,
          ),
        );
      } catch (err) {
        console.error("[jobmatch:match] failed:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.artifact?.id === pendingId
              ? {
                  role: "assistant",
                  content: "Match analyzer hit a snag. Try again?",
                  timestamp: now(),
                }
              : m,
          ),
        );
      }
      return;
    }

    if (pill === "Tailor my resume") {
      const pendingId = `tailored-resume-pending-${jobMatch.id}-${Date.now()}`;
      const pending = buildTailoredResumeArtifact({
        id: pendingId,
        company: jobMatch.company,
        role: jobMatch.role,
      });
      pending.title = `Tailoring your resume — ${jobMatch.role ?? "role"}${jobMatch.company ? ` at ${jobMatch.company}` : ""}`;
      pending.subtitle = "Rewriting bullets + summary for this JD";
      pending.pending = true;
      pushAssistant("Tailoring it now. Opus rewrites take a minute or so.", pending);

      try {
        const res = await fetch("/api/agents/jobmatch/tailor-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobMatchId: jobMatch.id,
            resumeExtraction,
            priorAnalysis: resumeAnalysis ?? null,
          }),
        });
        if (!res.ok) throw new Error(`tailor-resume HTTP ${res.status}`);
        const data = await res.json() as {
          tailored: ResumeExtraction;
          changedKeys: string[];
          qualityWarnings?: string[];
        };
        const unchanged = (data.qualityWarnings ?? []).some((w) => w.toLowerCase().includes("identical to input"));
        if (unchanged) {
          throw new Error("Rewriter returned the same resume — try again.");
        }
        const real = buildTailoredResumeArtifact({
          id: `tailored-resume-${jobMatch.id}-${Date.now()}`,
          company: jobMatch.company,
          role: jobMatch.role,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.artifact?.id === pendingId
              ? {
                  role: "assistant",
                  content: `Done. ${data.changedKeys.length} section${data.changedKeys.length === 1 ? "" : "s"} touched. Click the card to open it in Resume Builder.`,
                  timestamp: now(),
                  artifact: real,
                  // Hold the tailored extraction in the message so the
                  // host can route it to Resume Builder on click.
                  // (artifact.id is unique; we look up by id when
                  // onOpen fires.)
                }
              : m,
          ),
        );
        // Stash so onOpenTailoredResume can find it.
        if (onOpenTailoredResume) {
          tailoredCacheRef.current.set(real.id, data.tailored);
        }
      } catch (err) {
        console.error("[jobmatch:tailor] failed:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.artifact?.id === pendingId
              ? {
                  role: "assistant",
                  content: `Tailor failed — ${err instanceof Error ? err.message : "unknown error"}. Try again?`,
                  timestamp: now(),
                }
              : m,
          ),
        );
      }
      return;
    }

    if (pill === "Tell me what to study") {
      const pendingId = `study-plan-pending-${jobMatch.id}-${Date.now()}`;
      const pending = buildStudyPlanArtifact({
        id: pendingId,
        company: jobMatch.company,
        role: jobMatch.role,
        itemCount: 0,
      });
      pending.title = `Building study plan — ${jobMatch.role ?? "role"}`;
      pending.subtitle = "Mapping gaps to skills + resources";
      pending.pending = true;
      pushAssistant("On it. Sonnet's ~10s.", pending);

      try {
        const res = await fetch("/api/agents/jobmatch/study-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobMatchId: jobMatch.id }),
        });
        if (!res.ok) throw new Error(`study-plan HTTP ${res.status}`);
        const data = await res.json() as { plan: { items: { skill: string; priority: string; estTimeHours: number }[]; overallTimeline: string } };
        const real = buildStudyPlanArtifact({
          id: `study-plan-${jobMatch.id}-${Date.now()}`,
          company: jobMatch.company,
          role: jobMatch.role,
          itemCount: data.plan.items.length,
        });
        // Render a short inline preview of the top items so the user
        // can see the plan without opening the artifact. Top 3 by
        // priority order (high → medium → low).
        const ordered = [...data.plan.items].sort((a, b) => {
          const score = (p: string) => p === "high" ? 0 : p === "medium" ? 1 : 2;
          return score(a.priority) - score(b.priority);
        });
        const top = ordered.slice(0, 3);
        const preview = top
          .map((it) => `**${it.skill}** (${it.priority}, ~${it.estTimeHours}h)`)
          .join(" · ");
        setMessages((prev) =>
          prev.map((m) =>
            m.artifact?.id === pendingId
              ? {
                  role: "assistant",
                  content: `${data.plan.overallTimeline || "Here's the plan:"}\n\n${preview}${data.plan.items.length > 3 ? `\n\n+${data.plan.items.length - 3} more — open the card for the full list.` : ""}`,
                  timestamp: now(),
                  artifact: real,
                }
              : m,
          ),
        );
      } catch (err) {
        console.error("[jobmatch:study-plan] failed:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.artifact?.id === pendingId
              ? {
                  role: "assistant",
                  content: `Study plan failed — ${err instanceof Error ? err.message : "unknown error"}. Try again?`,
                  timestamp: now(),
                }
              : m,
          ),
        );
      }
      return;
    }

    // Interview Prep ships in Phase 4.
    pushAssistant(`"${pill}" ships in the next phase — wired but not active yet.`);
  }

  function onChatEditPrompt(prompt: string) {
    // Intercept the 4 known pill labels; everything else is free chat.
    if ((PILL_LABELS as readonly string[]).includes(prompt)) {
      handlePillClick(prompt);
      return;
    }
    setInput(prompt);
  }

  return (
    <ChatSurface
      className="flex-1 min-h-0"
      messages={messages}
      isLoading={isLoading}
      resumeAnalysis={null}
      marketAnalysis={null}
      resumePreview={null}
      resumeExtraction={resumeExtraction}
      interviewPrepPlan={null}
      resumeText={null}
      onSend={(text) => {
        setInput(text);
        setTimeout(() => handleSend(), 0);
      }}
      onChatEditPrompt={onChatEditPrompt}
      onOpenArtifact={(artifact) => {
        if (artifact.kind === "tailored_resume") {
          const tailored = tailoredCacheRef.current.get(artifact.id);
          if (tailored) onOpenTailoredResume?.(tailored);
        }
      }}
      inputValue={input}
      onInputChange={setInput}
      onInputSend={handleSend}
      inputDisabled={isLoading}
      inputBusy={isLoading}
      inputPlaceholder={
        jobMatch
          ? `Ask anything about ${jobMatch.role ?? "this role"}…`
          : "Paste the JD URL or the JD text…"
      }
    />
  );
}
