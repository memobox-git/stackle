"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { parseFile, ACCEPTED_EXTENSIONS } from "@/lib/parseFile";
import { Plus, Home as HomeIcon, FileText, ClipboardList, Menu, X, Trash2, LogOut, Upload, FolderOpen, Download, Link2, Check, Mail, MessagesSquare, Target, Globe, GitBranch, User as UserIcon, Settings as SettingsIcon, ChevronDown, BookOpen, Sparkles, ScrollText, BookMarked, Briefcase, Mic, FileEdit, GraduationCap } from "lucide-react";
import { downloadResumePdf, buildShareLink } from "@/lib/resumeExport";
import { buildResumeReviewArtifact, buildTailoredResumeArtifact, buildQuickQuestionsArtifact, buildSkillAssessmentArtifact, buildCoverLetterArtifact, type Artifact } from "@/lib/artifacts";
import ArtifactPreviewPane from "@/components/ArtifactPreviewPane";
import { deriveScoreFromAnalysis } from "@/lib/score";
import { newFlowId, flowStart, flowInfo } from "@/lib/flowLog";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import ChatSurface from "@/components/ChatSurface";
import HomeInput from "@/components/HomeInput";
import ResumeBuilder from "@/components/ResumeBuilder";
import InterviewView from "@/components/interview/InterviewView";
import JobMatchView from "@/components/JobMatchView";
import LearnView from "@/components/LearnView";
import MarketingLanding from "@/components/marketing/LandingPage";
import AppChatPanel from "@/components/AppChatPanel";
import { getCurrentProfile, buildProfileFromResume } from "@/lib/supabase/profiles";
import { pickHeroGreeting } from "@/lib/heroGreetings";
import { ChatMessage } from "@/components/Message";
import {
  OrchestratorDecision,
  DEFAULT_ORCHESTRATOR_DECISION,
} from "@/lib/agents/schemas/orchestrator";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import { MarketAnalysis } from "@/lib/agents/schemas/marketIntelligence";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { buildResumeBuilderWelcome, firstRealJob } from "@/lib/agents/prompts/resumeBuilderWelcome";
import { InterviewPrepPlan } from "@/lib/agents/schemas/interviewPrep";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  loadChats,
  createChat,
  updateChat,
  deleteChat,
  deriveChatTitle,
  SupabaseChat,
} from "@/lib/supabase/chats";
import {
  DriveFile,
  saveOriginalResume,
  saveReport,
  loadDriveFiles,
  loadAllDriveFiles,
} from "@/lib/supabase/drive";
import DriveVersionPanel from "@/components/DriveVersionPanel";
import { IntakeData } from "@/components/IntakeForm";
import type { User } from "@supabase/supabase-js";
import OnboardingFlow from "@/components/OnboardingFlow";
import AuthModal from "@/components/AuthModal";

type ActiveView = "chat" | "resume-builder" | "drive" | "interview" | "learn" | "job-match";

// Instant dark tooltip shown to the right of a collapsed sidebar icon.
// Uses Tailwind's group-hover; must live inside a parent with `relative group`.
function SidebarTooltip({ label }: { label: string }) {
  return (
    <span
      className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-md bg-gray-900 text-xs font-medium text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-50"
      role="tooltip"
    >
      {label}
    </span>
  );
}

// Two pills after the report. User-requested simplification: the
// report is read-only; the only forward action is to RECREATE the
// resume — either with all the fixes the report identified, or
// tailored to a specific JD the user pastes.
function buildWelcomeChipsForAnalysis(_analysis: ResumeAnalysis | null): string {
  return "__INLINE_CHIPS__:Recreate with all Fixes|Recreate with JD";
}

const SENTINELS = [
  "__RESUME_PREVIEW__",
  "__RESUME_ANALYSIS__",
  "__RESUME_PRIORITIES__",
  "__MARKET_ANALYSIS__",
  "__RESUME_EXTRACTION__",
  "__INTERVIEW_PREP__",
  "__RESUME_WELCOME_CARD__",
  "__FIX_PROGRESS_CARD__",
];

const MODE_LABELS: Record<string, string> = {
  resume_review: "Resume review",
  market_match: "Market match",
  both: "Full analysis",
  interview_prep: "Interview prep",
};

export default function Page() {
  // ── Auth ──────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // null = check pending, true = needs to set up username, false = ready.
  // Auth-init effect resolves this once the user is known.
  const [needsProfileSetup, setNeedsProfileSetup] = useState<null | boolean>(null);
  // First name from the profiles row — surfaces in greetings, header,
  // and anywhere we'd otherwise default to the resume.name.
  const [profileFirstName, setProfileFirstName] = useState<string | null>(null);
  const [profileLastName, setProfileLastName] = useState<string | null>(null);
  // Persistent chat panel — open by default in Interview / Foundations /
  // Drive views. User can close to give the workspace full width.
  // State lives at app shell level so toggling persists across view
  // switches within a session.
  const [appChatPanelOpen, setAppChatPanelOpen] = useState<boolean>(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState("");
  // Default true: every user lands on the chat hero immediately. The
  // old multi-step OnboardingFlow (upload → configure → analyze) is
  // bypassed — the orchestrator + chip handlers (e.g. Review my resume
  // → 'Which resume?' chooser → file picker when none loaded) invite
  // the user to upload exactly when it matters.
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  // True while we're still figuring out whether this is a returning
  // user (loadChats + Drive check in flight). Prevents the upload
  // screen from briefly flashing for users who'll be rehydrated from
  // Drive a second later.
  const [bootChecking, setBootChecking] = useState(true);

  // ── Career goal (from onboarding step 3) ──────────────
  // Hoisted to component scope so synthesis prompt + Career Profile
  // landing screen can both read it.
  const [careerGoal, setCareerGoal] = useState<string | null>(null);
  // The role the user explicitly picked at upload (Data Engineer, ML, etc).
  // Separate from careerGoal (filled later) and from analysis.likelyTargetRole
  // (auto-detected). Chat welcome flags mismatches between this and the
  // seniority the analyzer chose to benchmark against.
  const [chosenTargetRole, setChosenTargetRole] = useState<string | null>(null);
  // Stackle Orchestrator outputs the user's focus signal (resume / interview
  // / tailor_jd / cover_letter / career_strategy / null). We mirror it here
  // so the analysis-landed watcher knows whether to drop the report and so
  // the sendMessage Phase B branch can act on routing decisions across
  // turns.
  type FocusKey = "resume" | "interview" | "tailor_jd" | "cover_letter" | "career_strategy" | null;
  const [orchFocus, setOrchFocus] = useState<FocusKey>(null);
  const [orchSeniority, setOrchSeniority] = useState<string | null>(null);
  const orchFocusRef = useRef<FocusKey>(null);
  useEffect(() => { orchFocusRef.current = orchFocus; }, [orchFocus]);

  // ── Chat sessions ─────────────────────────────────────
  const [chatList, setChatList] = useState<SupabaseChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [hoverChatId, setHoverChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => { activeChatIdRef.current = activeChatId; }, [activeChatId]);

  // ── UI ────────────────────────────────────────────────
  // Persist activeView across reloads + tab switches via localStorage.
  // Without this, opening the app in another tab / closing + returning
  // dumped the user back on the chat view even if they were drilling
  // interview prep. Initial render reads from storage; subsequent
  // updates write through a useEffect (see below).
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window === "undefined") return "chat";
    const saved = localStorage.getItem("stackle_active_view");
    const valid: ActiveView[] = ["chat", "resume-builder", "drive", "interview", "learn", "job-match"];
    return (valid as string[]).includes(saved ?? "") ? (saved as ActiveView) : "chat";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("stackle_active_view", activeView); } catch { /* ignore */ }
  }, [activeView]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  // Toast surfaced when the user clicks a locked nav item (Cover Letter,
  // Profile, Settings, etc). Auto-dismisses after 1.6s.
  const [navToast, setNavToast] = useState<string | null>(null);
  const navToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showNavToast(label: string) {
    if (navToastTimerRef.current) clearTimeout(navToastTimerRef.current);
    setNavToast(`${label} is coming soon.`);
    navToastTimerRef.current = setTimeout(() => setNavToast(null), 1600);
  }
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAnalyzingResume, setIsAnalyzingResume] = useState(false);

  // ── Messages ──────────────────────────────────────────
  // ONE chat thread per session. View switching (chat / resume-builder /
  // drive) only changes which panel renders on the right — the chat thread
  // is always the same. Previous architecture had two parallel buckets
  // gated on activeView which caused messages to be wiped on view switches
  // and refreshes; this unified store fixes that and unblocks per-tool
  // panels (interview prep, JD match, etc.) without per-tool chats.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [resumeInput, setResumeInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // AbortController for the currently-running agent call so the user can Stop
  // mid-stream. Attached to orchestrate + synthesize — the two main fetches
  // kicked off from the user pressing Send in the chat input.
  const agentAbortRef = useRef<AbortController | null>(null);
  // Ref mirrors the latest sendMessage closure so edit-and-resend can invoke
  // the fresh version after a truncate-state update commits. Populated by the
  // useEffect further down.
  const sendMessageRef = useRef<((text: string) => void) | null>(null);

  // ── Resume state ──────────────────────────────────────
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [resumeFilename, setResumeFilename] = useState<string | undefined>();
  const [resumeFileUrl, setResumeFileUrl] = useState<string | null>(null);
  const [resumeDocHtml, setResumeDocHtml] = useState<string | null>(null);
  const [resumeExtraction, setResumeExtraction] = useState<ResumeExtraction | null>(null);
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(null);
  const [intakeData, setIntakeData] = useState<IntakeData | null>(null);
  const [intakeStep, setIntakeStep] = useState(0); // 0=off 1=Q1 2=Q2 3=Q3 4=Q4 5=done
  const [intakeAnswers, setIntakeAnswers] = useState<Record<string, string>>({});

  // ── Drive state ───────────────────────────────────────
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  // When the user clicks "Apply in Resume Builder →" on a main-chat message,
  // we stash the instruction here, flip to resume-builder, and ResumeBuilder's
  // effect picks it up on mount → fires the normal fix flow → clears it.
  const [pendingBuilderInstruction, setPendingBuilderInstruction] = useState<string | null>(null);

  // ── Chat-first orchestrator (Phase 2/3) ────────────────
  // Resume Builder mode chat routes through /api/agents/resume-orchestrator
  // which streams Sonnet 4.5 with tool use. Tool calls land here as a
  // ChatToolEvent and ResumeBuilder consumes them via the prop below.
  type ChatToolEvent = {
    ts: number;
    name: string;
    input: Record<string, unknown>;
  };
  const [pendingChatTool, setPendingChatTool] = useState<ChatToolEvent | null>(null);
  type ConversationStateLite = {
    acceptedFixes: string[];
    rejectedFixes: string[];
    acceptedPriorityIndices: number[];
    preferredStyle: "modern" | "conservative" | "senior" | "casual" | "punchy" | "default" | null;
    styleNote: string | null;
    customInstructions: string[];
    scoreJourney: { at: number; score: number }[];
    pendingConfirmation: { kind: string; payload: unknown } | null;
  };
  const [conversationState, setConversationState] = useState<ConversationStateLite>({
    acceptedFixes: [],
    rejectedFixes: [],
    acceptedPriorityIndices: [],
    preferredStyle: null,
    styleNote: null,
    customInstructions: [],
    scoreJourney: [],
    pendingConfirmation: null,
  });
  const conversationStateRef = useRef(conversationState);
  useEffect(() => { conversationStateRef.current = conversationState; }, [conversationState]);
  // Drive row action state: which file we're currently PDF-exporting, and
  // which row just had its share link copied (shows a ✓ for ~1.5s).
  const [driveDownloadingId, setDriveDownloadingId] = useState<string | null>(null);
  const [driveCopiedId, setDriveCopiedId] = useState<string | null>(null);

  async function handleDriveDownload(file: DriveFile) {
    if (!file.extraction_json) {
      alert("This file doesn't have resume data attached — can't export as PDF.");
      return;
    }
    setDriveDownloadingId(file.id);
    try {
      await downloadResumePdf(file.extraction_json, file.display_name);
    } catch (err) {
      console.error("[drive] pdf export failed:", err);
      alert("PDF export failed. Try again.");
    } finally {
      setDriveDownloadingId(null);
    }
  }

  async function handleDriveShare(file: DriveFile) {
    if (!file.extraction_json) {
      alert("This file doesn't have resume data attached — can't share.");
      return;
    }
    const url = buildShareLink(file.extraction_json);
    if (!url) {
      alert("Resume is too large to share via URL. Try the PDF download instead.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setDriveCopiedId(file.id);
      setTimeout(() => setDriveCopiedId((id) => (id === file.id ? null : id)), 1500);
    } catch {
      alert("Couldn't copy the link. Try again.");
    }
  }
  const [driveLoading, setDriveLoading] = useState(false);
  const [originalDriveFileId, setOriginalDriveFileId] = useState<string | null>(null);

  // ── Open report panel from sidebar ───────────────────
  const [openReportSignal, setOpenReportSignal] = useState(0);

  // ── Analysis state ────────────────────────────────────
  const [orchestratorDecision, setOrchestratorDecision] = useState<OrchestratorDecision | null>(null);
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis | null>(null);
  const [analyzedMarketKey, setAnalyzedMarketKey] = useState<string | null>(null);
  const [interviewPrepPlan, setInterviewPrepPlan] = useState<InterviewPrepPlan | null>(null);
  const resumePreview = null;
  const homeFileInputRef = useRef<HTMLInputElement>(null);
  // Always-mounted hidden file input for the in-chat "Upload a new one"
  // chip from the resume-review chooser. The homeFileInputRef above is
  // only rendered when the Home view is active, so a separate input is
  // needed for chat-driven uploads.
  const chatUploadInputRef = useRef<HTMLInputElement>(null);
  // True after the user clicked "Review my resume" — the next chip click
  // is interpreted as their choice of source. Cleared when they pick or
  // cancel.
  const [pendingResumeReviewSource, setPendingResumeReviewSource] = useState(false);
  // Snapshot of Drive files at the moment the user opened "Pick from
  // Drive" so the chip labels and the click handler agree on the same
  // list (avoids a race if Drive refreshes mid-pick).
  const driveResumesForPickerRef = useRef<DriveFile[]>([]);
  // Holds tailored ResumeExtraction payloads keyed by artifact id. When
  // the user clicks "Recreate with all Fixes" or "Recreate with JD",
  // the rewriter output is stashed here so onOpenArtifact can route to
  // a preview without re-running the agent.
  const recreatedResumeCacheRef = useRef<Map<string, ResumeExtraction>>(new Map());
  // True while a "Recreate with JD" intake is waiting for the user to
  // paste the JD. Next user message becomes the JD input.
  const [pendingJDForRecreate, setPendingJDForRecreate] = useState(false);
  // Holds the most recent intent-router classification so chip click
  // handlers (skill assessment, drill, etc.) can read detectedSkill
  // without re-classifying. Cleared once a chip fires.
  const intentContextRef = useRef<{ category: string; detectedSkill: string | null } | null>(null);
  // Pending intake for "For a specific JD" / "For a company" cover
  // letter chips — captures what we're waiting for so the next user
  // message can be intercepted.
  const [pendingCoverLetterIntake, setPendingCoverLetterIntake] = useState<null | "jd" | "company">(null);
  // Same pattern for cover letter caching — generated letter stashed
  // by artifact id so onOpenArtifact can route to a preview.
  const coverLetterCacheRef = useRef<Map<string, string>>(new Map());
  // Currently-open artifact in the right-side preview pane. Null when
  // nothing is open. Set by the artifact card's onOpen handler.
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  // Multi-step questionnaire state. When non-null, the engine is mid-
  // intake: each user message is the answer to the current step, then
  // either advances to the next step or fires the generator.
  const [activeQuestionnaire, setActiveQuestionnaire] = useState<{
    kind: import("@/lib/artifacts").ArtifactKind;
    stepIdx: number;
    answers: Record<string, string>;
  } | null>(null);
  // Ref that points to the per-artifact generator dispatcher. Set by
  // commits that wire specific artifact generators (cover letter,
  // tailored resume, etc.). The questionnaire engine calls this when
  // all steps are answered. Null = no dispatcher wired yet.
  const questionnaireDispatchRef = useRef<
    | null
    | ((
        kind: import("@/lib/artifacts").ArtifactKind,
        answers: Record<string, string>,
      ) => void)
  >(null);

  // Register the dispatcher. Each artifact kind has its own generator
  // that turns the collected answers into a real artifact card.
  useEffect(() => {
    questionnaireDispatchRef.current = async (kind, answers) => {
      if (kind === "cover_letter") {
        const company = answers.company === "No specific company" ? "" : (answers.company ?? "");
        const tone = answers.tone ?? "Warm + professional";
        const jdText = answers.jdSource === "Paste the JD" ? (answers.jdText ?? "") : "";
        const pendingId = `cover-letter-pending-${Date.now()}`;
        const pending = buildCoverLetterArtifact({
          id: pendingId,
          company: company || null,
          role: resumeExtraction?.experience?.[0]?.title ?? null,
        });
        pending.title = company ? `Drafting cover letter — ${company}` : "Drafting cover letter";
        pending.subtitle = `${tone} · ${jdText ? "JD-tuned" : "resume-grounded"}`;
        pending.pending = true;
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant" as const, content: "", timestamp: now(), artifact: pending },
        ]);
        try {
          if (!resumeExtraction) throw new Error("Upload your resume first.");
          const res = await fetch("/api/agents/cover-letter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              extraction: resumeExtraction,
              targetRole: resumeExtraction.experience?.[0]?.title ?? "Senior role",
              companyName: company,
              jobDescription: jdText,
              tone, // pass through; route may or may not honor it
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `HTTP ${res.status}`);
          }
          const data = await res.json() as { coverLetter?: string; text?: string };
          const letter = data.coverLetter ?? data.text ?? "";
          if (!letter) throw new Error("Empty cover letter returned.");
          const realId = `cover-letter-${Date.now()}`;
          const real = buildCoverLetterArtifact({
            id: realId,
            company: company || null,
            role: resumeExtraction.experience?.[0]?.title ?? null,
          });
          real.title = company ? `Cover letter — ${company}` : "Cover letter";
          real.subtitle = `${tone} · ${jdText ? "JD-tuned" : "resume-grounded"} · Tap to read`;
          coverLetterCacheRef.current.set(realId, letter);
          setChatMessages((prev) => prev.map((m) =>
            m.artifact?.id === pendingId
              ? { role: "assistant" as const, content: "Done.", timestamp: now(), artifact: real }
              : m
          ));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setChatMessages((prev) => prev.map((m) =>
            m.artifact?.id === pendingId
              ? { role: "assistant" as const, content: `Couldn't draft — ${msg}.`, timestamp: now() }
              : m
          ));
        }
      }
      // Other artifact kinds wire their dispatchers in subsequent
      // commits. Unknown kind → noop (defensive).
    };
  }, [resumeExtraction]);

  // ── Derived ───────────────────────────────────────────
  const isSignedUp = user !== null;
  // isResumeMode kept for callers that want to know which panel is open
  // (e.g. for sidebar styling, persistChat's mode arg). Crucially: it does
  // NOT gate which messages are in scope — there's one shared thread.
  const isResumeMode = activeView === "resume-builder";

  // Guard: if the user navigates to Resume Builder without a parsed
  // resume in state, bounce them back to the chat view. The chat hero
  // + source chooser handle 'no resume → upload' end-to-end; the
  // Resume Builder shell has nothing to show until a resume exists.
  useEffect(() => {
    if (activeView === "resume-builder" && !resumeExtraction) {
      setActiveView("chat");
    }
  }, [activeView, resumeExtraction]);
  const messages = chatMessages;
  const setMessages = setChatMessages;
  const input = isResumeMode ? resumeInput : chatInput;
  const setInput = isResumeMode ? setResumeInput : setChatInput;

  // Edit a user message: truncate everything from that index onwards (the old
  // reply is now stale), then resend the edited content through the normal
  // sendMessage pipeline so the agent regenerates a fresh reply.
  // sendMessage closes over the current messages array; after the truncate
  // state update, the next render re-creates sendMessage. We access that
  // fresh version via a ref (updated below) so the send actually uses the
  // truncated history, not the stale one from this render's closure.
  function handleEditUserMessage(index: number, newContent: string) {
    setChatMessages((prev) => prev.slice(0, index));
    setTimeout(() => sendMessageRef.current?.(newContent), 0);
  }

  // Retry: find the user message that prompted this assistant response,
  // drop the assistant response (and everything after — there usually
  // isn't anything after, but stay defensive), then re-send the user
  // message. Same path as edit, just with the original content.
  function handleRetryAssistant(assistantIndex: number) {
    setChatMessages((prev) => {
      let userIdx = assistantIndex - 1;
      while (userIdx >= 0) {
        const m = prev[userIdx];
        if (m.role === "user" && !m.content.startsWith("__FILE_UPLOAD__:") && !m.content.startsWith("__")) break;
        userIdx--;
      }
      if (userIdx < 0) return prev;
      const userContent = prev[userIdx].content;
      // Drop the user message + everything after, then resend it so the
      // new assistant turn appears fresh (typewriter, etc).
      setTimeout(() => sendMessageRef.current?.(userContent), 0);
      return prev.slice(0, userIdx);
    });
  }

  // ── Auth init ─────────────────────────────────────────
  // CRITICAL: Supabase fires onAuthStateChange not just on sign-in/sign-out
  // but on TOKEN_REFRESHED — which happens every time the browser tab
  // regains focus after being backgrounded. If we naively setUser() on
  // every event, the new user object identity ripples through any
  // useEffect with [user] in its deps and re-fires chat-load logic,
  // which historically stomped activeView back to "chat". Track the
  // user ID and short-circuit when nothing actually changed.
  const lastUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      lastUserIdRef.current = session?.user?.id ?? null;
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user?.id ?? null;
      if (nextId === lastUserIdRef.current) {
        // Same user — token refresh, focus event, periodic check. Ignore.
        // (Logged once for debugging; remove if too chatty.)
        if (process.env.NODE_ENV !== "production") {
          console.log("[auth] skip same-user event:", event, "id=", nextId);
        }
        return;
      }
      const prevId = lastUserIdRef.current;
      lastUserIdRef.current = nextId;
      setUser(session?.user ?? null);
      if (!session?.user) {
        // Defer the reset a tick so React commits the auth change first —
        // otherwise chat messages flicker out an instant before the next
        // render settles into the signed-out view.
        setTimeout(() => {
          resetAllState();
          setChatList([]);
          setActiveChatId(null);
        }, 0);
      } else if (prevId === null && nextId !== null) {
        // Fresh sign-in transition (null → user). Industry standard:
        // land on a fresh chat hero, NOT on whatever surface the
        // previous session left in localStorage. Reset activeView to
        // "chat" + clear any stale in-memory chat thread. The boot
        // useEffect (depends on user + authLoading) takes over from
        // here to load sidebar chats without auto-restoring.
        setActiveView("chat");
        setChatMessages([]);
        setActiveChatId(null);
        try { localStorage.setItem("stackle_active_view", "chat"); } catch { /* ignore */ }
      }
    });
    // Check localStorage onboarding (auth-free for now)
    try {
      const saved = localStorage.getItem("stackle_onboarding");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.completed) {
          setOnboardingCompleted(true);
          if (parsed.resumeText) {
            setResumeText(parsed.resumeText);
            setResumeFilename(parsed.resumeFilename);
          }
          if (parsed.resumeExtraction) setResumeExtraction(parsed.resumeExtraction);
          if (parsed.resumeAnalysis) setResumeAnalysis(parsed.resumeAnalysis);
          // If analysis was still running when onboarding completed, poll
          // localStorage for it to arrive.
          if (parsed.resumeAnalysisPending && !parsed.resumeAnalysis) {
            let attempts = 0;
            const poll = setInterval(() => {
              attempts++;
              try {
                const latest = localStorage.getItem("stackle_onboarding");
                if (!latest) { clearInterval(poll); return; }
                const p = JSON.parse(latest);
                if (p.resumeAnalysis) {
                  setResumeAnalysis(p.resumeAnalysis);
                  clearInterval(poll);
                }
              } catch { /* ignore */ }
              if (attempts > 30) clearInterval(poll); // ~60s max
            }, 2000);
          }
        }
      }
    } catch { /* continue */ }
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Profile setup gate ──────────────────────────────────
  // Every authed user needs a username before they reach the chat
  // hero. This effect fires once auth resolves: if no profile row OR
  // username is null, route to /profile/setup. Otherwise mark ready.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setNeedsProfileSetup(false); return; }
    (async () => {
      try {
        const profile = await getCurrentProfile();
        const needs = !profile?.username;
        setNeedsProfileSetup(needs);
        if (profile?.first_name) setProfileFirstName(profile.first_name);
        if (profile?.last_name) setProfileLastName(profile.last_name);
        if (needs) {
          if (typeof window !== "undefined" && window.location.pathname !== "/profile/setup") {
            window.location.href = "/profile/setup";
          }
        }
      } catch (err) {
        console.warn("[profile-gate] failed:", err);
        // Fail open — let them into the app rather than block on a network blip.
        setNeedsProfileSetup(false);
      }
    })();
  }, [user, authLoading]);

  // ── Load chats (works for authed AND unauth users) ──────
  // Authed: pulls rows from Supabase. Unauth: pulls from localStorage via
  // the same loadChats() helper. Either way we ensure activeChatId is
  // pinned to a real chat so persistChat downstream actually has somewhere
  // to write — without this, unauth users had zero persistence and any
  // refresh wiped the whole conversation.
  // We wait until authLoading is false so we know whether we're auth'd.
  useEffect(() => {
    if (authLoading) return;
    setBootChecking(true);
    console.log("[boot] starting check", { authed: !!user, userId: user?.id });
    loadChats()
      .then(async (chats) => {
        console.log("[boot] loadChats →", {
          count: chats.length,
          firstChatMessages: chats[0]?.messages?.length ?? 0,
          firstChatMode: chats[0]?.mode,
          firstChatHasExtraction: !!chats[0]?.resume_extraction,
        });
        if (chats.length === 0) {
          // No chat rows. For an AUTH'D user this can still be a
          // returning user — they might have a saved resume in Drive
          // from a previous session (chats sometimes get wiped while
          // Drive files survive). Check Drive before deciding.
          if (user) {
            try {
              const driveFiles = await loadAllDriveFiles();
              console.log("[boot] Drive scan →", {
                totalFiles: driveFiles.length,
                originals: driveFiles.filter((f) => f.file_type === "original").length,
                typesPresent: [...new Set(driveFiles.map((f) => f.file_type))],
              });
              const original = driveFiles.find((f) => f.file_type === "original");
              if (original) {
                console.log("[boot] ✓ Drive original found — skipping onboarding", {
                  id: original.id,
                  displayName: original.display_name,
                  hasExtraction: !!original.extraction_json,
                  hasAnalysis: !!original.analysis_json,
                });
                const ext = original.extraction_json;
                if (ext) {
                  setResumeExtraction(ext);
                  setResumeText("");
                  setResumeFilename(original.display_name ?? "resume.pdf");
                  if (original.analysis_json) setResumeAnalysis(original.analysis_json);
                  setOnboardingCompleted(true);
                } else {
                  console.warn("[boot] Drive original has no extraction_json — staying on upload");
                }
                // Seed a fresh chat tied to this restored resume so
                // future messages have somewhere to persist to.
                const newChat = await createChat("chat", {
                  resumeText: "",
                  resumeFilename: original.display_name ?? null,
                  resumeExtraction: ext,
                  resumeAnalysis: original.analysis_json,
                });
                setChatList([newChat]);
                setActiveChatId(newChat.id);
                return;
              } else {
                console.log("[boot] no Drive original — treating as new user");
              }
            } catch (err) {
              console.warn("[boot] Drive check failed:", err);
            }
          }
          // Genuine empty state: new user or unauth without localStorage.
          // Seed a placeholder chat so future messages have somewhere to
          // attach. Onboarding flow stays gated until they upload.
          console.log("[createChat] from loadChats — no existing chats, no Drive original");
          const prof = getProfileResume();
          const newChat = await createChat("chat", {
            resumeText: prof.resumeText,
            resumeFilename: prof.resumeFilename ?? null,
            resumeExtraction: prof.resumeExtraction,
            resumeAnalysis: prof.resumeAnalysis,
          });
          setChatList([newChat]);
          setActiveChatId(newChat.id);
        } else {
          // Returning user with existing chats. Industry standard
          // (Claude / ChatGPT): land on a FRESH chat hero — old chats
          // are one click away in the sidebar. Do NOT auto-restore.
          //
          // Old behaviour was setActiveChatId(mostRecentWithResume) +
          // restoreChatState(...). That dropped users back into a
          // Resume Builder mid-conversation when they expected a fresh
          // start. Now: load the sidebar list, hydrate resume context
          // from Drive so the hero shows "Resume loaded: X" if any,
          // and leave activeChatId null so the empty-hero renders.
          setChatList(chats);

          // Resume context (extraction + filename + analysis) carries
          // forward from the most recent chat that had it, so the user
          // doesn't have to re-upload to start a new conversation about
          // the same resume. Drive serves as the canonical source if
          // it exists; the chat snapshot is the fallback.
          let hydratedFromDrive = false;
          if (user) {
            try {
              const driveFiles = await loadAllDriveFiles();
              const original = driveFiles.find((f) => f.file_type === "original");
              if (original?.extraction_json) {
                setResumeExtraction(original.extraction_json);
                setResumeText("");
                setResumeFilename(original.display_name ?? "resume.pdf");
                if (original.analysis_json) setResumeAnalysis(original.analysis_json);
                setOnboardingCompleted(true);
                hydratedFromDrive = true;
              }
            } catch (err) {
              console.warn("[loadChats] Drive scan failed:", err);
            }
          }
          if (!hydratedFromDrive) {
            // Drive missing or unauth — fall back to the most recent
            // chat's snapshot for the resume bits only. We do NOT
            // restore the message thread.
            const chatWithResume = chats.find((c) => c.resume_extraction);
            if (chatWithResume?.resume_extraction) {
              setResumeExtraction(chatWithResume.resume_extraction);
              setResumeText(chatWithResume.resume_text ?? "");
              if (chatWithResume.resume_filename) setResumeFilename(chatWithResume.resume_filename);
              if (chatWithResume.resume_analysis) setResumeAnalysis(chatWithResume.resume_analysis);
              setOnboardingCompleted(true);
            }
          }

          // activeChatId stays null. chatMessages stays []. The empty
          // chat hero renders. First sendMessage creates a fresh chat
          // row (via the existing local-chat fallback in persistChat).
        }
      })
      .catch((err) => {
        console.warn("[boot] loadChats failed:", err);
      })
      .finally(() => {
        setBootChecking(false);
        console.log("[boot] check complete");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // Load drive files for the CURRENT chat only when the Drive tab is
  // opened. Previously this used loadAllDriveFiles() which returned every
  // file across every chat the user ever had — so a user who had four
  // chat sessions saw four 'Original' resumes even if they only uploaded
  // once. One chat = one Original + one Working Copy + N versions +
  // reports. If they want the full archive across chats we'll add a
  // second view later.
  useEffect(() => {
    if (activeView !== "drive") return;
    const id = activeChatId ?? "local-chat";
    setDriveLoading(true);
    loadDriveFiles(id)
      .then(setDriveFiles)
      .catch(() => {})
      .finally(() => setDriveLoading(false));
  }, [activeView, activeChatId, user]);

  // Cross-tab sync — if another tab edits stackle_drive or stackle_chats,
  // reload our local view so stale data doesn't linger.
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key === "stackle_drive" && activeView === "drive") {
        const id = activeChatId ?? "local-chat";
        loadDriveFiles(id).then(setDriveFiles).catch(() => {});
      }
      if (e.key === "stackle_chats") {
        loadChats().then(setChatList).catch(() => {});
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [activeView]);

  // Auto-save the onboarding resume to Drive the first time we land in a chat
  // post-auth. Runs once per chat — guarded against re-saves by checking whether
  // an original already exists for this chat. Non-fatal if it fails.
  const autoSaveAttemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!onboardingCompleted) return;
    if (!resumeText || !resumeExtraction) return;
    // Without a Supabase chat row, fall back to a stable local chat id so
    // localStorage-backed Drive files still have a scope to attach to.
    const effectiveChatId = activeChatId ?? "local-chat";
    if (autoSaveAttemptedRef.current.has(effectiveChatId)) return;
    autoSaveAttemptedRef.current.add(effectiveChatId);

    (async () => {
      try {
        const existing = await loadDriveFiles(effectiveChatId);
        const hasOriginal = existing.some((f) => f.file_type === "original");
        if (hasOriginal) {
          const orig = existing.find((f) => f.file_type === "original");
          if (orig) setOriginalDriveFileId(orig.id);
          setDriveFiles(existing);
          return;
        }
        const saved = await saveOriginalResume({
          chatId: effectiveChatId,
          extraction: resumeExtraction,
          rawText: resumeText,
          filename: resumeFilename,
        });
        if (saved) {
          setOriginalDriveFileId(saved.id);
          const refreshed = await loadDriveFiles(effectiveChatId);
          setDriveFiles(refreshed);
        }
      } catch (err) {
        console.warn("[drive] auto-save original failed:", err);
      }
    })();
  }, [user, activeChatId, onboardingCompleted, resumeText, resumeExtraction, resumeFilename]);

  // ── Resume Builder welcome experience ────────────────────
  // When the user is in Resume Builder with a parsed resume and no chat
  // messages yet, push a personalised welcome + welcome-card sentinel.
  // Writes to the unified `chatMessages` (single thread).
  //
  // Critical guard: `welcomeFiredRef` is keyed by activeChatId. Once we've
  // seeded a welcome for this chat, never re-seed for it — even if
  // chatMessages.length flickers to 0 due to a transient state reset
  // (token refresh, route change, etc.). This prevents the "main chat
  // gets erased on view switch" symptom: the welcome can no longer
  // overwrite a real conversation in client memory.
  const analysisKickoffRef = useRef<Set<string>>(new Set());
  const welcomeFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeView !== "resume-builder") return;
    if (!resumeExtraction) return;
    // Use a fallback id for unauth / pre-loadChats users so the welcome
    // doesn't sit silently while activeChatId is still null. Same pattern
    // as the auto-save-original effect uses.
    const effectiveChatId = activeChatId ?? "local-chat";
    const decision = {
      activeChatId,
      effectiveChatId,
      existingMessages: chatMessages.length,
      alreadyFired: welcomeFiredRef.current.has(effectiveChatId),
    };
    if (welcomeFiredRef.current.has(effectiveChatId)) {
      console.log("[welcome:rb] skip — already fired", decision);
      return;
    }
    if (chatMessages.length > 0) {
      console.log("[welcome:rb] skip — messages present", decision);
      return;
    }
    console.log("[welcome:rb] FIRING", decision);
    welcomeFiredRef.current.add(effectiveChatId);

    // Pull the most recent finalized version for this chat so the greeting
    // can say "your saved resume is X" on re-entry instead of the generic
    // first-impression pitch.
    const chatVersions = driveFiles.filter(
      (f) => f.chat_id === effectiveChatId && f.file_type === "version"
    );
    const latestFinal = chatVersions.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )[0];
    const lastFinalized = latestFinal ? { displayName: latestFinal.display_name } : null;

    // First-greeting path. The Stackle Orchestrator (Sonnet 4.5 with
    // forced tool use → bulletproof structured output) reads the resume
    // context and generates an observation-led greeting tailored to the
    // user's actual background. NOT a hardcoded "thanks for sending it
    // over" — it sees their current role + company, years, top skills,
    // and leads with the most distinctive thing.
    //
    // Forced tool use means schema is guaranteed valid (constrained
    // decoding), so the JSON-parse failures that hit the fallback in
    // earlier turns are gone.
    if (!resumeAnalysis) {
      const firstName = (resumeExtraction.name ?? "").trim().split(/\s+/)[0] || null;
      const fullName = (resumeExtraction.name ?? "").trim() || null;
      // Pull the most recent real-employer role for the orchestrator to
      // observe. Skip projects / academic entries (we don't have a strict
      // filter here so first experience entry is good enough).
      const topExp = resumeExtraction.experience?.[0];
      const topRole = topExp?.title?.trim() || null;
      const topCompany = topExp?.company?.trim() || null;
      const topSkills = (resumeExtraction.skillGroups ?? [])
        .flatMap((g) => g.skills ?? [])
        .slice(0, 8);

      // Show a placeholder while the orchestrator is composing
      // (~2-4s on Sonnet). Replaced inline when the response lands.
      setChatMessages([{ role: "assistant", content: "…", timestamp: now() }]);

      fetch("/api/agents/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          resumeContext: {
            firstName,
            fullName,
            targetRoleFromUpload: chosenTargetRole,
            yearsExperience: resumeExtraction.totalYearsExperience,
            topRole,
            topCompany,
            topSkills,
            location: resumeExtraction.location,
            summary: resumeExtraction.summary,
          },
          priorSignals: { role: chosenTargetRole, seniority: null, focus: null, careerGoal },
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data: { route?: { narration: string; chips: string[]; extractedSignals?: { role?: string | null; seniority?: string | null; focus?: string | null; careerGoal?: string | null } } } | null) => {
          if (!data?.route) {
            // True API failure (rate limit, model down). Honest fallback
            // that uses their first name at minimum.
            const fallback: ChatMessage[] = [
              { role: "assistant", content: `Hey${firstName ? ` ${firstName}` : ""}. What role are you targeting?`, timestamp: now() },
              { role: "assistant", content: "__INLINE_CHIPS__:Data Engineer|ML Engineer|Software Engineer|Other" },
            ];
            setChatMessages(fallback);
            return;
          }
          const r = data.route;
          if (r.extractedSignals?.focus) setOrchFocus(r.extractedSignals.focus as FocusKey);
          if (r.extractedSignals?.seniority) setOrchSeniority(r.extractedSignals.seniority);
          // Persist conversationally-captured target role + career goal
          // so subsequent turns / managers can use them. The orchestrator
          // echoes whatever it captured on every turn — we only write
          // when there's a non-empty value so we never null-out state.
          if (r.extractedSignals?.role && !chosenTargetRole) setChosenTargetRole(r.extractedSignals.role);
          if (r.extractedSignals?.careerGoal && !careerGoal) setCareerGoal(r.extractedSignals.careerGoal);

          const msgs: ChatMessage[] = [
            { role: "assistant", content: r.narration, timestamp: now() },
            ...(r.chips.length > 0 ? [{ role: "assistant" as const, content: `__INLINE_CHIPS__:${r.chips.join("|")}` }] : []),
          ];
          setChatMessages(msgs);
          if (activeChatId) {
            persistChat(activeChatId, msgs, "resume_builder", {
              resumeText, resumeFilename, resumeExtraction, resumeAnalysis: null,
            });
          }
        })
        .catch((err) => {
          console.warn("[orch greet failed]", err);
          const fallback: ChatMessage[] = [
            { role: "assistant", content: `Hey${firstName ? ` ${firstName}` : ""}. What role are you targeting?`, timestamp: now() },
            { role: "assistant", content: "__INLINE_CHIPS__:Data Engineer|ML Engineer|Software Engineer|Other" },
          ];
          setChatMessages(fallback);
        });
      // Continue to kick off the analysis fetch below.
    } else {
      // Analysis already ready (returning chat, cached, etc) — fire the
      // standard score-led welcome.
      const welcomeText = buildResumeBuilderWelcome(resumeExtraction, lastFinalized, resumeAnalysis, chosenTargetRole);
      const chipLine = buildWelcomeChipsForAnalysis(resumeAnalysis);
      const welcomeMsgs: ChatMessage[] = [
        { role: "assistant", content: welcomeText, timestamp: now() },
        { role: "assistant", content: chipLine },
      ];
      setChatMessages(welcomeMsgs);
      if (activeChatId) {
        persistChat(activeChatId, welcomeMsgs, "resume_builder", {
          resumeText, resumeFilename, resumeExtraction, resumeAnalysis,
        });
      }
    }
    // Kick off analysis in the background if we don't have it yet. Use a ref
    // keyed on the resume text so we don't re-trigger the same analysis on
    // every auth reset.
    const analysisKey = resumeText ? `t:${resumeText.length}:${resumeText.slice(0, 32)}` : "";
    if (!resumeAnalysis && resumeText && !analysisKickoffRef.current.has(analysisKey)) {
      analysisKickoffRef.current.add(analysisKey);
      fetch("/api/agents/resume/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          reviewType: "Full Review",
          targetMarket: "US General",
          seniorityLevel: resumeExtraction.totalYearsExperience && resumeExtraction.totalYearsExperience >= 7 ? "Senior" : "Mid",
          jobDescription: "",
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((a: ResumeAnalysis | null) => {
          if (a) {
            // Just set state — the analysis-landed watcher (separate
            // useEffect) handles dropping the score message into chat
            // and re-persisting. Keeps the kickoff site simple.
            setResumeAnalysis(a);
          }
        })
        .catch(() => { /* non-fatal — card stays in skeleton */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, resumeExtraction, chatMessages.length, activeChatId]);

  // ── Analysis-landed watcher ───────────────────────────────────────────
  // Fires when the background analysis arrives. Two things to handle:
  //   1. A `__ANALYSIS_PROGRESS__` placeholder message exists (user picked
  //      'Resume review' BEFORE analysis was ready). Replace the
  //      placeholder with the real report.
  //   2. User has indicated focus=resume but no placeholder (e.g. they
  //      picked review and analysis came back fast). Drop the report
  //      after the most recent message.
  // Skip otherwise — the user might be on Interview Prep or another path
  // and dumping the report mid-conversation would be jarring.
  // Chat-mode analyzer kickoff. The Resume Builder welcome effect already
  // kicks off the analyzer when the user lands on that surface. But in
  // main-chat mode (the common path for "review my resume"), nothing was
  // calling the analyzer — the orchestrator just emitted prose via the
  // synthesis agent and no structured `resumeAnalysis` ever existed, so
  // the artifact card path could never fire. Fix: when the orchestrator
  // signals focus=resume from chat AND we have an extraction but no
  // analysis, run the analyzer in the background. The analysis-landed
  // watcher (below) then pushes the artifact card.
  // Resume is the heart of everything. As soon as the chat view has a
  // parsed resume without an analysis, kick off the analyzer in the
  // background. The orchFocusRef gate used to block this and was the
  // root cause of the artifact-card-doesn't-appear bug: the
  // orchestrator wasn't reliably setting focus=resume, so the kickoff
  // never fired, no analysis existed, no card appeared.
  const chatAnalysisKickoffRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeView !== "chat") return;
    if (!resumeExtraction) return;
    if (resumeAnalysis) return;
    // CRITICAL gate — only fire when the user has EXPLICITLY asked for
    // a review. Earlier this gate was removed with the misguided
    // reasoning that "resume is the heart, analyze on sight." That made
    // every sign-in auto-trigger an analyzer call, burning Anthropic
    // calls and confusing the user ("why is it analyzing? I didn't ask").
    //
    // The "Use current" handler in the source-chooser flow sets
    // orchFocusRef.current = "resume". Nothing else should set it.
    // Sign-in, page-refresh, tab-focus — none of those fire this kickoff.
    if (orchFocusRef.current !== "resume") return;
    // Drive-hydrated users don't have the raw resumeText — it's empty
    // because Drive only stores the structured extraction. Synthesize
    // a plain-text version from the extraction so the analyzer has
    // something to chew on. The synthesized version is good enough for
    // a Full Review: name, summary, all experience bullets, education,
    // skills — everything the analyzer prompt actually reads.
    const synthFromExtraction = (): string => {
      const e = resumeExtraction;
      const lines: string[] = [];
      if (e.name) lines.push(e.name);
      if (e.location) lines.push(e.location);
      if (e.email) lines.push(e.email);
      if (e.linkedin) lines.push(e.linkedin);
      if (e.summary) lines.push("\nSUMMARY\n" + e.summary);
      if (e.experience && e.experience.length > 0) {
        lines.push("\nEXPERIENCE");
        for (const exp of e.experience) {
          const dur = [exp.startDate, exp.endDate ?? (exp.current ? "Present" : "")].filter(Boolean).join(" – ");
          lines.push(`${exp.title} | ${exp.company}${dur ? ` | ${dur}` : ""}`);
          for (const b of exp.bullets ?? []) lines.push(`  • ${b}`);
        }
      }
      if (e.education && e.education.length > 0) {
        lines.push("\nEDUCATION");
        for (const ed of e.education) {
          lines.push(`${ed.degree} ${ed.field ? `(${ed.field})` : ""} | ${ed.institution}`);
        }
      }
      if (e.skillGroups && e.skillGroups.length > 0) {
        lines.push("\nSKILLS");
        for (const g of e.skillGroups) {
          lines.push(`${g.category}: ${(g.skills ?? []).join(", ")}`);
        }
      }
      return lines.join("\n");
    };
    const effectiveResumeText = resumeText && resumeText.trim().length > 0
      ? resumeText
      : synthFromExtraction();
    if (!effectiveResumeText || effectiveResumeText.length < 80) return;
    const analysisKey = `chat:${effectiveResumeText.length}:${effectiveResumeText.slice(0, 32)}`;
    if (chatAnalysisKickoffRef.current.has(analysisKey)) return;
    chatAnalysisKickoffRef.current.add(analysisKey);
    const flowId = newFlowId();
    const analyzeLog = flowStart("analyze", flowId, {
      from: "chat-kickoff",
      chatId: activeChatId,
      bytes: effectiveResumeText.length,
      synthesized: !resumeText || resumeText.trim().length === 0,
    });

    // Push a placeholder artifact card the MOMENT the analyzer fires,
    // not when it returns. Bug from user: "the button didn't come
    // earlier. It came way later. It should have come the minute I
    // clicked Resume Review." Card appears immediately with no score
    // (skeleton state); analysis-landed watcher replaces it in-place
    // when results arrive. Carries a stable placeholder id so the
    // watcher can find + update it.
    const placeholderId = `resume-review-pending-${activeChatId ?? "local"}`;
    const placeholderArtifact = {
      id: placeholderId,
      kind: "resume_review" as const,
      title: "Analyzing your resume…",
      subtitle: "Reading sections, scoring, drafting fixes",
      generatedAt: new Date().toISOString(),
      pending: true,
    };
    setChatMessages((prev) => {
      // Avoid duplicates if a placeholder is already in the thread.
      if (prev.some((m) => m.artifact?.id === placeholderId)) return prev;
      return [
        ...prev,
        { role: "assistant" as const, content: "On it.", timestamp: now(), artifact: placeholderArtifact },
      ];
    });

    // Helper: when analyzer fails, REPLACE the pending placeholder in
    // chat with a real error message + retry chip. Without this the
    // pending card sat forever ("Analyzing your resume…" / "Generating…")
    // and the user thought the app was hung. Bug-from-user.
    const failPendingArtifact = (msg: string) => {
      setChatMessages((prev) => prev.map((m) => {
        if (m.artifact?.id !== placeholderId) return m;
        return {
          role: "assistant" as const,
          content: msg,
          timestamp: now(),
        };
      }));
      // Also clear the kickoff dedupe key so the user can retry by
      // clicking "Use current" again. Otherwise the same key blocks.
      chatAnalysisKickoffRef.current.delete(analysisKey);
    };

    // Client-side timeout — Vercel's route has maxDuration=300 but if
    // the network drops or the route hangs past 90s, fail fast so the
    // user isn't staring at a spinner forever.
    const timeoutMs = 90_000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    fetch("/api/agents/resume/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-stackle-flow-id": flowId },
      signal: controller.signal,
      body: JSON.stringify({
        resumeText: effectiveResumeText,
        reviewType: "Full Review",
        targetMarket: "US General",
        seniorityLevel:
          resumeExtraction.totalYearsExperience && resumeExtraction.totalYearsExperience >= 7
            ? "Senior"
            : "Mid",
        jobDescription: "",
      }),
    })
      .then(async (r) => {
        clearTimeout(timeoutHandle);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const errMsg = body?.error || `HTTP ${r.status}`;
          throw new Error(errMsg);
        }
        return r.json();
      })
      .then((a: ResumeAnalysis | null) => {
        if (a) {
          analyzeLog.end({ score: deriveScoreFromAnalysis(a), priorities: a.rewritePriorities?.length ?? 0, gaps: a.keywordGaps?.length ?? 0 });
          setResumeAnalysis(a);
        } else {
          analyzeLog.err(new Error("analyze returned null"));
          failPendingArtifact("The analyzer returned no result. Try uploading the resume again or paste the text directly.");
        }
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutHandle);
        const msg = err instanceof Error ? err.message : String(err);
        analyzeLog.err(err);
        const userMsg = msg.includes("aborted") || msg.toLowerCase().includes("timeout")
          ? "The analyzer took too long (90s+). Try again — usually faster on the second attempt."
          : `Couldn't generate the review: ${msg}. Try again?`;
        failPendingArtifact(userMsg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, resumeExtraction, resumeText, resumeAnalysis, chatMessages.length]);

  const analysisLandedFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Used to be gated to activeView === "resume-builder", which meant
    // running a resume review from the main chat surface NEVER produced
    // an artifact card. Now: fires in both chat AND resume-builder
    // surfaces. The artifact card is the user-visible proof that a real
    // analysis happened — it must always appear.
    if (activeView !== "resume-builder" && activeView !== "chat") return;
    if (!resumeAnalysis) return;
    if (!resumeExtraction) return;
    const id = activeChatId ?? "local-chat";
    if (analysisLandedFiredRef.current.has(id)) return;

    // Detect placeholders we may have pushed earlier.
    const hasProgressPlaceholder = chatMessages.some((m) => m.content === "__ANALYSIS_PROGRESS__");
    const pendingArtifactId = `resume-review-pending-${activeChatId ?? "local"}`;
    const hasPendingArtifact = chatMessages.some((m) => m.artifact?.id === pendingArtifactId);

    // In resume-builder, gate on a clear signal so we don't interrupt
    // flows. In chat, if analysis exists, ALWAYS push the artifact —
    // user complaint: "the artifact didn't show up." The guard was
    // too strict and the prose review appeared without the card.
    if (activeView === "resume-builder") {
      const userWantsResumeReview =
        orchFocusRef.current === "resume" || hasProgressPlaceholder || hasPendingArtifact;
      if (!userWantsResumeReview) return;
    }
    console.log("[artifact:resume-review] pushing card", {
      view: activeView, chatId: id, hasPendingArtifact, hasProgressPlaceholder,
    });

    analysisLandedFiredRef.current.add(id);

    const welcomeText = buildResumeBuilderWelcome(resumeExtraction, null, resumeAnalysis, chosenTargetRole);
    const chipLine = buildWelcomeChipsForAnalysis(resumeAnalysis);
    // Fix 2 — artifact card as the first thing the user sees once
    // analysis lands. Click → opens the Report tab. Card stays inline
    // forever, so the chat timeline shows the milestone permanently.
    const artifact = buildResumeReviewArtifact({
      id: `resume-review-${activeChatId ?? "local"}-${Date.now()}`,
      candidateName: resumeExtraction.name,
      targetRole: resumeAnalysis.likelyTargetRole ?? chosenTargetRole ?? null,
      score: deriveScoreFromAnalysis(resumeAnalysis),
    });
    const reportBlock: ChatMessage[] = [
      { role: "assistant", content: "Done reading. Here's your review:", timestamp: now(), artifact },
      { role: "assistant", content: welcomeText, timestamp: now() },
      { role: "assistant", content: chipLine },
    ];

    let reportMsgs: ChatMessage[];
    if (hasProgressPlaceholder) {
      // Replace the legacy __ANALYSIS_PROGRESS__ sentinel.
      reportMsgs = chatMessages.flatMap((m) =>
        m.content === "__ANALYSIS_PROGRESS__" ? reportBlock : [m],
      );
    } else if (hasPendingArtifact) {
      // Replace the pending artifact placeholder in-place.
      reportMsgs = chatMessages.flatMap((m) =>
        m.artifact?.id === pendingArtifactId ? reportBlock : [m],
      );
    } else {
      // Append at the end.
      reportMsgs = [...chatMessages, ...reportBlock];
    }

    setChatMessages(reportMsgs);
    if (activeChatId) {
      persistChat(activeChatId, reportMsgs, "resume_builder", {
        resumeText, resumeFilename, resumeExtraction, resumeAnalysis,
      });
    }
    setOpenReportSignal((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAnalysis, activeView]);

  // ── Main chat welcome greeting ────────────────────────────
  // When the user lands in the main chat view (not Resume Builder) with a
  // parsed resume and no chat messages yet, push a short personal greeting
  // instead of the generic "Career advice for data & AI roles" hero. Makes
  // it feel like Stackle knows who they are from the moment they arrive.
  // Auto-firing a 'Hey {name} — read through your resume…' message on
  // every new chat made new conversations look identical to old ones and
  // triggered a 'why is the same old chat back?' reaction. Removed in
  // favour of the rotating empty-hero greeting + launcher chips, which
  // invite the user without claiming any prior context. The orchestrator
  // surfaces resume context the moment it's relevant to what they ask.
  /* DISABLED — keep the empty hero clean.
  useEffect(() => {
    if (activeView !== "chat") return;
    if (!resumeExtraction) return;
    if (!activeChatId) return;
    const decision = {
      activeChatId,
      existingMessages: chatMessages.length,
      alreadyFired: welcomeFiredRef.current.has(activeChatId),
      isAnalyzingResume,
      hasAnalysis: !!resumeAnalysis,
    };
    if (welcomeFiredRef.current.has(activeChatId)) {
      console.log("[welcome:chat] skip — already fired", decision);
      return;
    }
    if (chatMessages.length > 0) {
      console.log("[welcome:chat] skip — messages present", decision);
      return;
    }
    if (isAnalyzingResume && !resumeAnalysis) {
      console.log("[welcome:chat] skip — analysis still loading", decision);
      return;
    }
    console.log("[welcome:chat] FIRING", decision);
    welcomeFiredRef.current.add(activeChatId);

    const firstName = (resumeExtraction.name ?? "").trim().split(/\s+/)[0] || "there";
    const realJob = firstRealJob(resumeExtraction);
    const years = resumeExtraction.totalYearsExperience;
    // Round fractional years to clean copy ("1.4 years" → "about 1 year").
    const describeYears = (y: number | null | undefined): string => {
      if (typeof y !== "number" || !isFinite(y) || y <= 0) return "";
      if (y < 1) return "less than 1 year of experience";
      const floor = Math.floor(y);
      const frac = y - floor;
      if (frac < 0.25) return floor === 1 ? "1 year of experience" : `${floor} years of experience`;
      if (frac >= 0.75) {
        const rounded = floor + 1;
        return rounded === 1 ? "almost 1 year of experience" : `almost ${rounded} years of experience`;
      }
      return floor === 1 ? "about 1 year of experience" : `about ${floor} years of experience`;
    };
    const yearsPhrase = describeYears(years);
    // Header — punchy, references real role + tenure when we have them.
    let header: string;
    if (realJob) {
      header = `Hey ${firstName} — read through your resume. ${realJob.title} at ${realJob.company}${yearsPhrase ? `, ${yearsPhrase}.` : "."}`;
    } else if (yearsPhrase) {
      header = `Hey ${firstName} — read through your resume. ${yearsPhrase.charAt(0).toUpperCase() + yearsPhrase.slice(1)}.`;
    } else {
      header = `Hey ${firstName} — read through your resume.`;
    }

    // Optional rich profile body — only when analysis has landed. If it's
    // still in flight, ship just the header now; a follow-up message can
    // drop in later if we want it.
    const bodyParts: string[] = [];
    const bestFit = resumeAnalysis?.bestFitRoles ?? [];
    if (bestFit.length > 0) {
      const top = bestFit[0];
      const adjacent = bestFit.slice(1, 3).map((r) => r.title).filter(Boolean);
      const adjPart = adjacent.length > 0 ? ` Also adjacent: ${adjacent.join(", ")}.` : "";
      bodyParts.push(`Closest match: **${top.title}** (${top.matchPct}%).${adjPart}`);
    } else if (resumeAnalysis?.likelyTargetRole) {
      bodyParts.push(`Closest match: **${resumeAnalysis.likelyTargetRole}**.`);
    }

    const strengths = (resumeAnalysis?.strengths ?? []).slice(0, 3);
    if (strengths.length > 0) {
      bodyParts.push(`What's working:\n${strengths.map((s) => `- ${s}`).join("\n")}`);
    }

    const weak = (resumeAnalysis?.weaknesses ?? []).slice(0, 2);
    const gaps = (resumeAnalysis?.keywordGaps ?? []).slice(0, 3);
    if (weak.length > 0 || gaps.length > 0) {
      const lines: string[] = [];
      weak.forEach((w) => lines.push(`- ${w}`));
      if (gaps.length > 0) lines.push(`- Missing keywords: ${gaps.join(", ")}`);
      bodyParts.push(`What's holding you back:\n${lines.join("\n")}`);
    }

    // Only add a closer when there's actual analysis content to anchor
    // it. Otherwise the chips below already imply 'what next?' — adding
    // a literal 'What's going on?' question reads as the assistant
    // floundering. The career-goal version is fine because it cites
    // something specific.
    if (careerGoal) {
      bodyParts.push(`You said your goal is *${careerGoal}*. Want to start there, or pick something else?`);
    } else if (bodyParts.length > 0) {
      bodyParts.push(`Where do you want to start?`);
    }

    const fullBody = bodyParts.length > 0 ? `\n\n${bodyParts.join("\n\n")}` : "";

    const greetMsgs: ChatMessage[] = [
      { role: "assistant", content: `${header}${fullBody}`, timestamp: now() },
      // Quick-launch chips — same set as the empty-hero so the surface
      // feels consistent. Each chip is a real next move, not a vague
      // 'What's going on?' which has no obvious answer.
      { role: "assistant", content: "__INLINE_CHIPS__:Fix my resume|Tailor for a JD|Interview prep|Foundations" },
    ];
    setChatMessages(greetMsgs);

    // Persist so refresh doesn't re-fire the greeting
    if (activeChatId) {
      persistChat(activeChatId, greetMsgs, "chat", {
        resumeText,
        resumeFilename,
        resumeExtraction,
        resumeAnalysis,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, resumeExtraction, resumeAnalysis, isAnalyzingResume, chatMessages.length, activeChatId]);
  */

  // ── Timestamp helper ──────────────────────────────────
  function now() {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  // ── State helpers ─────────────────────────────────────
  // ONE message bucket. `mode` is now just a hint for which panel to open
  // first — it doesn't gate where messages live. Existing rows with
  // mode="resume_builder" still restore correctly; we just open the
  // resume-builder panel and load their thread into the same shared array
  // we'd use for any other chat.
  function restoreChatState(chat: SupabaseChat) {
    const msgs = chat.messages ?? [];
    console.log("[restore]", {
      chatId: chat.id,
      messageCount: msgs.length,
      mode: chat.mode,
      hasResumeExtraction: !!chat.resume_extraction,
      hasResumeAnalysis: !!chat.resume_analysis,
    });
    setChatMessages(msgs);
    // Don't clobber the active surface if the user is on a deliberate
    // top-level destination (Interview / Foundations / Drive). Those are
    // surfaces, not chat modes — restoring a chat's saved mode here was
    // bouncing the user back to Resume Builder every time the tab
    // regained focus and Supabase re-fired the auth event.
    setActiveView((prev) => {
      if (prev === "interview" || prev === "learn" || prev === "drive") return prev;
      return chat.mode === "resume_builder" ? "resume-builder" : "chat";
    });
    setCareerGoal(chat.career_goal ?? null);
    // Only block the welcome useEffect if this chat ALREADY has messages.
    // (Earlier I always-marked here, which broke fresh chat rows: a row
    // could exist with [] messages — common right after createChat — and
    // the welcome useEffect would never fire. Result: blank chat panel.)
    if (msgs.length > 0) {
      welcomeFiredRef.current.add(chat.id);
    }
    // Always block the "local-chat" fallback id so a transient
    // activeChatId=null window doesn't cause the resume-builder welcome
    // useEffect to push a duplicate welcome under that key before the
    // real id propagates. The real chatId path stays open above.
    welcomeFiredRef.current.add("local-chat");

    if (chat.mode === "resume_builder") {
      setResumeText(chat.resume_text ?? null);
      setResumeFilename(chat.resume_filename ?? undefined);
      setResumeExtraction(chat.resume_extraction ?? null);
      setResumeAnalysis(chat.resume_analysis ?? null);
    } else {
      // For regular chats, prefer the chat's own resume columns; otherwise
      // fall back to the profile-level resume (localStorage) so the agent
      // still knows who it's talking to.
      const prof = getProfileResume();
      setResumeText(chat.resume_text ?? prof.resumeText);
      setResumeFilename(chat.resume_filename ?? prof.resumeFilename);
      setResumeExtraction(chat.resume_extraction ?? prof.resumeExtraction);
      setResumeAnalysis(chat.resume_analysis ?? prof.resumeAnalysis);
    }
    setMarketAnalysis(null);
    setInterviewPrepPlan(null);
    setOrchestratorDecision(null);
    setAnalyzedMarketKey(null);
    setChatInput("");
    setResumeInput("");
    // Load drive files for this session
    setDriveFiles([]);
    setOriginalDriveFileId(null);
    loadDriveFiles(chat.id).then((files) => {
      setDriveFiles(files);
      const orig = files.find((f) => f.file_type === "original");
      if (orig) setOriginalDriveFileId(orig.id);
    }).catch(() => {});

    // Returning user: if this chat already has a parsed resume (or one
    // is available from the profile fallback), skip the upload screen.
    // Without this, an authed user on a fresh device (no localStorage
    // onboarding flag) would be forced to re-upload despite their
    // resume + drive files + chat history living in Supabase.
    const restoredExtraction = chat.mode === "resume_builder"
      ? chat.resume_extraction
      : (chat.resume_extraction ?? getProfileResume().resumeExtraction);
    if (restoredExtraction) {
      setOnboardingCompleted(true);
    }
  }

  // Read the profile-level resume saved during onboarding. Returns null if
  // the user hasn't uploaded one yet. Used to rehydrate resume state when
  // starting or switching chats so the agent never forgets the user.
  function getProfileResume(): {
    resumeText: string | null;
    resumeFilename: string | undefined;
    resumeExtraction: ResumeExtraction | null;
    resumeAnalysis: ResumeAnalysis | null;
  } {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("stackle_onboarding") : null;
      if (!saved) return { resumeText: null, resumeFilename: undefined, resumeExtraction: null, resumeAnalysis: null };
      const p = JSON.parse(saved);
      return {
        resumeText: p.resumeText ?? null,
        resumeFilename: p.resumeFilename ?? undefined,
        resumeExtraction: p.resumeExtraction ?? null,
        resumeAnalysis: p.resumeAnalysis ?? null,
      };
    } catch {
      return { resumeText: null, resumeFilename: undefined, resumeExtraction: null, resumeAnalysis: null };
    }
  }

  function resetAllState() {
    // TEMP diagnostic: surface every wipe so we can confirm view-switching
    // is NOT calling this. Strip after we verify on prod.
    console.log("[chat] resetAllState — chatMessages cleared", {
      stack: new Error().stack?.split("\n").slice(2, 5).join(" | "),
    });
    setChatMessages([]);
    setChatInput("");
    setResumeInput("");
    setActiveView("chat");
    // Restore profile-level resume so the agent still knows the user after reset
    const prof = getProfileResume();
    setResumeText(prof.resumeText);
    setResumeFilename(prof.resumeFilename);
    setResumeFileUrl(null);
    setResumeDocHtml(null);
    setResumeExtraction(prof.resumeExtraction);
    setResumeAnalysis(prof.resumeAnalysis);
    setIntakeData(null);
    setIntakeStep(0);
    setIntakeAnswers({});
    setMarketAnalysis(null);
    setInterviewPrepPlan(null);
    setOrchestratorDecision(null);
    setAnalyzedMarketKey(null);
    setDriveFiles([]);
    setOriginalDriveFileId(null);
    setOpenReportSignal(0);
    // Clear the "explicitly asked for review" intent so a fresh sign-in
    // doesn't auto-fire the analyzer kickoff from a stale ref.
    setOrchFocus(null);
    orchFocusRef.current = null;
    // Also clear the analyzer dedupe set so a re-attempt isn't blocked
    // by a stale key.
    chatAnalysisKickoffRef.current.clear();
  }

  function persistChat(
    id: string,
    msgs: ChatMessage[],
    mode: "chat" | "resume_builder" | "job_match",
    extra?: {
      resumeText?: string | null;
      resumeFilename?: string;
      resumeExtraction?: ResumeExtraction | null;
      resumeAnalysis?: ResumeAnalysis | null;
      careerGoal?: string | null;
      careerProfileSeen?: boolean;
    }
  ) {
    // TEMP diagnostic: confirm every persistChat fires when expected.
    console.log("[chat] persistChat", { id, mode, count: msgs.length });
    const title = deriveChatTitle(msgs);
    updateChat(id, {
      messages: msgs,
      title,
      mode,
      resume_text: extra?.resumeText ?? undefined,
      resume_filename: extra?.resumeFilename,
      resume_extraction: extra?.resumeExtraction ?? undefined,
      resume_analysis: extra?.resumeAnalysis ?? undefined,
      career_goal: extra?.careerGoal ?? undefined,
      career_profile_seen: extra?.careerProfileSeen ?? undefined,
    }).catch((err) => {
      // Surface persistence failures so silent data loss is at least
      // observable in the console and via a custom event for future toasts.
      console.error("[chat] persistChat failed for chat", id, err);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("stackle-chat-persist-failed", {
          detail: { chatId: id, error: (err as Error)?.message ?? "unknown" },
        }));
      }
    });
    setChatList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title, updated_at: new Date().toISOString() } : c))
    );
  }

  // ── Auth actions ──────────────────────────────────────
  async function handleGetStarted() {
    setAuthError("");
    const email = authEmail.trim();
    if (!email) return;
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
    else setAuthSent(true);
  }

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    try { await supabase.auth.signOut(); } catch { /* ignore — we'll force-clear anyway */ }
    // Nuke everything stackle-owned in localStorage. The Supabase signOut
    // alone leaves chats / drive / onboarding behind, which means the next
    // user to land here re-hydrates the previous user's resume.
    if (typeof window !== "undefined") {
      try {
        const keysToKill: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.startsWith("stackle") || k.startsWith("sb-") || k.includes("supabase"))) {
            keysToKill.push(k);
          }
        }
        keysToKill.forEach((k) => window.localStorage.removeItem(k));
      } catch { /* ignore quota / private-mode errors */ }
      // Hard reload to root — flushes every in-memory state, every cached
      // chat, every reachable bit of the previous identity. Belt + braces.
      window.location.href = "/";
    }
  }

  // ── Chat session actions ───────────────────────────────
  async function handleNewConversation() {
    console.log("[createChat] from handleNewConversation — user clicked + New conversation");
    const prof = getProfileResume();
    try {
      const newChat = await createChat("chat", {
        resumeText: prof.resumeText,
        resumeFilename: prof.resumeFilename ?? null,
        resumeExtraction: prof.resumeExtraction,
        resumeAnalysis: prof.resumeAnalysis,
      });
      setChatList((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
    } catch {
      /* offline fallback */
    }
    resetAllState();
    // Land on the calm chat hero, not the resume-builder shell. The
    // builder's auto-welcome useEffect was firing the dense score
    // recap every time the user clicked + New conversation — exactly
    // the "huge message" complaint. Chat view shows the minimal
    // rotating greeting instead.
    setActiveView("chat");
    setIsSidebarOpen(false);
  }

  function handleSwitchChat(chatId: string) {
    if (chatId === activeChatId) {
      setIsSidebarOpen(false);
      return;
    }
    const chat = chatList.find((c) => c.id === chatId);
    if (!chat) return;
    resetAllState();
    setActiveChatId(chatId);
    restoreChatState(chat);
    setIsSidebarOpen(false);
  }

  async function handleDeleteChat(chatId: string) {
    await deleteChat(chatId).catch(() => {});
    const remaining = chatList.filter((c) => c.id !== chatId);
    setChatList(remaining);
    if (activeChatId === chatId) {
      if (remaining.length > 0) {
        setActiveChatId(remaining[0].id);
        restoreChatState(remaining[0]);
      } else {
        console.log("[createChat] from handleDeleteChat — last chat deleted, seeding empty");
        const prof = getProfileResume();
        const newChat = await createChat("chat", {
          resumeText: prof.resumeText,
          resumeFilename: prof.resumeFilename ?? null,
          resumeExtraction: prof.resumeExtraction,
          resumeAnalysis: prof.resumeAnalysis,
        }).catch(() => null);
        if (newChat) {
          setChatList([newChat]);
          setActiveChatId(newChat.id);
        }
        resetAllState();
      }
    }
  }

  // ── Resume-review source chooser ──────────────────────
  // When the user asks to review their resume, give them an explicit
  // choice of which resume to act on: the currently loaded one, a
  // fresh upload, or one of their saved Drive resumes. Prevents the
  // "wrong file got reviewed" failure mode entirely.
  async function promptResumeSourceChoice() {
    // First: if we don't have a resume in memory yet, the Drive scan
    // from sign-in may not have landed. Do an inline scan before
    // falling back to "no resume → open uploader". Without this,
    // returning users who clicked Review my resume too quickly got
    // forced into a file upload despite having a perfectly good
    // resume in Drive. Bug-from-user.
    let extraction = resumeExtraction;
    let filename = resumeFilename;
    if (!extraction && user) {
      try {
        const driveFiles = await loadAllDriveFiles();
        const original = driveFiles.find((f) => f.file_type === "original");
        if (original?.extraction_json) {
          extraction = original.extraction_json;
          filename = original.display_name ?? "resume.pdf";
          // Hydrate state too so subsequent operations have it.
          setResumeExtraction(original.extraction_json);
          setResumeFilename(filename);
          if (original.analysis_json) setResumeAnalysis(original.analysis_json);
          setResumeText("");
          setOnboardingCompleted(true);
        }
      } catch (err) {
        console.warn("[promptResumeSourceChoice] Drive scan failed:", err);
      }
    }

    // Truly no resume anywhere → open uploader.
    if (!extraction) {
      chatUploadInputRef.current?.click();
      return;
    }

    const currentName = filename || "current resume";
    const labels = [
      `Use current — ${currentName}`,
      "Upload a new one",
      "Pick from Drive",
    ];
    setChatMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Got it. Which resume should I review?", timestamp: now() },
      { role: "assistant", content: `__INLINE_CHIPS__:${labels.join("|")}` },
    ]);
    setPendingResumeReviewSource(true);
  }

  async function expandDrivePicker() {
    try {
      const files = await loadAllDriveFiles();
      const resumes = files.filter(
        (f) => f.file_type === "original" || f.file_type === "version",
      );
      driveResumesForPickerRef.current = resumes;
      if (resumes.length === 0) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "No other resumes saved in Drive yet. Want to upload a new one instead?", timestamp: now() },
          { role: "assistant", content: "__INLINE_CHIPS__:Upload a new one|Cancel resume pick" },
        ]);
        return;
      }
      const driveLabels = resumes.map((r) => `Use saved · ${r.display_name}`);
      driveLabels.push("Cancel resume pick");
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Which one?", timestamp: now() },
        { role: "assistant", content: `__INLINE_CHIPS__:${driveLabels.join("|")}` },
      ]);
    } catch (err) {
      console.warn("[drive-picker] failed:", err);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Couldn't load your Drive right now. Try uploading instead?", timestamp: now() },
        { role: "assistant", content: "__INLINE_CHIPS__:Upload a new one|Cancel resume pick" },
      ]);
    }
  }

  // ── Resume upload ─────────────────────────────────────
  const handleResumeUpload = async (text: string, filename: string) => {
    const flowId = newFlowId();
    const uploadLog = flowStart("upload", flowId, {
      filename,
      bytes: text?.length ?? 0,
      preview: (text ?? "").slice(0, 60),
    });
    // Step 7: guard against incomplete PDF extraction
    if (filename.toLowerCase().endsWith('.pdf') && text.length < 500) {
      setActiveView("chat");
      setChatMessages((prev) => [...prev, {
        role: "assistant",
        content: "We had trouble reading your PDF. Please try saving it as a plain PDF and uploading again. Or paste your resume text directly in the chat.",
      }]);
      setIsLoading(false);
      return;
    }

    // Hard cap resume text at ~200 KB so a huge paste doesn't blow up
    // localStorage, memory, or Supabase payloads. The synthesis path already
    // slices to 6000 chars, so anything beyond 200 KB adds no value.
    const MAX_RESUME_TEXT_BYTES = 200_000;
    const safeText = text.length > MAX_RESUME_TEXT_BYTES ? text.slice(0, MAX_RESUME_TEXT_BYTES) : text;
    setResumeText(safeText);
    setResumeFilename(filename);
    setResumeAnalysis(null);
    setResumeExtraction(null);
    setActiveView("resume-builder");

    // Append the upload chip to the SHARED thread so it appears whether the
    // user is viewing chat or resume-builder. The welcome useEffect fires
    // once `resumeExtraction` lands and pushes the welcome card after this.
    const uploadMsg: ChatMessage = { role: "user", content: `__FILE_UPLOAD__:${filename}`, timestamp: now() };
    setChatMessages((prev) => [...prev, uploadMsg]);
    setIntakeStep(0);
    setIntakeAnswers({});
    setIntakeData(null);
    setIsLoading(false);

    // Run extraction in background — welcome auto-fires once it lands
    let extraction: ResumeExtraction | null = null;
    const extractLog = flowStart("extract", flowId, { bytes: safeText.length });
    try {
      const extractRes = await fetch("/api/agents/resume/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-stackle-flow-id": flowId },
        body: JSON.stringify({ resumeText: safeText }),
      });
      if (extractRes.ok) {
        extraction = await extractRes.json();
        extractLog.end({ name: extraction?.name ?? null, experiences: extraction?.experience?.length ?? 0, skills: (extraction?.skillGroups ?? []).reduce((n, g) => n + (g.skills?.length ?? 0), 0) });
        uploadLog.end({ extraction: "ok" });
        setResumeExtraction(extraction);

        const id = activeChatIdRef.current;
        if (id) {
          persistChat(id, [uploadMsg, { role: "assistant", content: "__RESUME_EXTRACTION__" }], "resume_builder", {
            resumeText: safeText,
            resumeFilename: filename,
            resumeExtraction: extraction,
          });
          // Save original to Drive (Supabase if authed, localStorage otherwise)
          if (extraction) {
            const ext: ResumeExtraction = extraction;
            saveOriginalResume({ chatId: id, extraction: ext, rawText: safeText, filename })
              .then((file) => {
                if (file) {
                  setOriginalDriveFileId(file.id);
                  loadDriveFiles(id).then(setDriveFiles).catch(() => {});
                  // Auto-build the user's profile from this resume.
                  // Populates display_name, headline, summary, location,
                  // years_experience, top_skills + records source_resume_id.
                  // Username intake (post-signup) is the only thing the
                  // user ever has to type — everything else comes from
                  // the resume.
                  buildProfileFromResume({ extraction: ext, sourceResumeId: file.id }).catch(() => {});
                } else {
                  // Drive save failed (unauth or transient); still build
                  // the profile so the next sign-in surfaces correct data.
                  buildProfileFromResume({ extraction: ext, sourceResumeId: null }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      }
    } catch (err) {
      extractLog.err(err);
      uploadLog.err(err);
      setIsLoading(false);
      setChatMessages((prev) => [...prev, {
        role: "assistant",
        content: "I couldn't read that file. Try uploading it again or paste your resume as text.",
      }]);
    }
  };

  // ── Shared: run analysis after intake completes ───────
  const runIntakeAnalysis = useCallback(async (builtData: IntakeData, userMsg: ChatMessage | null) => {
    setIsAnalyzingResume(true);
    try {
      const analyzeRes = await fetch("/api/agents/resume/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          reviewType: builtData.reviewType,
          targetMarket: builtData.targetMarket,
          seniorityLevel: builtData.seniorityLevel,
          jobDescription: builtData.jobDescription,
        }),
      });
      if (analyzeRes.ok) {
        const analysis = await analyzeRes.json();
        // Fix #2 — only setResumeAnalysis here. The analysis-landed
        // watcher (downstream useEffect) handles the user-visible push:
        // it replaces the pending artifact placeholder with the real
        // ArtifactCard and a welcome block. Previously this branch ALSO
        // pushed __RESUME_ANALYSIS__ + __RESUME_PRIORITIES__ sentinels,
        // which the ChatWindow renders as a SEPARATE legacy card —
        // user saw two cards for one analysis. The sentinel pushes
        // are gone; the legacy ChatWindow render branch stays for any
        // older persisted chats that still contain those strings.
        setResumeAnalysis(analysis);
        const chatId = activeChatIdRef.current;
        if (chatId && user) {
          saveReport({
            chatId,
            parentDriveId: originalDriveFileId ?? null,
            extraction: resumeExtraction,
            analysis,
            candidateName: resumeExtraction?.name ?? "Resume",
          }).then(() => loadDriveFiles(chatId).then(setDriveFiles).catch(() => {})).catch(() => {});
        }
      }
    } finally {
      setIsAnalyzingResume(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeText, resumeExtraction, originalDriveFileId, user]);

  // ── Send message ──────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      // ── Active questionnaire intercept ────────────────────────
      // If a multi-step intake is in progress (cover letter, etc.),
      // this user message IS the answer to the current step. Record
      // it, push the next step's question, or — if no more steps —
      // dispatch to the generator via runQuestionnaireGenerator below.
      // Free-text is always accepted; pill clicks come through the
      // same handler with the pill label as text.
      if (activeQuestionnaire) {
        const { getQuestionnaire, resolvePills, substitutePrompt, nextStepIdx, progressFor } =
          await import("@/lib/intents/questionnaires");
        const q = getQuestionnaire(activeQuestionnaire.kind);
        if (!q) {
          // Shouldn't happen — clean up.
          setActiveQuestionnaire(null);
        } else {
          const currentStep = q.steps[activeQuestionnaire.stepIdx];
          // Echo the user's answer + record it.
          const updatedAnswers = { ...activeQuestionnaire.answers, [currentStep.key]: trimmed };
          setChatMessages((prev) => [
            ...prev,
            { role: "user", content: trimmed, timestamp: now() },
          ]);
          const ctx = {
            resumeFirstName: profileFirstName ?? resumeExtraction?.name?.split(" ")[0] ?? null,
            resumeSkills: (resumeExtraction?.skillGroups ?? []).flatMap((g) => g.skills ?? []),
            recentChatTitles: chatList.map((c) => c.title ?? "").filter(Boolean),
            recentCompanies: Array.from(new Set(
              chatList
                .map((c) => c.title ?? "")
                .map((t) => {
                  const m = t.match(/\bat\s+(.+?)(?:\s*—|\s*\(|$)/i);
                  return m ? m[1].trim() : "";
                })
                .filter(Boolean)
            )),
          };
          const nextIdx = nextStepIdx(q.steps, activeQuestionnaire.stepIdx, updatedAnswers);
          if (nextIdx === -1) {
            // All steps done — dispatch generator.
            setActiveQuestionnaire(null);
            // Generator dispatch lives in the chip handler / generator
            // section below. For now, the intercept hands off via a
            // sentinel message that downstream handlers (Commit B for
            // cover letter, etc.) recognize.
            setChatMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Got everything I need. Building it now.", timestamp: now() },
            ]);
            // Queue the generator on next tick so React commits the
            // state update first.
            setTimeout(() => {
              questionnaireDispatchRef.current?.(activeQuestionnaire.kind, updatedAnswers);
            }, 0);
          } else {
            // Push the next step's question + its pills.
            const nextStep = q.steps[nextIdx];
            const promptText = substitutePrompt(nextStep.prompt, ctx);
            const pills = resolvePills(nextStep, ctx);
            const { position, total } = progressFor(q.steps, nextIdx, updatedAnswers);
            const numbered = total > 1 ? `${position}/${total} — ${promptText}` : promptText;
            setActiveQuestionnaire({
              kind: activeQuestionnaire.kind,
              stepIdx: nextIdx,
              answers: updatedAnswers,
            });
            setChatMessages((prev) => {
              const out: ChatMessage[] = [
                ...prev,
                { role: "assistant", content: numbered, timestamp: now() },
              ];
              if (pills.length > 0) {
                out.push({ role: "assistant", content: `__INLINE_CHIPS__:${pills.join("|")}` });
              }
              return out;
            });
          }
          return;
        }
      }

      // "Recreate with JD" intake — when this flag is set, the user's
      // next message IS the JD. Echo it, clear the flag, kick off the
      // JD-tailored rewriter, push a pending Tailored-Resume artifact.
      if (pendingJDForRecreate) {
        setPendingJDForRecreate(false);
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed, timestamp: now() },
          { role: "assistant", content: "On it. Tailoring your resume to that JD.", timestamp: now() },
        ]);
        if (!resumeExtraction || !resumeAnalysis) {
          setChatMessages((prev) => [
            ...prev,
            { role: "assistant", content: "I need the resume + report loaded first. Try 'Review my resume'.", timestamp: now() },
          ]);
          return;
        }
        const pendingId = `recreated-resume-pending-${activeChatId ?? "local"}-${Date.now()}`;
        const pending = buildTailoredResumeArtifact({
          id: pendingId,
          company: null,
          role: resumeAnalysis.likelyTargetRole ?? null,
        });
        pending.title = "Tailoring resume to your JD";
        pending.subtitle = "Opus rewrites take ~60-90s. New artifact lands here.";
        pending.pending = true;
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "", timestamp: now(), artifact: pending },
        ]);
        try {
          const res = await fetch("/api/agents/resume/rewrite-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              extraction: resumeExtraction,
              analysis: resumeAnalysis,
              targetRole: resumeAnalysis.likelyTargetRole ?? "your target role",
              jobDescription: trimmed,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `HTTP ${res.status}`);
          }
          const data = await res.json() as { extraction: ResumeExtraction; changedKeys: string[]; qualityWarnings?: string[] };
          const unchanged = (data.qualityWarnings ?? []).some((w) => w.toLowerCase().includes("identical to input"));
          if (unchanged) throw new Error("Rewriter returned the same resume — try a different JD.");
          const realId = `recreated-resume-${activeChatId ?? "local"}-${Date.now()}`;
          const real = buildTailoredResumeArtifact({
            id: realId,
            company: null,
            role: resumeAnalysis.likelyTargetRole ?? null,
          });
          real.title = "Tailored resume — matched to your JD";
          real.subtitle = `${data.changedKeys.length} section${data.changedKeys.length === 1 ? "" : "s"} rewritten for this JD`;
          recreatedResumeCacheRef.current.set(realId, data.extraction);
          setChatMessages((prev) =>
            prev.map((m) =>
              m.artifact?.id === pendingId
                ? { role: "assistant" as const, content: "Done. Click the card to view the tailored resume.", timestamp: now(), artifact: real }
                : m,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          setChatMessages((prev) =>
            prev.map((m) =>
              m.artifact?.id === pendingId
                ? { role: "assistant" as const, content: `Tailor failed — ${msg}. Try again?`, timestamp: now() }
                : m,
            ),
          );
        }
        return;
      }

      // Dynamic intent router. Catches user messages like "python quiz",
      // "rewrite my resume", "cover letter for Stripe" → returns a
      // category + option chips. If a match fires, we echo the user
      // message, push narration + chips, and return — short-circuiting
      // the regular orchestrator/synthesis path. The chip the user
      // clicks then dispatches the appropriate generator.
      //
      // Skip routing on:
      //   - Active intake flows (e.g. JD pending for recreate) — those
      //     have their own intercepts above.
      //   - Active source-chooser flow.
      //   - Chip click labels (those don't need re-routing).
      const isChipLabel = (() => {
        const knownChips = [
          "use current", "upload a new one", "pick from drive", "cancel resume pick",
          "recreate with all fixes", "recreate with jd",
          "skill assessment", "interview drill", "quick question set",
          "tailor to a jd", "quick polish",
          "for a specific jd", "generic strong one", "for a company",
        ];
        const lcTrim = trimmed.toLowerCase();
        return knownChips.some((c) => lcTrim === c || lcTrim.startsWith("use saved · "));
      })();
      if (!pendingResumeReviewSource && !isChipLabel) {
        try {
          const intentRes = await fetch("/api/agents/intent-router", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmed }),
          });
          if (intentRes.ok) {
            const { route } = await intentRes.json() as { route: { category: string; options: Array<{ label: string; key: string }>; narration: string; detectedSkill: string | null } | null };
            if (route && route.options.length > 0) {
              // If this category has a multi-step questionnaire defined,
              // kick that off instead of showing the 3 generic options.
              // Claude-style: ask clarifying questions, collect answers,
              // THEN generate.
              const { getQuestionnaire, resolvePills, substitutePrompt, progressFor } =
                await import("@/lib/intents/questionnaires");
              const kindMap: Record<string, import("@/lib/artifacts").ArtifactKind | null> = {
                cover_letter: "cover_letter",
                // Future: resume → "tailored_resume", interview → ...
                resume: null,
                interview: null,
                unknown: null,
              };
              const kind = kindMap[route.category] ?? null;
              const questionnaire = kind ? getQuestionnaire(kind) : null;
              if (questionnaire && questionnaire.steps.length > 0) {
                const ctx = {
                  resumeFirstName: profileFirstName ?? resumeExtraction?.name?.split(" ")[0] ?? null,
                  resumeSkills: (resumeExtraction?.skillGroups ?? []).flatMap((g) => g.skills ?? []),
                  recentChatTitles: chatList.map((c) => c.title ?? "").filter(Boolean),
                  recentCompanies: Array.from(new Set(
                    chatList
                      .map((c) => c.title ?? "")
                      .map((t) => {
                        const m = t.match(/\bat\s+(.+?)(?:\s*—|\s*\(|$)/i);
                        return m ? m[1].trim() : "";
                      })
                      .filter(Boolean)
                  )),
                };
                const firstStep = questionnaire.steps[0];
                const promptText = substitutePrompt(firstStep.prompt, ctx);
                const pills = resolvePills(firstStep, ctx);
                const { position, total } = progressFor(questionnaire.steps, 0, {});
                const numbered = total > 1 ? `${position}/${total} — ${promptText}` : promptText;
                setActiveQuestionnaire({ kind: kind!, stepIdx: 0, answers: {} });
                setChatMessages((prev) => {
                  const out: ChatMessage[] = [
                    ...prev,
                    { role: "user", content: trimmed, timestamp: now() },
                  ];
                  if (questionnaire.intro) {
                    out.push({ role: "assistant", content: questionnaire.intro, timestamp: now() });
                  }
                  out.push({ role: "assistant", content: numbered, timestamp: now() });
                  if (pills.length > 0) {
                    out.push({ role: "assistant", content: `__INLINE_CHIPS__:${pills.join("|")}` });
                  }
                  return out;
                });
                setIsLoading(false);
                return;
              }
              // No questionnaire for this category — fall through to
              // the legacy 3-option chip flow.
              const chipLabels = route.options.map((o) => o.label).join("|");
              setChatMessages((prev) => [
                ...prev,
                { role: "user", content: trimmed, timestamp: now() },
                { role: "assistant", content: route.narration, timestamp: now() },
                { role: "assistant", content: `__INLINE_CHIPS__:${chipLabels}` },
              ]);
              intentContextRef.current = { category: route.category, detectedSkill: route.detectedSkill };
              setIsLoading(false);
              return;
            }
          }
        } catch (err) {
          // Intent routing is opportunistic — fall through to regular
          // flow on any error.
          console.warn("[intent-router] failed (non-blocking):", err);
        }
      }

      // Client-side intent short-circuit for Interview Prep. The legacy
      // orchestrator on /api/orchestrate (used in chat view) doesn't
      // route to "interview" view — only the Stackle orchestrator does,
      // and it only runs in Resume Builder mode. So a chat-view user
      // saying "interview prep" never got routed. Detect that intent
      // here and switch view immediately. Saves an orchestrator call
      // too (faster).
      const lc = trimmed.toLowerCase();
      const interviewIntent = /\b(interview prep|practice interview|mock interview|drill (sql|python|coding)|prep for (an? )?interview|interview practice|practice for (my )?interview)\b/.test(lc);
      if (interviewIntent && activeView !== "interview") {
        // Echo the user message into chat so the surface change has a
        // narrative reason, then switch view. Skill Agent will handle
        // greeting on the Interview Prep surface.
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed, timestamp: now() },
        ]);
        setTimeout(() => setActiveView("interview"), 150);
        return;
      }
      // Diagnostic: confirm we're appending to the existing chat, not
      // spawning a new one. There is no createChat() anywhere in this
      // function — the message goes through persistChat → updateChat,
      // which targets activeChatIdRef.current via setMessage flow below.
      console.log("[send]", {
        activeChatId,
        activeChatIdRef: activeChatIdRef.current,
        existingMessages: chatMessages.length,
        action: activeChatIdRef.current ? "appending to existing chat" : "no chat id — creating local-chat fallback",
      });

      // Note: the legacy 'change settings' / 'all done' hardcoded
      // branches were removed. They were the only path that ever set
      // intakeStep > 0, so the cascade below is now unreachable. Left
      // in place to avoid touching the 30+ other references in this
      // file; a follow-up commit will physically delete the dead
      // blocks. Any 'change settings' / 'all done' messages now flow
      // through the normal orchestrator/synthesis path like any other
      // user input.

      // ── Cascading intake flow (Steps 1–4) ──────────────
      const skipIntake = /^(just go|skip|no questions|start|go ahead)/i.test(trimmed);
      if (intakeStep > 0 && intakeStep < 5 && !skipIntake) {
        const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: now() };

        if (intakeStep === 1) {
          const isQuick = trimmed.toLowerCase().includes("quick");
          const ack = isQuick ? "Quick Scan — got it, keeping this focused." : "Full Review — noted, I'll go deep.";
          const answers = { ...intakeAnswers, reviewType: trimmed };
          setIntakeAnswers(answers);
          setIntakeStep(2);
          setChatMessages((prev) => [
            ...prev,
            userMsg,
            { role: "assistant", content: `${ack} What level are they targeting?` },
            { role: "assistant", content: "__INLINE_CHIPS__:Senior|Lead|Manager|Director" },
          ]);
          return;
        }
        if (intakeStep === 2) {
          const answers = { ...intakeAnswers, seniority: trimmed };
          setIntakeAnswers(answers);
          setIntakeStep(3);
          setChatMessages((prev) => [
            ...prev,
            userMsg,
            { role: "assistant", content: `${trimmed} — noted. What kind of company are they targeting?` },
            { role: "assistant", content: "__INLINE_CHIPS__:US General|Big Tech|Startup|Healthcare|Finance" },
          ]);
          return;
        }
        if (intakeStep === 3) {
          const answers = { ...intakeAnswers, companyType: trimmed };
          setIntakeAnswers(answers);
          setIntakeStep(4);
          setChatMessages((prev) => [
            ...prev,
            userMsg,
            { role: "assistant", content: `${trimmed} — great choice. Do you have a job description to benchmark against?` },
            { role: "assistant", content: "__INLINE_CHIPS__:No JD|I have a JD" },
          ]);
          return;
        }
        if (intakeStep === 4) {
          // "I have a JD" → go to step 41 (waiting for paste)
          if (/i have|yes|paste|upload|have a jd/i.test(trimmed)) {
            setIntakeStep(41);
            setChatMessages((prev) => [
              ...prev,
              userMsg,
              { role: "assistant", content: "Paste your job description below:" },
            ]);
            return;
          }
          // "No JD" or anything else → proceed with no JD
          const jd = "";
          setIntakeStep(5);

          // Map all collected answers → IntakeData
          const reviewType: IntakeData["reviewType"] =
            intakeAnswers.reviewType?.toLowerCase().includes("quick") ? "Quick Scan" : "Full Review";
          const seniorityRaw = (intakeAnswers.seniority ?? "").toLowerCase();
          const seniorityLevel: IntakeData["seniorityLevel"] =
            seniorityRaw.includes("manager") ? "Manager" :
            seniorityRaw.includes("director") ? "Manager" :
            seniorityRaw.includes("lead") ? "Staff / Principal" :
            seniorityRaw.includes("mid") ? "Mid" : "Senior";
          const marketRaw = (intakeAnswers.companyType ?? "").toLowerCase();
          const targetMarket: IntakeData["targetMarket"] =
            marketRaw.includes("big tech") || marketRaw.includes("faang") ? "Big Tech / FAANG" :
            marketRaw.includes("canada") ? "Canada" :
            marketRaw.includes("india") ? "India" : "US General";

          const builtData: IntakeData = { reviewType, targetMarket, seniorityLevel, jobDescription: jd };
          setIntakeData(builtData);

          setChatMessages((prev) => [
            ...prev,
            userMsg,
            { role: "assistant", content: `Got it — running a ${reviewType.toLowerCase()} for a ${seniorityLevel} profile. Give me a moment.` },
          ]);

          await runIntakeAnalysis(builtData, userMsg);
          return;
        }
      }
      // Step 41 — waiting for pasted JD text
      if (intakeStep === 41) {
        const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: now() };
        const jd = trimmed;
        setIntakeStep(5);
        const reviewType: IntakeData["reviewType"] =
          intakeAnswers.reviewType?.toLowerCase().includes("quick") ? "Quick Scan" : "Full Review";
        const seniorityRaw = (intakeAnswers.seniority ?? "").toLowerCase();
        const seniorityLevel: IntakeData["seniorityLevel"] =
          seniorityRaw.includes("manager") ? "Manager" :
          seniorityRaw.includes("director") ? "Manager" :
          seniorityRaw.includes("lead") ? "Staff / Principal" :
          seniorityRaw.includes("mid") ? "Mid" : "Senior";
        const marketRaw = (intakeAnswers.companyType ?? "").toLowerCase();
        const targetMarket: IntakeData["targetMarket"] =
          marketRaw.includes("big tech") || marketRaw.includes("faang") ? "Big Tech / FAANG" :
          marketRaw.includes("canada") ? "Canada" :
          marketRaw.includes("india") ? "India" : "US General";
        const builtData: IntakeData = { reviewType, targetMarket, seniorityLevel, jobDescription: jd };
        setIntakeData(builtData);
        setChatMessages((prev) => [
          ...prev,
          userMsg,
          { role: "assistant", content: `Got it — running a ${reviewType.toLowerCase()} for a ${seniorityLevel} profile benchmarked against your JD. Give me a moment.` },
        ]);
        await runIntakeAnalysis(builtData, null);
        return;
      }
      // Skip intake — use defaults
      if (intakeStep > 0 && intakeStep < 5 && skipIntake) {
        setIntakeStep(5);
        const builtData: IntakeData = { reviewType: "Full Review", targetMarket: "US General", seniorityLevel: "Senior", jobDescription: "" };
        setIntakeData(builtData);
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed },
          { role: "assistant", content: "Got it — running a full review. Give me a moment." },
        ]);
        await runIntakeAnalysis(builtData, null);
        return;
      }

      const userMessage: ChatMessage = { role: "user", content: trimmed, timestamp: now() };
      const updatedMessages = [...messages, userMessage];

      setMessages(updatedMessages);
      setInput("");
      setIsLoading(true);

      // Context trimming — max 20 messages (keep first + last 19)
      const nonSentinel = updatedMessages.filter((m) => !SENTINELS.includes(m.content) && !m.content.startsWith("__FILE_UPLOAD__:"));
      const trimmed20 =
        nonSentinel.length > 20
          ? [nonSentinel[0], ...nonSentinel.slice(-19)]
          : nonSentinel;
      const apiMessages = trimmed20.map((m) => ({ role: m.role, content: m.content }));

      let finalMessages = updatedMessages;
      let finalAnalysis = resumeAnalysis;

      // Fresh controller for this send — previous one (if any) already resolved.
      const controller = new AbortController();
      agentAbortRef.current = controller;

      // ── URL FAST-PATH (top priority in Resume Builder) ──────────
      // If the user pastes a JD URL inside Resume Builder, scrape it
      // immediately. Sits ABOVE both the Stackle calibration branch
      // and the Resume Orchestrator branch so the URL never reaches
      // an LLM that would say "I can't fetch URLs."
      //
      // Regression context: the URL detection used to live further
      // down, after the calibration branch. When the user is in
      // Resume Builder with extraction but no analysis (Drive-
      // hydrated resume that hasn't had a review run yet), the
      // calibration branch consumed the URL and sent it to Sonnet,
      // which apologized politely. Now URLs win regardless of
      // analysis state.
      if (isResumeMode && resumeExtraction) {
        const urlMatchPre = trimmed.match(/\bhttps?:\/\/[^\s)]+/i);
        if (urlMatchPre) {
          const url = urlMatchPre[0].replace(/[.,);]+$/, "");
          // Echo the user's message + show what we're doing.
          setChatMessages((prev) => [
            ...prev,
            { role: "user", content: trimmed, timestamp: now() },
            { role: "assistant", content: `Fetching the JD from ${new URL(url).hostname}…`, timestamp: now() },
          ]);
          if (!resumeAnalysis) {
            // No analysis loaded — tailor needs one. Tell the user.
            setChatMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "Need a resume review first so I can tailor against your scores. Click 'Review my resume' to run one, then paste the URL again.",
                timestamp: now(),
              },
            ]);
            setIsLoading(false);
            return;
          }
          setIsLoading(false);
          setPendingChatTool({ ts: Date.now(), name: "tailor_for_jd_url", input: { url } });
          return;
        }
      }

      // ── PHASE B: Stackle Top-Level Orchestrator (analysis still running) ──
      // Resume Builder mode + extraction present + no analysis yet.
      // The Stackle Orchestrator (Sonnet 4.5) handles the calibration
      // conversation. Extracts role/seniority/focus from natural language,
      // recommends paths, routes to a Manager when ready.
      if (isResumeMode && resumeExtraction && !resumeAnalysis) {
        try {
          const apiHistory = updatedMessages
            .filter((m) => !m.content.startsWith("__"))
            .map((m) => ({ role: m.role, content: m.content }));
          const firstName = (resumeExtraction.name ?? "").trim().split(/\s+/)[0] || null;
          const topExp = resumeExtraction.experience?.[0];
          const topSkills = (resumeExtraction.skillGroups ?? []).flatMap((g) => g.skills ?? []).slice(0, 8);
          const oRes = await fetch("/api/agents/orchestrator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              messages: apiHistory,
              resumeContext: {
                firstName,
                fullName: resumeExtraction.name,
                targetRoleFromUpload: chosenTargetRole,
                yearsExperience: resumeExtraction.totalYearsExperience,
                topRole: topExp?.title,
                topCompany: topExp?.company,
                topSkills,
                location: resumeExtraction.location,
                summary: resumeExtraction.summary,
              },
              priorSignals: { role: orchFocus ? null : chosenTargetRole, seniority: orchSeniority, focus: orchFocus, careerGoal },
            }),
          });
          if (!oRes.ok) throw new Error("orchestrator http error");
          const data = await oRes.json() as {
            route: {
              managerKey: string;
              narration: string;
              chips: string[];
              extractedSignals: { role: string | null; seniority: string | null; focus: string | null; careerGoal: string | null };
            };
          };
          const r = data.route;
          // Persist orchestrator-extracted signals so we can act across turns.
          if (r.extractedSignals?.focus) setOrchFocus(r.extractedSignals.focus as FocusKey);
          if (r.extractedSignals?.seniority) setOrchSeniority(r.extractedSignals.seniority);
          // Persist conversationally-captured target role + career goal
          // so subsequent turns / managers can use them. The orchestrator
          // echoes whatever it captured on every turn — we only write
          // when there's a non-empty value so we never null-out state.
          if (r.extractedSignals?.role && !chosenTargetRole) setChosenTargetRole(r.extractedSignals.role);
          if (r.extractedSignals?.careerGoal && !careerGoal) setCareerGoal(r.extractedSignals.careerGoal);

          const reply: ChatMessage[] = [
            ...updatedMessages,
            { role: "assistant" as const, content: r.narration, timestamp: now() },
            ...(r.chips.length > 0 ? [{ role: "assistant" as const, content: `__INLINE_CHIPS__:${r.chips.join("|")}` }] : []),
          ];

          // Route on managerKey when the orchestrator commits.
          // - "resume": if analysis already done, the watcher (separate
          //   useEffect) appends the report after this reply lands. If
          //   analysis still running, append a rotating-status placeholder
          //   that gets replaced when analysis arrives.
          // - "interview": switch the active view so the user lands in
          //   Interview Prep next render.
          // - "cover_letter" / "career_strategy": orchestrator's narration
          //   already says "coming soon" — no extra routing needed.
          // - "more_info_needed": continue chatting; orchestrator asked
          //   another question.
          if (r.managerKey === "resume") {
            if (!resumeAnalysis) {
              reply.push({
                role: "assistant",
                content: "__ANALYSIS_PROGRESS__",
                timestamp: now(),
              });
            }
            // If analysis is ready, the analysis-landed watcher (which now
            // watches orchFocus too) won't fire because it's already
            // landed. Drop the report inline instead.
            else {
              const reportText = buildResumeBuilderWelcome(
                resumeExtraction, null, resumeAnalysis, chosenTargetRole,
              );
              const reportChips = buildWelcomeChipsForAnalysis(resumeAnalysis);
              reply.push(
                { role: "assistant", content: "Done reading. Here's where you stand:", timestamp: now() },
                { role: "assistant", content: reportText, timestamp: now() },
                { role: "assistant", content: reportChips },
              );
              // Open the panel since analysis is ready.
              setOpenReportSignal((n) => n + 1);
            }
          } else if (r.managerKey === "interview") {
            // Defer view switch to next tick so this turn's chat persists first.
            setTimeout(() => setActiveView("interview"), 200);
          } else if (r.managerKey === "learn") {
            setTimeout(() => setActiveView("learn"), 200);
          }

          setMessages(reply);
          setIsLoading(false);
          if (activeChatIdRef.current) {
            persistChat(activeChatIdRef.current, reply, "resume_builder", {
              resumeText, resumeFilename, resumeExtraction, resumeAnalysis,
            });
          }
          if (agentAbortRef.current === controller) agentAbortRef.current = null;
          return;
        } catch (err) {
          const wasAborted = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
          if (!wasAborted) {
            console.error("[stackle-orch send]", err);
            setIsLoading(false);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Hit a snag — try again?", timestamp: now() },
            ]);
          } else {
            setIsLoading(false);
          }
          if (agentAbortRef.current === controller) agentAbortRef.current = null;
          return;
        }
      }

      // ── PHASE 2/3: Resume Builder chat-first orchestrator ───────────────
      // When the user is in Resume Builder mode and analysis is loaded, the
      // chat is the steering wheel. Route through Sonnet 4.5 with tool use
      // — the orchestrator drives the panel via tools and narrates every
      // action. Bypasses the orchestrate→analyze→synthesize chain entirely.
      // intakeStep >= 5 used to gate this branch — that gate was a relic
      // of the now-disabled intake cascade. Since the cascade can no
      // longer run, intakeStep is permanently 0 for fresh users and the
      // URL-fast-path got silently disabled. Bug-from-user: LinkedIn
      // URLs (and any URL) stopped triggering the JD tailor flow. Gate
      // is gone now — Resume Builder + analysis loaded is enough.
      if (isResumeMode && resumeAnalysis) {
        // FAST-PATH: deterministic URL detection. Sonnet has a baked-in prior
        // ("AI assistants can't fetch URLs") that occasionally beats out the
        // tool instruction — model says "Got it, let me pull that..." but
        // doesn't emit the tool_use. Bypass the LLM entirely when the user
        // shares a URL: synthesise the tool dispatch client-side. The user
        // gets immediate action, no LLM contradiction risk.
        const urlMatch = trimmed.match(/\bhttps?:\/\/[^\s)]+/i);
        if (urlMatch) {
          const url = urlMatch[0].replace(/[.,);]+$/, "");
          // Render an assistant ack + dispatch the tool to ResumeBuilder.
          setMessages((prev) => [...prev, { role: "assistant", content: `Fetching the JD from ${new URL(url).hostname}…`, timestamp: now() }]);
          setIsLoading(false);
          setPendingChatTool({ ts: Date.now(), name: "tailor_for_jd_url", input: { url } });
          if (agentAbortRef.current === controller) agentAbortRef.current = null;
          return;
        }
        // FAST-PATH 2: user pastes a chunk of JD-shaped text (>200 chars,
        // contains "responsibilities" or "requirements" or "qualifications").
        // Same reason — bypass the LLM contradicting itself.
        const looksLikeJD = trimmed.length > 200
          && /(responsibilit|requirement|qualifications|what you'll do|about the role|years of experience|must.have|nice.to.have)/i.test(trimmed);
        if (looksLikeJD) {
          setMessages((prev) => [...prev, { role: "assistant", content: "Reading the JD…", timestamp: now() }]);
          setIsLoading(false);
          setPendingChatTool({ ts: Date.now(), name: "tailor_for_jd", input: { jd_text: trimmed } });
          if (agentAbortRef.current === controller) agentAbortRef.current = null;
          return;
        }

        try {
          const currentScore =
            (resumeAnalysis.scores && typeof resumeAnalysis.scores.total === "number" && resumeAnalysis.scores.total > 0)
              ? Math.round(resumeAnalysis.scores.total)
              : null;
          const res = await fetch("/api/agents/resume-orchestrator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              messages: apiMessages,
              extraction: resumeExtraction,
              analysis: resumeAnalysis,
              state: conversationStateRef.current,
              currentScore,
              originalScore: currentScore,
            }),
          });
          if (!res.ok || !res.body) throw new Error("orchestrator HTTP error");

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let assistantText = "";
          let chips: string[] = [];
          const toolEvents: ChatToolEvent[] = [];

          setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
          setIsLoading(false);

          let buf = "";
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
                  assistantText += frame.text;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: assistantText };
                    return updated;
                  });
                } else if (frame.kind === "tool") {
                  toolEvents.push({ ts: Date.now() + toolEvents.length, name: frame.name, input: frame.input ?? {} });
                } else if (frame.kind === "chips") {
                  chips = frame.chips ?? [];
                }
              } catch { /* skip malformed */ }
            }
          }

          // Strip any trailing [CHIPS] line that leaked into the text (defensive).
          const cleaned = assistantText.replace(/\n*\[CHIPS\][^\n]*$/i, "").trim();
          const finalChat: ChatMessage[] = [
            ...updatedMessages,
            { role: "assistant", content: cleaned, timestamp: now() },
          ];
          if (chips.length > 0) {
            finalChat.push({ role: "assistant", content: `__INLINE_CHIPS__:${chips.join("|")}` });
          }
          setMessages(finalChat);
          finalMessages = finalChat;

          // Dispatch tool calls one by one to the panel. Stagger ~120ms so
          // multiple tool effects don't race within React's batching.
          toolEvents.forEach((evt, idx) => {
            setTimeout(() => setPendingChatTool(evt), idx * 120);
          });

          // Local state side-effects from preference tools.
          for (const evt of toolEvents) {
            if (evt.name === "set_style_preference") {
              const style = (evt.input.style as ConversationStateLite["preferredStyle"]) ?? null;
              const note = typeof evt.input.note === "string" ? evt.input.note : null;
              setConversationState((s) => ({ ...s, preferredStyle: style, styleNote: note }));
            }
          }

          const id = activeChatIdRef.current;
          if (id) {
            persistChat(id, finalChat, "resume_builder", {
              resumeText,
              resumeFilename,
              resumeExtraction,
              resumeAnalysis,
              careerGoal,
            });
          }
          return;
        } catch (err) {
          const wasAborted = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
          if (!wasAborted) {
            setIsLoading(false);
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Hit a snag reaching the server. Try again?" },
            ]);
            console.error("[resume-orchestrator]", err);
          } else {
            setIsLoading(false);
          }
          if (agentAbortRef.current === controller) agentAbortRef.current = null;
          return;
        }
      }

      const sendFlowId = newFlowId();
      flowInfo("chat-receive", sendFlowId, { userMessage: trimmed.slice(0, 60), len: trimmed.length });
      try {
        // Step 1: Orchestrate
        let decision: OrchestratorDecision = DEFAULT_ORCHESTRATOR_DECISION;
        const orchLog = flowStart("orchestrate", sendFlowId, { msgs: apiMessages.length, hasResume: !!resumeText });
        try {
          const orchRes = await fetch("/api/orchestrate", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-stackle-flow-id": sendFlowId },
            signal: controller.signal,
            body: JSON.stringify({ messages: apiMessages, resumeText }),
          });
          if (orchRes.ok) {
            decision = await orchRes.json();
            orchLog.end({
              runResumeIntelligence: decision.runResumeIntelligence,
              runMarketIntelligence: decision.runMarketIntelligence,
              runInterviewPrep: decision.runInterviewPrep,
              targetRole: decision.detectedTargetRole,
            });
          } else {
            orchLog.err(new Error(`http ${orchRes.status}`));
          }
        } catch (e) { orchLog.err(e); }

        setOrchestratorDecision(decision);

        // Step 2: Resume Intelligence — fire in BACKGROUND so synthesis
        // doesn't block on the ~15s analyzer call. The analysis-landed
        // watcher (resumeAnalysis state change) handles the artifact
        // card push when results arrive. Chat text streams immediately.
        const currentAnalysis = resumeAnalysis;
        if (decision.runResumeIntelligence && resumeText && !resumeAnalysis) {
          setIsAnalyzingResume(true);
          fetch("/api/agents/resume/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resumeText,
              targetRole: decision.detectedTargetRole,
              messages: apiMessages,
              reviewType: intakeData?.reviewType,
              targetMarket: intakeData?.targetMarket,
              seniorityLevel: intakeData?.seniorityLevel,
              jobDescription: intakeData?.jobDescription,
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((a: ResumeAnalysis | null) => {
              if (!a) return;
              setResumeAnalysis(a);
              // Auto-save report to Drive in background.
              const chatId = activeChatIdRef.current;
              if (chatId) {
                saveReport({
                  chatId,
                  parentDriveId: originalDriveFileId ?? null,
                  extraction: resumeExtraction,
                  analysis: a,
                  candidateName: resumeExtraction?.name ?? "Resume",
                }).then((file) => {
                  if (file) loadDriveFiles(chatId).then(setDriveFiles).catch(() => {});
                }).catch(() => {});
              }
            })
            .catch(() => { /* non-blocking */ })
            .finally(() => setIsAnalyzingResume(false));
        }

        // Step 3: Market Intelligence
        let currentMarketAnalysis = marketAnalysis;
        if (decision.runMarketIntelligence && decision.detectedTargetRole) {
          const marketKey = `${decision.detectedTargetRole}::${decision.detectedSeniority ?? "any"}::${decision.detectedLocation ?? "global"}`;
          if (analyzedMarketKey !== marketKey) {
            const marketLog = flowStart("market", sendFlowId, { targetRole: decision.detectedTargetRole, seniority: decision.detectedSeniority });
            try {
              const marketRes = await fetch("/api/agents/market/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-stackle-flow-id": sendFlowId },
                body: JSON.stringify({
                  targetRole: decision.detectedTargetRole,
                  seniority: decision.detectedSeniority,
                  location: decision.detectedLocation,
                  messages: apiMessages,
                }),
              });
              if (marketRes.ok) {
                currentMarketAnalysis = await marketRes.json();
                marketLog.end({ ok: true });
                setMarketAnalysis(currentMarketAnalysis);
                setAnalyzedMarketKey(marketKey);
                const withMarket: ChatMessage[] = [
                  ...finalMessages,
                  { role: "assistant", content: "__MARKET_ANALYSIS__" },
                ];
                setMessages(withMarket);
                finalMessages = withMarket;
              } else {
                marketLog.err(new Error(`http ${marketRes.status}`));
              }
            } catch (e) { marketLog.err(e); }
          }
        }

        // Step 4: Interview Prep
        let currentInterviewPlan = interviewPrepPlan;
        if (
          decision.runInterviewPrep &&
          decision.detectedTargetRole &&
          decision.detectedSeniority &&
          decision.detectedInterviewType
        ) {
          try {
            const interviewRes = await fetch("/api/agents/interview/prep", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: decision.detectedTargetRole,
                level: decision.detectedSeniority,
                interviewType: decision.detectedInterviewType,
                resumeText,
              }),
            });
            if (interviewRes.ok) {
              currentInterviewPlan = await interviewRes.json();
              setInterviewPrepPlan(currentInterviewPlan);
              const withInterview: ChatMessage[] = [
                ...finalMessages,
                { role: "assistant", content: "__INTERVIEW_PREP__" },
              ];
              setMessages(withInterview);
              finalMessages = withInterview;
            }
          } catch { /* non-blocking */ }
        }

        // Step 5: Stream synthesis
        const stackleStart = Date.now();
        const synthLog = flowStart("synthesize", sendFlowId, {
          mode: isResumeMode ? "resume_builder" : "chat",
          hasAnalysis: !!currentAnalysis,
          hasMarket: !!currentMarketAnalysis,
          hasInterview: !!currentInterviewPlan,
        });
        const res = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-stackle-flow-id": sendFlowId },
          signal: controller.signal,
          body: JSON.stringify({
            messages: apiMessages,
            resumeText,
            resumeExtraction,
            resumeAnalysis: currentAnalysis,
            marketAnalysis: currentMarketAnalysis,
            orchestratorDecision: decision,
            interviewPrepPlan: currentInterviewPlan,
            mode: isResumeMode ? "resume_builder" : "chat",
            careerGoal,
          }),
        });

        if (!res.ok) throw new Error("API error");
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantText = "";

        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        finalMessages = [...finalMessages, { role: "assistant", content: "" }];
        setIsLoading(false);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const { text: t } = JSON.parse(data);
              assistantText += t;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantText };
                return updated;
              });
            } catch { /* skip malformed */ }
          }
        }

        synthLog.end({ chars: assistantText.length, tookFromStart: Date.now() - stackleStart });
        // Final messages with streamed content
        const streamedMessages: ChatMessage[] = [
          ...finalMessages.slice(0, -1),
          { role: "assistant", content: assistantText },
        ];

        // Persist to Supabase / localStorage
        const id = activeChatIdRef.current;
        console.log("[send:after-stream]", {
          activeChatId: id,
          streamedMessageCount: streamedMessages.length,
          willPersist: !!id,
        });
        if (id) {
          persistChat(id, streamedMessages, isResumeMode ? "resume_builder" : "chat", {
            resumeText,
            resumeFilename,
            resumeExtraction,
            resumeAnalysis: finalAnalysis,
            careerGoal,
          });
        }

        // Shadow benchmark — fire and forget. Runs raw Claude with the same
        // context, judges both blind, stores to benchmark_runs/judgments.
        // Only in chat mode (resume_builder has different dynamics).
        if (!isResumeMode && assistantText.trim().length > 0) {
          const shadowBody = {
            // `id` is undefined in this scope — use the active chat ref so
            // benchmark rows can be correlated to actual conversations.
            chatId: activeChatIdRef.current ?? null,
            userId: user?.id ?? null,
            userMessage: trimmed,
            conversationHistory: apiMessages,
            stackleResponse: assistantText,
            stackleLatencyMs: Date.now() - stackleStart,
            resumeText,
            resumeExtraction,
          };
          fetch("/api/shadow-benchmark", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(shadowBody),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((result) => {
              if (result?.ok) {
                console.log(
                  `[benchmark] winner=${result.winner} latency(claude=${result.claudeLatencyMs}ms, stackle=${shadowBody.stackleLatencyMs}ms) — ${result.reasoning}`
                );
              }
            })
            .catch(() => { /* fire and forget */ });
        }
      } catch (err) {
        setIsLoading(false);
        setIsAnalyzingResume(false);
        // If the user hit Stop, the AbortError is expected — don't show an
        // error message. Any other failure gets the generic recovery line.
        const wasAborted = err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
        if (!wasAborted) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Something went wrong — I couldn't reach the server. Try again?",
            },
          ]);
          console.error(err);
        }
      } finally {
        if (agentAbortRef.current === controller) agentAbortRef.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, setMessages, isLoading, isResumeMode, resumeText, resumeFilename, resumeExtraction, resumeAnalysis, intakeData, intakeStep, intakeAnswers, marketAnalysis, analyzedMarketKey, interviewPrepPlan, pendingJDForRecreate, activeChatId, activeQuestionnaire, chatList, profileFirstName]
  );

  // Keep the edit-and-resend ref current with the latest sendMessage closure.
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ── Intake form submit ────────────────────────────────

  // ── Computed ──────────────────────────────────────────
  const activeMode =
    orchestratorDecision?.primaryNeed !== "general_guidance"
      ? orchestratorDecision?.primaryNeed
      : null;

  // Hierarchical nav: parent groups (not clickable) with child items
  // (clickable). Locked children show "Soon" pill and a toast on click.
  // When we ship Cover Letter / Interview Prep / Job Match / Published /
  // Versions / Profile / Settings, flip locked:false and set view to a
  // real ActiveView. The data shape stays the same.
  type NavChild = {
    key: string;
    label: string;
    icon: typeof FileText;
    view: ActiveView | null;
    locked: boolean;
    // Optional route to navigate to instead of switching activeView.
    // Used for surfaces that live at their own URL (e.g. /learn).
    href?: string;
  };
  type NavGroup = { label: string; items: NavChild[] };
  // Chat-as-chassis model: Resume Builder + Interview Prep are no longer
  // top-level destinations. They're workspaces that open inside the chat
  // shell when the orchestrator routes there. Drive + Foundations stay
  // visible in the sidebar because they're useful as direct launchpads
  // (file browse / curriculum browse), but they open inside the same
  // chat shell too — as the right-pane workspace, not a separate page.
  const NAV_GROUPS: NavGroup[] = [
    {
      label: "Workspace",
      items: [
        { key: "resume-builder", label: "Resume Builder", icon: FileEdit, view: "resume-builder", locked: false },
        { key: "interview-prep", label: "Interview Prep", icon: Mic,      view: "interview",      locked: false },
      ],
    },
    {
      label: "Library",
      items: [
        // Job Match is its own chat surface (mode="job_match"). Drive +
        // Foundations open inside the chat shell as workspace lenses.
        { key: "job-match",   label: "Job Match",   icon: Target,        view: "job-match", locked: false },
        { key: "drive",       label: "Drive",       icon: FolderOpen,    view: "drive",     locked: false },
        { key: "foundations", label: "Foundations", icon: GraduationCap, view: "learn",     locked: false },
      ],
    },
  ];

  // ── Sidebar JSX ───────────────────────────────────────
  // collapsed = icon-only rail (48px); expanded = full (224px)
  const SidebarContent = ({ expanded }: { expanded: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo + toggle */}
      <div className={`flex items-center ${expanded ? "justify-between px-3" : "justify-center"} py-3 mb-2`}>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 cursor-pointer"
          style={{ background: "#000" }}
          onClick={() => setIsSidebarExpanded(!expanded)}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          S
        </div>
      </div>

      {/* User avatar — moved from top-right header into the sidebar
          per user preference. Sits below the logo, above the New
          conversation button. Dropdown anchors top-left now so it
          opens DOWN from the avatar inside the sidebar.
          Label prefers profile first name (then full name) over the
          raw email so 'Nikhil' shows instead of 'nekarne@gmail.com'. */}
      {isSignedUp && (() => {
        const displayName =
          [profileFirstName, profileLastName].filter(Boolean).join(" ").trim()
          || profileFirstName
          || user?.email
          || "Account";
        const initial = (
          profileFirstName?.[0]
          ?? user?.email?.[0]
          ?? "?"
        ).toUpperCase();
        return (
        <div className={`relative group ${expanded ? "px-3" : "px-1.5"} mb-3 flex ${expanded ? "items-center gap-2" : "justify-center"}`}>
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            title={user?.email ?? "Account"}
            aria-label="Account menu"
            className="w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center text-xs font-semibold flex-shrink-0"
          >
            {initial}
          </button>
          {expanded && (
            <span className="text-[12px] text-gray-700 truncate flex-1">
              {displayName}
            </span>
          )}
          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute left-2 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[220px]">
                <div className="px-3 py-2.5 border-b border-gray-200">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500">Signed in as</p>
                  <p className="text-[13px] text-gray-800 truncate mt-0.5">{user?.email ?? "—"}</p>
                </div>
                <a
                  href="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4" strokeWidth={1.75} />
                  Settings
                </a>
                <button
                  onClick={() => { setUserMenuOpen(false); handleSignOut(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] text-rose-700 hover:bg-rose-50 transition-colors border-t border-gray-200"
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.75} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* New conversation */}
      <div className={`${expanded ? "px-2" : "px-1.5"} mb-3`}>
        <div className="relative group">
          <button
            onClick={handleNewConversation}
            className={`flex items-center ${expanded ? "gap-2 px-3 w-full" : "justify-center w-full px-0"} py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors`}
          >
            <Plus className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            {expanded && <span className="text-sm truncate">New conversation</span>}
          </button>
          {!expanded && <SidebarTooltip label="New conversation" />}
        </div>
      </div>

      {/* Nav — grouped (Workspace / Library / You). Expanded shows group
          labels + indented children. Collapsed shows icons stacked with
          a small gap between groups, no labels. */}
      <div className={`${expanded ? "px-2" : "px-1.5"} mb-3`}>
        {NAV_GROUPS.map((group, gi) => (
          // When expanded the group label needs breathing room; when
          // collapsed (icon rail) the gap looks like an accidental break.
          // Collapse the inter-group space to a tiny 4px in that mode.
          <div key={group.label} className={gi > 0 ? (expanded ? "mt-4" : "mt-1") : ""}>
            {expanded && (
              <p className="text-[10px] font-medium tracking-[0.05em] uppercase text-gray-400 px-2 mb-1">
                {group.label}
              </p>
            )}
            <div className={expanded ? "space-y-0.5" : "space-y-0"}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = !item.locked && item.view !== null && activeView === item.view;
                const baseClasses = `flex items-center ${expanded ? "gap-2.5 px-2 w-full py-2" : "justify-center w-full px-0 py-1.5"} rounded-md font-medium transition-colors`;
                const stateClasses = item.locked
                  ? "text-gray-400 cursor-default opacity-60"
                  : isActive
                    ? "text-gray-900 bg-gray-100"
                    : "text-gray-800 hover:text-gray-900 hover:bg-gray-100";
                const handleClick = () => {
                  if (item.locked) {
                    showNavToast(item.label);
                    return;
                  }
                  // External-route entries (e.g. /learn) navigate via
                  // window.location so they get a full page transition
                  // out of the SPA shell.
                  if (item.href) {
                    window.location.href = item.href;
                    return;
                  }
                  if (item.view) {
                    // Resume is the heart — but each click on a surface
                    // should start that surface clean. For Interview Prep,
                    // clear the persisted picked-skill so the welcome
                    // screen renders the fresh skill chips instead of
                    // jumping straight into a difficulty picker from a
                    // previous session. lastDifficulty stays as a
                    // preference (ring-highlighted on next pick).
                    if (item.view === "interview" && typeof window !== "undefined") {
                      try {
                        localStorage.removeItem("stackle_interview_picked_skill");
                      } catch { /* ignore */ }
                    }
                    setActiveView(item.view);
                    setIsSidebarOpen(false);
                  }
                };
                return (
                  <div key={item.key} className="relative group">
                    <button
                      onClick={handleClick}
                      className={`${baseClasses} ${stateClasses}`}
                    >
                      <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
                      {expanded && (
                        <>
                          <span className="text-sm truncate flex-1 text-left">{item.label}</span>
                          {item.locked && (
                            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-gray-200 text-gray-400">
                              Soon
                            </span>
                          )}
                        </>
                      )}
                    </button>
                    {!expanded && (
                      <SidebarTooltip label={item.locked ? `${item.label} — coming soon` : item.label} />
                    )}
                  </div>
                );
              })}
              {/* Conditional Report row — sits inside Workspace, only when
                  analysis is loaded. Same active style as the others. */}
              {group.label === "Workspace" && resumeAnalysis && (
                <div className="relative group">
                  <button
                    onClick={() => {
                      setActiveView("resume-builder");
                      setOpenReportSignal((n) => n + 1);
                      setIsSidebarOpen(false);
                    }}
                    className={`flex items-center ${expanded ? "gap-2.5 px-2 w-full" : "justify-center w-full px-0"} py-2 rounded-md font-medium transition-colors text-gray-500 hover:text-gray-900 hover:bg-gray-50`}
                  >
                    <ClipboardList className="w-5 h-5 flex-shrink-0" strokeWidth={1.75} />
                    {expanded && <span className="text-sm truncate">Report</span>}
                  </button>
                  {!expanded && <SidebarTooltip label="Report" />}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Locked-item toast — only renders while there's a message. Pinned
          to bottom-right of the viewport so it's visible even when the
          sidebar is collapsed. Auto-dismisses via showNavToast timer. */}
      {navToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
          {navToast}
        </div>
      )}

      {/* Chat history — only when expanded. Filters out empty chats
          (no user messages yet) so the sidebar isn't a graveyard of
          "New conversation" rows that the user clicked but never used.
          The currently-active chat is exempted from the filter so it
          stays visible while you're composing your first message. */}
      {expanded && (() => {
        const userTouchedChats = chatList.filter((c) => {
          if (c.id === activeChatId) return true;
          const realMessages = (c.messages ?? []).filter(
            (m) => m.role === "user" && !m.content.startsWith("__"),
          );
          return realMessages.length > 0;
        });
        if (userTouchedChats.length === 0) return null;
        return (
        <div className="flex-1 overflow-y-auto px-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider px-1 mb-1.5">Recent</p>
          <div className="space-y-0.5">
            {userTouchedChats.map((chat) => (
              <div
                key={chat.id}
                className="group relative"
                onMouseEnter={() => setHoverChatId(chat.id)}
                onMouseLeave={() => setHoverChatId(null)}
              >
                <button
                  onClick={() => handleSwitchChat(chat.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors pr-8 truncate ${
                    activeChatId === chat.id
                      ? "bg-white text-gray-900 border border-gray-200"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent"
                  }`}
                >
                  {chat.title}
                </button>
                {hoverChatId === chat.id && chatList.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {/* Drive version history removed from sidebar — accessible via the
          Drive nav item instead. The compact Resumes/Reports list felt
          like clutter inside the main nav. */}

    </div>
  );

  // ── Loading screen ────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex h-screen bg-white items-center justify-center">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-black text-sm font-bold animate-pulse"
          style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)" }}
        >
          S
        </div>
      </div>
    );
  }

  // ── Unauth landing ────────────────────────────────────
  // Auth-init runs on mount. While it's resolving, render a tiny
  // spinner so we don't flash the marketing page for already-authed
  // users. Once resolved, branch: unauth → marketing landing, authed
  // → app shell.
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf7]">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
      </div>
    );
  }
  if (!user) {
    return <MarketingLanding />;
  }
  // First-time profile setup: every authed user must pick a username
  // before they reach the chat hero. Check is async; the effect below
  // routes to /profile/setup when needed. Render the boot spinner
  // while the check is in flight.
  if (needsProfileSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf7]">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
      </div>
    );
  }
  // needsProfileSetup === true → useEffect below has already pushed
  // router to /profile/setup. Show the spinner during the transition.
  if (needsProfileSetup === true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf7]">
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
      </div>
    );
  }

  // ── Onboarding ────────────────────────────────────────
  // Boot guard: while we're still checking whether the user has a
  // saved resume in Drive (returning user), show a minimal loading
  // state instead of flashing OnboardingFlow. Without this, returning
  // users see "Upload your resume" for a beat before being rehydrated
  // — looks like the sign-in failed.
  if (bootChecking && user && !onboardingCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf7]">
        <div className="flex items-center gap-2.5 text-gray-500">
          <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" />
          <span className="text-sm">Loading your session…</span>
        </div>
      </div>
    );
  }
  if (!onboardingCompleted) {
    return (
      <>
        <OnboardingFlow
          onComplete={({ resumeText: rt, resumeFilename: rf, resumeExtraction: re, resumeAnalysis: ra, contact, careerGoal: goal, chosenTargetRole: ctr }) => {
            if (ctr) setChosenTargetRole(ctr);
            if (rt) { setResumeText(rt); setResumeFilename(rf ?? undefined); }
            // Merge contact fields back into the extraction so downstream consumers
            // (synthesis prompt, Drive, chat) see the user-confirmed values.
            if (contact && re) {
              const name = `${contact.firstName} ${contact.lastName}`.trim();
              const location = [contact.city, contact.state].filter(Boolean).join(", ");
              setResumeExtraction({
                ...re,
                name: name || re.name,
                email: contact.email || re.email,
                phone: contact.phone || re.phone,
                location: location || re.location,
              });
            } else if (re) {
              setResumeExtraction(re);
            }
            if (ra) setResumeAnalysis(ra);
            if (goal) setCareerGoal(goal);
            // Land the user on Resume Builder. DO NOT open the right
            // panel here — analysis isn't ready yet, and showing the
            // empty/loading panel makes the chat look broken. The
            // analysis-landed watcher fires the panel open when the
            // report arrives. If analysis is already cached (returning
            // user with completed analysis), open immediately.
            setActiveView("resume-builder");
            if (ra) setOpenReportSignal((n) => n + 1);
            setOnboardingCompleted(true);
          }}
          onSignIn={() => setShowAuthModal(true)}
        />
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      </>
    );
  }

  // ── Main app ──────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#fafaf7] text-gray-900 overflow-hidden">
      {/* Always-mounted hidden file input for the in-chat "Upload a
          new one" flow (resume-review source chooser). Independent of
          the Home-view homeFileInputRef which only exists while that
          view is mounted. */}
      <input
        ref={chatUploadInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setResumeFileUrl(URL.createObjectURL(file));
          parseFile(file)
            .then((result) => {
              if (result.html) setResumeDocHtml(result.html);
              handleResumeUpload(result.text, file.name);
              // After upload completes, hand off to the review flow.
              setChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Got it — using **${file.name}**. Running the review now.`, timestamp: now() },
              ]);
              sendMessage("Proceed with the resume review.");
            })
            .catch(() => {});
          e.target.value = "";
        }}
      />
      {/* Desktop sidebar */}
      <aside
        className="flex-shrink-0 bg-gray-50 flex-col hidden md:flex transition-all duration-200 relative overflow-visible"
        style={{ width: isSidebarExpanded ? "224px" : "52px" }}
      >
        <SidebarContent expanded={isSidebarExpanded} />
      </aside>

      {/* Mobile sidebar overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-gray-50 border-r border-gray-200 flex flex-col z-10 overflow-y-auto">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-900 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent expanded={true} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors mr-1"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="text-sm font-medium text-gray-500">
            {/* Header title intentionally blank. Chat-as-chassis principle:
                no top-level "Resume Builder" label, because Resume Builder
                is not a separate destination — it's the workspace pane
                inside the same chat. */}
            {""}
          </div>

          <div className="flex items-center gap-2">
            {activeMode && activeView === "chat" && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full border text-gray-800 bg-white border-gray-200">
                {MODE_LABELS[activeMode] ?? activeMode}
              </span>
            )}
            {/* Account avatar removed from header — moved into the
                sidebar (below the logo) per the chat-as-chassis layout. */}
          </div>
        </header>

        {/* Content */}
        {activeView === "chat" ? (
          /* Chat view — horizontal flex so the artifact preview pane
             can sit on the right when an artifact card is opened. */
          <div className="flex flex-1 min-h-0">
            <div className="flex flex-col flex-1 min-h-0">
            {chatMessages.length === 0 && !isLoading ? (
              /* Empty state — Claude/ChatGPT-style. Greeting + input
                 stacked together, vertically centered in the viewport.
                 No second input at the bottom; the input lives here
                 with the greeting until the first message lands. */
              <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-12">
                <div className="w-full max-w-2xl flex flex-col items-center">
{/* Greeting with sparkle. The sparkle softens the tone
                      and gives the line a focal point (Claude does the
                      same thing with a small star glyph). */}
                  <h1 className="text-[28px] md:text-[32px] font-medium text-gray-900 tracking-tight mb-8 inline-flex items-center gap-2.5 self-center">
                    <Sparkles className="w-6 h-6 text-amber-500 flex-shrink-0" strokeWidth={1.75} aria-hidden />
                    <span>{pickHeroGreeting({ chatId: activeChatId, firstName: profileFirstName ?? resumeExtraction?.name?.split(" ")[0] ?? null })}</span>
                  </h1>
                  <div className="w-full">
                    <ChatInput
                      value={chatInput}
                      onChange={setChatInput}
                      onSend={() => sendMessage(chatInput)}
                      onFileUpload={handleResumeUpload}
                      disabled={isLoading}
                      busy={isLoading}
                      onStop={() => {
                        agentAbortRef.current?.abort();
                        agentAbortRef.current = null;
                        setIsLoading(false);
                      }}
                      placeholder={resumeExtraction ? "Ask anything about your resume..." : "Ask anything about your career..."}
                    />
                  </div>
                  {/* Quick-start chips — each fires a chat message so the
                      orchestrator picks up the intent and routes. No
                      pre-baked view switches; the brain decides what
                      surface to open based on context. */}
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {[
                      // Review my resume short-circuits to the source
                      // chooser instead of going straight to orchestrator,
                      // so the user explicitly confirms which file to review.
                      { label: "Review my resume", icon: FileText,       action: () => promptResumeSourceChoice() },
                      { label: "Tailor for a JD",  icon: Target,         action: () => sendMessage("I want to tailor my resume for a specific job description.") },
                      { label: "Interview prep",   icon: MessagesSquare, action: () => sendMessage("I'd like to prep for an interview.") },
                      { label: "Foundations",      icon: BookOpen,       action: () => sendMessage("I want to learn data-engineering fundamentals.") },
                    ].map(({ label, icon: Icon, action }) => (
                      <button
                        key={label}
                        onClick={action}
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-full px-3 py-1.5 transition-all shadow-sm hover:shadow"
                      >
                        <Icon className="w-3.5 h-3.5 text-gray-500" strokeWidth={1.75} />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Recent chats strip — only when there's history. The
                      sidebar already lists everything; this gives a quick
                      jump-back affordance in the empty hero. */}
                  {(() => {
                    const recents = chatList
                      .filter((c) => c.id !== activeChatId)
                      .filter((c) => (c.messages ?? []).some((m) => m.role === "user" && !m.content.startsWith("__")))
                      .slice(0, 3);
                    if (recents.length === 0) return null;
                    return (
                      <div className="w-full mt-10">
                        <p className="text-[11px] uppercase tracking-[0.1em] text-gray-400 text-center mb-3">Recently</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {recents.map((chat) => {
                            const firstUserMsg = (chat.messages ?? []).find(
                              (m) => m.role === "user" && !m.content.startsWith("__"),
                            );
                            const preview = firstUserMsg?.content.slice(0, 60) ?? chat.title ?? "Untitled chat";
                            return (
                              <button
                                key={chat.id}
                                type="button"
                                onClick={() => handleSwitchChat(chat.id)}
                                className="text-left bg-white border border-gray-200 hover:border-gray-300 rounded-xl px-3 py-2.5 transition-colors"
                              >
                                <p className="text-[13px] text-gray-900 line-clamp-2 leading-snug">{preview}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              // Phase B of chat-as-chassis: main chat view now renders
              // <ChatSurface/> instead of inline ChatWindow + ChatInput.
              // Behavior unchanged — every prop that was on the inline
              // pair is forwarded to ChatSurface, which composes them
              // back together internally.
              <ChatSurface
                className="flex-1 min-h-0"
                messages={chatMessages}
                isLoading={isLoading}
                resumeAnalysis={null}
                marketAnalysis={null}
                resumePreview={null}
                resumeExtraction={null}
                interviewPrepPlan={null}
                onSend={sendMessage}
                resumeText={resumeText}
                onApplyInBuilder={(instruction) => {
                  if (!resumeExtraction) {
                    alert("Upload your resume first so I can apply this rewrite.");
                    return;
                  }
                  setPendingBuilderInstruction(instruction);
                  setActiveView("resume-builder");
                }}
                onEditUserMessage={handleEditUserMessage}
                onRetryAssistant={handleRetryAssistant}
                onOpenArtifact={(artifact: Artifact) => {
                  if (artifact.kind === "resume_review") {
                    setActiveView("resume-builder");
                    setOpenReportSignal((n) => n + 1);
                  } else if (artifact.kind === "tailored_resume") {
                    // Route the recreated resume into Resume Builder so
                    // the user can view + download it. The tailored
                    // extraction was stashed in recreatedResumeCacheRef
                    // when the agent returned.
                    const tailored = recreatedResumeCacheRef.current.get(artifact.id);
                    if (tailored) {
                      setResumeExtraction(tailored);
                      setActiveView("resume-builder");
                    }
                  } else if (artifact.kind === "cover_letter") {
                    // Open the right-side preview pane. Letter content
                    // is in coverLetterCacheRef; the pane reads from
                    // openArtifactContent below.
                    setOpenArtifact(artifact);
                  }
                }}
                onDownloadArtifactFormat={async (format, artifact) => {
                  // Cover letter: pull from cache + use artifactExport.
                  if (artifact.kind === "cover_letter") {
                    const letter = coverLetterCacheRef.current.get(artifact.id);
                    if (!letter) return;
                    // Pull company name from the artifact title prefix
                    // ("Cover letter — {Company}"). Best-effort.
                    const titleMatch = artifact.title.match(/Cover letter\s*—\s*(.+)$/i);
                    const company = titleMatch ? titleMatch[1].trim() : null;
                    const { downloadCoverLetter } = await import("@/lib/artifactExport");
                    await downloadCoverLetter({ letter, company, format });
                  }
                  // Other artifact kinds get their download handlers
                  // in subsequent commits.
                }}
                  onChatEditPrompt={(prompt) => {
                    const t = prompt.trim().toLowerCase();

                    // Resume-review entry points — intercept BEFORE the
                    // orchestrator so the user explicitly confirms which
                    // resume to act on.
                    if (
                      t === "review my resume" ||
                      t === "can you review my resume?" ||
                      t === "resume review" ||
                      t === "fix my resume"
                    ) {
                      promptResumeSourceChoice();
                      return;
                    }

                    // Chooser responses
                    if (t.startsWith("use current")) {
                      setPendingResumeReviewSource(false);
                      // Fix #3 — don't go through sendMessage / synthesis
                      // here. That path made the agent ask "what kind of
                      // review?" again even though the user already
                      // committed to "Review my resume" + picked a file.
                      // The chat-mode analyzer kickoff effect (deps:
                      // activeView, resumeExtraction, resumeText,
                      // !resumeAnalysis) auto-fires the analyzer with a
                      // Full Review default; the analysis-landed watcher
                      // then pushes the artifact card. We just announce
                      // what's happening so the user has acknowledgment.
                      if (resumeAnalysis) {
                        // Analysis already exists (returning user with
                        // pre-warmed analyzer). Show a quick artifact
                        // pointer rather than re-running. Idempotency:
                        // if the same "Already have a review" message
                        // is already the last assistant push, skip.
                        setChatMessages((prev) => {
                          const last = prev[prev.length - 1];
                          if (last?.content?.startsWith("Already have a review")) return prev;
                          return [
                            ...prev,
                            {
                              role: "assistant",
                              content: `Already have a review for ${resumeFilename ?? "your resume"}. Pulling it up.`,
                              timestamp: now(),
                              artifact: buildResumeReviewArtifact({
                                id: `resume-review-existing-${activeChatId ?? "local"}-${Date.now()}`,
                                candidateName: resumeExtraction?.name,
                                targetRole: resumeAnalysis.likelyTargetRole ?? chosenTargetRole ?? null,
                                score: deriveScoreFromAnalysis(resumeAnalysis),
                              }),
                            },
                          ];
                        });
                      } else {
                        // Same idempotency check — never push a duplicate
                        // "Got it — running a Full Review" line if the
                        // handler somehow runs twice.
                        setChatMessages((prev) => {
                          const last = prev[prev.length - 1];
                          if (last?.content?.startsWith("Got it — running a Full Review")) return prev;
                          return [
                            ...prev,
                            {
                              role: "assistant",
                              content: `Got it — running a Full Review on ${resumeFilename ?? "your resume"}.`,
                              timestamp: now(),
                            },
                          ];
                        });
                        // Mark orchFocus so the analysis-landed watcher
                        // (which gates on it in RB; benign in chat) sees
                        // explicit review intent.
                        orchFocusRef.current = "resume";
                      }
                      return;
                    }
                    if (t === "upload a new one") {
                      setPendingResumeReviewSource(false);
                      chatUploadInputRef.current?.click();
                      return;
                    }
                    if (t === "pick from drive") {
                      expandDrivePicker();
                      return;
                    }
                    if (t.startsWith("use saved · ")) {
                      const displayName = prompt.slice("Use saved · ".length).trim();
                      const file = driveResumesForPickerRef.current.find(
                        (f) => f.display_name === displayName,
                      );
                      if (file?.extraction_json) {
                        setResumeExtraction(file.extraction_json);
                        setResumeFilename(file.display_name);
                        if (file.analysis_json) setResumeAnalysis(file.analysis_json);
                        setPendingResumeReviewSource(false);
                        // Fix #3 — same as the "use current" path: skip
                        // the synthesis round-trip that re-asks "what
                        // kind of review?". The kickoff effect handles
                        // the analyzer when no analysis exists; if one
                        // was attached to the Drive file we just show it.
                        if (file.analysis_json) {
                          const ext = file.extraction_json;
                          const ana = file.analysis_json;
                          setChatMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `Loaded **${file.display_name}**. Pulling up the review.`,
                              timestamp: now(),
                              artifact: buildResumeReviewArtifact({
                                id: `resume-review-saved-${file.id}-${Date.now()}`,
                                candidateName: ext?.name,
                                targetRole: ana.likelyTargetRole ?? null,
                                score: deriveScoreFromAnalysis(ana),
                              }),
                            },
                          ]);
                        } else {
                          setChatMessages((prev) => [
                            ...prev,
                            {
                              role: "assistant",
                              content: `Loaded **${file.display_name}**. Running a Full Review.`,
                              timestamp: now(),
                            },
                          ]);
                          orchFocusRef.current = "resume";
                        }
                      }
                      return;
                    }
                    if (t === "cancel resume pick") {
                      setPendingResumeReviewSource(false);
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "No worries — what would you like to do instead?", timestamp: now() },
                      ]);
                      return;
                    }

                    // ── Recreate-resume chips ────────────────────────
                    // "Recreate with all Fixes" — runs the full Opus
                    // rewriter using the report's priorities, pushes a
                    // pending Tailored-Resume artifact card, swaps in
                    // the real one when done. No right-pane required;
                    // the artifact card lives in chat permanently.
                    if (t === "recreate with all fixes") {
                      if (!resumeExtraction || !resumeAnalysis) {
                        setChatMessages((prev) => [
                          ...prev,
                          { role: "assistant", content: "I need the resume + report loaded to recreate. Try 'Review my resume' first.", timestamp: now() },
                        ]);
                        return;
                      }
                      const pendingId = `recreated-resume-pending-${activeChatId ?? "local"}-${Date.now()}`;
                      const pending = buildTailoredResumeArtifact({
                        id: pendingId,
                        company: null,
                        role: resumeAnalysis.likelyTargetRole ?? null,
                      });
                      pending.title = "Recreating your resume — applying all fixes";
                      pending.subtitle = "Opus rewrites take ~60-90s. New artifact lands here.";
                      pending.pending = true;
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "On it. Recreating now.", timestamp: now(), artifact: pending },
                      ]);
                      (async () => {
                        try {
                          const res = await fetch("/api/agents/resume/rewrite-all", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              extraction: resumeExtraction,
                              analysis: resumeAnalysis,
                              targetRole: resumeAnalysis.likelyTargetRole ?? "your target role",
                            }),
                          });
                          if (!res.ok) {
                            const body = await res.json().catch(() => ({}));
                            throw new Error(body?.error || `HTTP ${res.status}`);
                          }
                          const data = await res.json() as { extraction: ResumeExtraction; changedKeys: string[]; qualityWarnings?: string[] };
                          const unchanged = (data.qualityWarnings ?? []).some((w) => w.toLowerCase().includes("identical to input"));
                          if (unchanged) {
                            throw new Error("Rewriter returned the same resume — try again with a JD.");
                          }
                          const realId = `recreated-resume-${activeChatId ?? "local"}-${Date.now()}`;
                          const real = buildTailoredResumeArtifact({
                            id: realId,
                            company: null,
                            role: resumeAnalysis.likelyTargetRole ?? null,
                          });
                          real.title = "Recreated resume — all fixes applied";
                          real.subtitle = `${data.changedKeys.length} section${data.changedKeys.length === 1 ? "" : "s"} rewritten`;
                          recreatedResumeCacheRef.current.set(realId, data.extraction);
                          setChatMessages((prev) =>
                            prev.map((m) =>
                              m.artifact?.id === pendingId
                                ? { role: "assistant" as const, content: "Done. Click the card to view the recreated resume.", timestamp: now(), artifact: real }
                                : m,
                            ),
                          );
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Unknown error";
                          setChatMessages((prev) =>
                            prev.map((m) =>
                              m.artifact?.id === pendingId
                                ? { role: "assistant" as const, content: `Recreate failed — ${msg}. Try again?`, timestamp: now() }
                                : m,
                            ),
                          );
                        }
                      })();
                      return;
                    }

                    // "Recreate with JD" — set the intake flag and ask
                    // for the JD. Next user message becomes the JD,
                    // intercepted in sendMessage's pendingJDForRecreate
                    // branch (see below).
                    if (t === "recreate with jd") {
                      if (!resumeExtraction) {
                        setChatMessages((prev) => [
                          ...prev,
                          { role: "assistant", content: "Upload your resume first so I can tailor it.", timestamp: now() },
                        ]);
                        return;
                      }
                      setPendingJDForRecreate(true);
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "Paste the JD text (or the URL) and I'll tailor your resume to it.", timestamp: now() },
                      ]);
                      return;
                    }

                    // ── Dynamic intent chips (intent router output) ──
                    // The intent classifier emits these labels via the
                    // INTENT_REGISTRY. Each handler kicks off the right
                    // generator and produces an artifact card. Skill
                    // hint pulled from intentContextRef.

                    // Interview category — three options.
                    if (t === "interview drill") {
                      const skill = intentContextRef.current?.detectedSkill;
                      intentContextRef.current = null;
                      // Persist the skill so InterviewView's welcome can
                      // pre-pick it (the welcome reads pickedSkill from
                      // localStorage).
                      if (skill && typeof window !== "undefined") {
                        try { localStorage.setItem("stackle_interview_picked_skill", skill); } catch {}
                      }
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: skill ? `Opening Interview Prep for ${skill}.` : "Opening Interview Prep.", timestamp: now() },
                      ]);
                      setTimeout(() => setActiveView("interview"), 150);
                      return;
                    }

                    if (t === "quick question set") {
                      const skill = intentContextRef.current?.detectedSkill ?? "general";
                      intentContextRef.current = null;
                      const pendingId = `quick-questions-pending-${Date.now()}`;
                      const pending = buildQuickQuestionsArtifact({ id: pendingId, skill, count: 3 });
                      pending.title = `Generating 3 ${skill} questions…`;
                      pending.pending = true;
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "On it.", timestamp: now(), artifact: pending },
                      ]);
                      (async () => {
                        try {
                          const res = await fetch("/api/agents/interview/generate-questions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ skill, difficulty: "medium", count: 3 }),
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const data = await res.json() as { questions: Array<{ prompt: string; subcategory: string }> };
                          const real = buildQuickQuestionsArtifact({ id: `quick-questions-${Date.now()}`, skill, count: data.questions.length });
                          const preview = data.questions.map((q, i) => `${i + 1}. ${q.prompt}`).join("\n\n");
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: preview, timestamp: now(), artifact: real }
                              : m
                          ));
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Unknown error";
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: `Couldn't generate — ${msg}.`, timestamp: now() }
                              : m
                          ));
                        }
                      })();
                      return;
                    }

                    if (t === "skill assessment") {
                      const skill = intentContextRef.current?.detectedSkill ?? "general";
                      intentContextRef.current = null;
                      const pendingId = `skill-assessment-pending-${Date.now()}`;
                      const pending = buildSkillAssessmentArtifact({ id: pendingId, skill, questionCount: 0 });
                      pending.title = `Building ${skill} skill assessment…`;
                      pending.pending = true;
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "On it. 5–7 questions, single scored verdict at the end.", timestamp: now(), artifact: pending },
                      ]);
                      (async () => {
                        try {
                          const res = await fetch("/api/agents/interview/generate-questions", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ skill, difficulty: "mixed", count: 6 }),
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const data = await res.json() as { questions: Array<{ prompt: string }> };
                          const real = buildSkillAssessmentArtifact({ id: `skill-assessment-${Date.now()}`, skill, questionCount: data.questions.length });
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: `${data.questions.length} ${skill} questions ready. Tap the card to start the assessment.`, timestamp: now(), artifact: real }
                              : m
                          ));
                          // Stash the questions so the future assessment
                          // surface can read them. Reuse the cover-letter
                          // cache pattern (string for now — full handler
                          // will be a new surface).
                          coverLetterCacheRef.current.set(real.id, JSON.stringify(data.questions));
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Unknown error";
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: `Couldn't generate — ${msg}.`, timestamp: now() }
                              : m
                          ));
                        }
                      })();
                      return;
                    }

                    // Resume category — only "tailor to a jd" and
                    // "quick polish" are new here. "Recreate with all
                    // Fixes" is handled by the earlier branch above.
                    if (t === "tailor to a jd") {
                      // Reuse the existing JD-intake pattern.
                      intentContextRef.current = null;
                      if (!resumeExtraction) {
                        setChatMessages((prev) => [
                          ...prev,
                          { role: "assistant", content: "Upload your resume first so I can tailor it.", timestamp: now() },
                        ]);
                        return;
                      }
                      setPendingJDForRecreate(true);
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "Paste the JD text (or URL) and I'll tailor your resume to it.", timestamp: now() },
                      ]);
                      return;
                    }

                    if (t === "quick polish") {
                      intentContextRef.current = null;
                      if (!resumeExtraction || !resumeAnalysis) {
                        setChatMessages((prev) => [
                          ...prev,
                          { role: "assistant", content: "I need your resume + report loaded. Try 'Review my resume' first.", timestamp: now() },
                        ]);
                        return;
                      }
                      // Quick polish = run the rewriter with a tighter
                      // styleHint so it edits without restructuring.
                      const pendingId = `quick-polish-pending-${Date.now()}`;
                      const pending = buildTailoredResumeArtifact({ id: pendingId, company: null, role: resumeAnalysis.likelyTargetRole ?? null });
                      pending.title = "Quick polish in progress…";
                      pending.subtitle = "Tightening language, no restructure.";
                      pending.pending = true;
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "On it. Light pass — keeping your structure.", timestamp: now(), artifact: pending },
                      ]);
                      (async () => {
                        try {
                          const res = await fetch("/api/agents/resume/rewrite-all", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              extraction: resumeExtraction,
                              analysis: resumeAnalysis,
                              targetRole: resumeAnalysis.likelyTargetRole ?? "your target role",
                              styleHint: "Tighten language; do NOT restructure or remove sections. Polish only.",
                            }),
                          });
                          if (!res.ok) {
                            const body = await res.json().catch(() => ({}));
                            throw new Error(body?.error || `HTTP ${res.status}`);
                          }
                          const data = await res.json() as { extraction: ResumeExtraction; changedKeys: string[]; qualityWarnings?: string[] };
                          const realId = `quick-polish-${Date.now()}`;
                          const real = buildTailoredResumeArtifact({ id: realId, company: null, role: resumeAnalysis.likelyTargetRole ?? null });
                          real.title = "Quick-polished resume";
                          real.subtitle = `${data.changedKeys.length} section${data.changedKeys.length === 1 ? "" : "s"} tightened`;
                          recreatedResumeCacheRef.current.set(realId, data.extraction);
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: "Done. Tap the card to view.", timestamp: now(), artifact: real }
                              : m
                          ));
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Unknown error";
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: `Polish failed — ${msg}. Try again?`, timestamp: now() }
                              : m
                          ));
                        }
                      })();
                      return;
                    }

                    // Cover letter category.
                    if (t === "for a specific jd") {
                      intentContextRef.current = null;
                      setPendingCoverLetterIntake("jd");
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "Paste the JD text (or URL) and I'll write a matched cover letter.", timestamp: now() },
                      ]);
                      return;
                    }

                    if (t === "for a company") {
                      intentContextRef.current = null;
                      setPendingCoverLetterIntake("company");
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "Which company? Just the name — I'll match the rest from your resume.", timestamp: now() },
                      ]);
                      return;
                    }

                    if (t === "generic strong one") {
                      intentContextRef.current = null;
                      if (!resumeExtraction) {
                        setChatMessages((prev) => [
                          ...prev,
                          { role: "assistant", content: "Upload your resume first — I need it to ground the letter.", timestamp: now() },
                        ]);
                        return;
                      }
                      const pendingId = `cover-letter-pending-${Date.now()}`;
                      const pending = buildCoverLetterArtifact({ id: pendingId, company: null, role: resumeExtraction.experience?.[0]?.title ?? null });
                      pending.title = "Drafting generic cover letter…";
                      pending.pending = true;
                      setChatMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "On it.", timestamp: now(), artifact: pending },
                      ]);
                      (async () => {
                        try {
                          const res = await fetch("/api/agents/cover-letter", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              extraction: resumeExtraction,
                              targetRole: resumeExtraction.experience?.[0]?.title ?? "Senior role",
                              companyName: "",
                              jobDescription: "",
                            }),
                          });
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          const data = await res.json() as { coverLetter?: string; text?: string };
                          const letter = data.coverLetter ?? data.text ?? "";
                          const realId = `cover-letter-${Date.now()}`;
                          const real = buildCoverLetterArtifact({ id: realId, company: null, role: resumeExtraction.experience?.[0]?.title ?? null });
                          coverLetterCacheRef.current.set(realId, letter);
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: "Done. Tap the card to read.", timestamp: now(), artifact: real }
                              : m
                          ));
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : "Unknown error";
                          setChatMessages((prev) => prev.map((m) =>
                            m.artifact?.id === pendingId
                              ? { role: "assistant" as const, content: `Couldn't draft — ${msg}.`, timestamp: now() }
                              : m
                          ));
                        }
                      })();
                      return;
                    }

                  // All other chips → orchestrator decides.
                  sendMessage(prompt);
                }}
                inputValue={chatInput}
                onInputChange={setChatInput}
                onInputSend={() => sendMessage(chatInput)}
                onFileUpload={handleResumeUpload}
                inputDisabled={isLoading}
                inputBusy={isLoading}
                onInputStop={() => {
                  agentAbortRef.current?.abort();
                  agentAbortRef.current = null;
                  setIsLoading(false);
                }}
                inputPlaceholder={resumeExtraction ? "Ask anything about your resume..." : "Ask anything about your career..."}
              />
            )}
            </div>
            {/* Right-side artifact preview pane. Renders only when an
                artifact card has been clicked. Closes via X or ESC. */}
            <ArtifactPreviewPane
              artifact={openArtifact}
              content={
                openArtifact?.kind === "cover_letter"
                  ? (coverLetterCacheRef.current.get(openArtifact.id) ?? null)
                  : null
              }
              onClose={() => setOpenArtifact(null)}
              onDownload={async (format, artifact) => {
                if (artifact.kind === "cover_letter") {
                  const letter = coverLetterCacheRef.current.get(artifact.id);
                  if (!letter) return;
                  const titleMatch = artifact.title.match(/Cover letter\s*—\s*(.+)$/i);
                  const company = titleMatch ? titleMatch[1].trim() : null;
                  const { downloadCoverLetter } = await import("@/lib/artifactExport");
                  await downloadCoverLetter({ letter, company, format });
                }
              }}
              onOpenInWorkspace={(artifact) => {
                if (artifact.kind === "resume_review") {
                  setOpenArtifact(null);
                  setActiveView("resume-builder");
                  setOpenReportSignal((n) => n + 1);
                } else if (artifact.kind === "tailored_resume") {
                  const tailored = recreatedResumeCacheRef.current.get(artifact.id);
                  if (tailored) {
                    setResumeExtraction(tailored);
                    setOpenArtifact(null);
                    setActiveView("resume-builder");
                  }
                }
              }}
            />
          </div>
        ) : activeView === "interview" ? (
          // Interview Prep is its OWN dedicated chat surface — no main-chat overlay.
          // The Skill Agent conversation IS the chat. Shared memory = resume only.
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <InterviewView
              candidateName={resumeExtraction?.name ?? null}
              resumeFilename={resumeFilename ?? null}
              resumeSkills={(resumeExtraction?.skillGroups ?? []).flatMap((g) => g.skills ?? [])}
              resumeContext={
                resumeExtraction
                  ? {
                      topRole: resumeExtraction.experience?.[0]?.title ?? null,
                      topCompany: resumeExtraction.experience?.[0]?.company ?? null,
                      yearsExperience: resumeExtraction.totalYearsExperience ?? null,
                      experiences: (resumeExtraction.experience ?? []).slice(0, 5).map((e) => ({
                        title: e.title,
                        company: e.company,
                        bullets: (e.bullets ?? []).slice(0, 3),
                      })),
                      topSkills: (resumeExtraction.skillGroups ?? []).flatMap((g) => g.skills ?? []).slice(0, 12),
                    }
                  : null
              }
            />
          </div>
        ) : activeView === "learn" ? (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <LearnView />
          </div>
        ) : activeView === "job-match" ? (
          // Job Match — dedicated chat surface for paste-a-JD → 4 pills.
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <JobMatchView
              resumeExtraction={resumeExtraction}
              resumeFilename={resumeFilename}
              resumeAnalysis={resumeAnalysis}
              onOpenTailoredResume={(tailored) => {
                // Route to Resume Builder with the tailored extraction
                // queued. ResumeBuilder reads editedExtraction or the
                // resumeExtraction prop; we just swap the working
                // resumeExtraction so the user sees the rewrite when
                // RB opens.
                setResumeExtraction(tailored);
                setActiveView("resume-builder");
              }}
              onOpenJDInterviewPrep={() => {
                // For now: just switch to the Interview Prep surface.
                // Preloading the JD-tailored question set directly into
                // ActiveSession needs InterviewView to accept a
                // preloadedQuestions prop — Phase 5 polish.
                setActiveView("interview");
              }}
            />
          </div>
        ) : activeView === "drive" ? (
          /* Drive view — chat-as-chassis: persistent chat on left,
              file browser on right. Same toggle pattern as Interview
              and Foundations. */
          <div className="flex flex-1 min-h-0 relative overflow-hidden">
            <AppChatPanel
              isOpen={appChatPanelOpen}
              onClose={() => setAppChatPanelOpen(false)}
              messages={chatMessages}
              isLoading={isLoading}
              chatInput={chatInput}
              onChatInputChange={setChatInput}
              onSend={(text) => sendMessage(text)}
              onStop={() => {
                agentAbortRef.current?.abort();
                agentAbortRef.current = null;
                setIsLoading(false);
              }}
              onChatEditPrompt={(prompt) => sendMessage(prompt)}
              onEditUserMessage={handleEditUserMessage}
              onRetryAssistant={handleRetryAssistant}
              onFileUpload={handleResumeUpload}
              resumeText={resumeText}
              resumeExtraction={resumeExtraction}
            />
            <div className="flex-1 overflow-y-auto bg-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4">
              <div className="max-w-3xl mx-auto flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">My Drive</h2>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {driveLoading ? "Loading…" : `${driveFiles.length} file${driveFiles.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-600">
                  <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {driveFiles.filter(f => f.file_type !== "report").length} resumes</span>
                  <span className="text-gray-700">·</span>
                  <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> {driveFiles.filter(f => f.file_type === "report").length} reports</span>
                </div>
              </div>
            </div>

            <div className="max-w-3xl mx-auto px-6 py-5">
              {driveLoading ? (
                /* Loading skeleton */
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 animate-pulse">
                      <div className="w-9 h-9 rounded-lg bg-white flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-white rounded w-48" />
                        <div className="h-2 bg-gray-100 rounded w-28" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : driveFiles.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center">
                    <FolderOpen className="w-7 h-7 text-gray-700" strokeWidth={1.25} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-500">No files yet</p>
                    <p className="text-xs text-gray-600 mt-1">Upload a resume to get started</p>
                  </div>
                  <button
                    onClick={() => setActiveView("resume-builder")}
                    className="mt-2 text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors"
                  >
                    Go to Resume Builder
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-3 px-4 pb-1 border-b border-gray-200">
                    <span className="text-[10px] uppercase tracking-wider text-gray-700 font-medium">Name</span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-700 font-medium">Candidate</span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-700 font-medium">Modified</span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-700 font-medium">Type</span>
                    <span className="text-[10px] uppercase tracking-wider text-gray-700 font-medium text-right">Actions</span>
                  </div>

                  {/* Resumes section */}
                  {driveFiles.some(f => f.file_type !== "report") && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-700 font-medium mb-2 flex items-center gap-1.5 px-1">
                        <FolderOpen className="w-3 h-3" /> Resumes
                      </p>
                      <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-[#161616]">
                        {driveFiles.filter(f => f.file_type !== "report").map(f => {
                          const typeColors: Record<string, string> = {
                            original: "text-gray-500 border-gray-200",
                            working_copy: "text-purple-400 border-purple-400/20",
                            version: "text-[#4fc9a4] border-[#4fc9a4]/20",
                          };
                          const typeLabel: Record<string, string> = {
                            original: "Original",
                            working_copy: "Editing",
                            version: `v${f.version_number ?? 1}`,
                          };
                          return (
                            <div key={f.id} className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-3 items-center px-4 py-3 bg-gray-50 hover:bg-gray-50 transition-colors group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-4 h-4 text-gray-500" strokeWidth={1.5} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm text-gray-900 truncate">{f.display_name.replace(/_/g, " ")}</p>
                                  {f.target_role && <p className="text-[11px] text-gray-600 truncate">{f.target_role}</p>}
                                </div>
                              </div>
                              <span className="text-xs text-gray-500 truncate">{f.candidate_name ?? "—"}</span>
                              <span className="text-xs text-gray-600">{new Date(f.updated_at || f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                              <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 w-fit ${typeColors[f.file_type] ?? "text-gray-600 border-gray-200"}`}>
                                {typeLabel[f.file_type] ?? f.file_type}
                              </span>
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleDriveDownload(f)}
                                  disabled={driveDownloadingId === f.id || !f.extraction_json}
                                  title={driveDownloadingId === f.id ? "Exporting…" : "Download as PDF"}
                                  aria-label="Download as PDF"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Download className={`w-3.5 h-3.5 ${driveDownloadingId === f.id ? "animate-pulse" : ""}`} strokeWidth={1.75} />
                                </button>
                                <button
                                  onClick={() => handleDriveShare(f)}
                                  disabled={!f.extraction_json}
                                  title={driveCopiedId === f.id ? "Link copied" : "Copy share link"}
                                  aria-label="Copy share link"
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  {driveCopiedId === f.id
                                    ? <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.25} />
                                    : <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Reports section */}
                  {driveFiles.some(f => f.file_type === "report") && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gray-700 font-medium mb-2 flex items-center gap-1.5 px-1">
                        <ClipboardList className="w-3 h-3" /> Reports
                      </p>
                      <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-[#161616]">
                        {driveFiles.filter(f => f.file_type === "report").map(f => {
                          const score = f.analysis_json?.scores?.total;
                          return (
                            <div key={f.id} className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-3 items-center px-4 py-3 bg-gray-50 hover:bg-gray-50 transition-colors group">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center flex-shrink-0">
                                  <ClipboardList className="w-4 h-4 text-violet-600" strokeWidth={1.5} />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm text-gray-900 truncate">{f.display_name.replace(/_/g, " ")}</p>
                                  {score != null && (
                                    <p className="text-[11px] text-gray-600">Score: <span className="text-emerald-600 font-medium">{score}{"/100"}</span></p>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs text-gray-500 truncate">{f.candidate_name ?? "—"}</span>
                              <span className="text-xs text-gray-600">{new Date(f.updated_at || f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                              <span className="text-[10px] font-medium border rounded px-1.5 py-0.5 w-fit text-[#7c7cff] border-[#7c7cff]/20">Report</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
            {!appChatPanelOpen && (
              <button
                onClick={() => setAppChatPanelOpen(true)}
                title="Open chat"
                className="absolute bottom-5 left-5 z-10 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-gray-900 text-white text-[13px] font-medium hover:bg-black shadow-lg transition-colors"
              >
                <MessagesSquare className="w-3.5 h-3.5" strokeWidth={2} />
                Open chat
              </button>
            )}
          </div>
        ) : resumeText || chatMessages.length > 0 ? (
          /* Resume uploaded — show split view */
          <ResumeBuilder
            resumeText={resumeText}
            resumeFilename={resumeFilename}
            resumeExtraction={resumeExtraction}
            resumeAnalysis={resumeAnalysis}
            messages={chatMessages}
            isLoading={isLoading}
            isAnalyzingResume={isAnalyzingResume}
            input={resumeInput}
            onInputChange={setResumeInput}
            onSend={() => sendMessage(resumeInput)}
            onSendMessage={sendMessage}
            onStopAgent={() => {
              agentAbortRef.current?.abort();
              agentAbortRef.current = null;
              setIsLoading(false);
            }}
            pendingInstruction={pendingBuilderInstruction}
            onPendingInstructionConsumed={() => setPendingBuilderInstruction(null)}
            pendingChatTool={pendingChatTool}
            onChatToolConsumed={() => setPendingChatTool(null)}
            onApplyAcceptedFix={(sectionKey, priorityIndex) => {
              setConversationState((s) => ({
                ...s,
                acceptedFixes: s.acceptedFixes.includes(sectionKey) ? s.acceptedFixes : [...s.acceptedFixes, sectionKey],
                acceptedPriorityIndices: priorityIndex >= 0 && !s.acceptedPriorityIndices.includes(priorityIndex)
                  ? [...s.acceptedPriorityIndices, priorityIndex]
                  : s.acceptedPriorityIndices,
              }));
            }}
            onRejectFixSignal={(sectionKey) => {
              setConversationState((s) => ({
                ...s,
                rejectedFixes: s.rejectedFixes.includes(sectionKey) ? s.rejectedFixes : [...s.rejectedFixes, sectionKey],
              }));
            }}
            onEditUserMessage={handleEditUserMessage}
            onPushAssistantMessage={(text) => {
              const ts = now();
              setChatMessages((prev) => {
                // De-dupe: bail if any recent assistant message has the same
                // content OR a near-identical opener. The exact-match check
                // catches obvious doubles; the prefix check catches LLM
                // re-runs that produced slightly-rephrased duplicates (e.g.
                // skills-gap firing twice with mildly different wording).
                const trimmed = text.trim();
                const head = trimmed.slice(0, 60).toLowerCase();
                const dupe = prev.some((m) => {
                  if (m.role !== "assistant") return false;
                  const a = m.content.trim();
                  if (a === trimmed) return true;
                  // Prefix match — same opener almost certainly = same intent
                  return head.length >= 30 && a.slice(0, 60).toLowerCase() === head;
                });
                if (dupe) return prev;
                return [...prev, { role: "assistant", content: text, timestamp: ts }];
              });
            }}
            onFileUpload={handleResumeUpload}
            onUpdateExtraction={(updated) => {
              setResumeExtraction(updated);
              const id = activeChatId;
              if (id) {
                persistChat(id, chatMessages, "resume_builder", {
                  resumeText,
                  resumeFilename,
                  resumeExtraction: updated,
                  resumeAnalysis,
                });
              }
            }}
            chatId={activeChatId ?? "local-chat"}
            originalDriveFileId={originalDriveFileId}
            resumeFileUrl={resumeFileUrl}
            resumeDocHtml={resumeDocHtml}
            openReportSignal={openReportSignal}
            onDriveUpdate={(files) => {
              setDriveFiles(files);
              const orig = files.find((f) => f.file_type === "original");
              if (orig && !originalDriveFileId) setOriginalDriveFileId(orig.id);
            }}
          />
        ) : (
          /* Landing — no resume yet */
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 bg-white">
            <div className="flex flex-col items-center gap-2 mb-10">
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight text-center">
                Get your resume<br />reviewed.
              </h1>
              <p className="text-base text-gray-500 text-center">
                Upload your resume and get a full breakdown for data & AI roles.
              </p>
            </div>

            {/* Upload button */}
            <button
              onClick={() => homeFileInputRef.current?.click()}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold text-white mb-6 hover:opacity-90 active:scale-95 transition-all"
              style={{ background: "#000" }}
            >
              <Upload className="w-4 h-4" strokeWidth={2} />
              Upload resume
            </button>
            <p className="text-xs text-gray-600 mb-10">PDF, DOCX, TXT supported</p>

            <input
              ref={homeFileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setResumeFileUrl(URL.createObjectURL(file));
                parseFile(file)
                  .then((result) => {
                    if (result.html) setResumeDocHtml(result.html);
                    handleResumeUpload(result.text, file.name);
                  })
                  .catch(() => {});
                e.target.value = "";
              }}
            />

            {/* Auth gate disabled */}
          </div>
        )}
      </div>
    </div>
  );
}
