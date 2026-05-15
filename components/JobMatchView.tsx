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
import { buildMatchReportArtifact, type Artifact } from "@/lib/artifacts";

interface JobMatchViewProps {
  // The resume the user wants to match against. Required to fire the
  // match analyzer; the welcome flow still works without it (user just
  // can't run pills until a resume is loaded).
  resumeExtraction: ResumeExtraction | null;
  resumeFilename?: string | null;
  // Optional: a Job Match id to resume. When present, JobMatchView
  // hydrates state from job_matches + outputs and skips the paste
  // welcome.
  jobMatchId?: string | null;
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

export default function JobMatchView({ resumeExtraction, resumeFilename, jobMatchId }: JobMatchViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [jobMatch, setJobMatch] = useState<JobMatch | null>(null);
  const greetedRef = useRef(false);

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

    // The other 3 pills (Tailor, Study, Prep) come in Phases 2-4.
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
