"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { parseFile, ACCEPTED_EXTENSIONS } from "@/lib/parseFile";
import { Plus, Home as HomeIcon, FileText, ClipboardList, Menu, X, Trash2, LogOut, Upload, FolderOpen, Download, Link2, Check, Mail, MessagesSquare, Target, Globe, GitBranch, User as UserIcon, Settings as SettingsIcon, ChevronDown, BookOpen, Sparkles, ScrollText, BookMarked, Briefcase, Mic, FileEdit, GraduationCap } from "lucide-react";
import { downloadResumePdf, buildShareLink } from "@/lib/resumeExport";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import HomeInput from "@/components/HomeInput";
import ResumeBuilder from "@/components/ResumeBuilder";
import InterviewView from "@/components/interview/InterviewView";
import LearnView from "@/components/LearnView";
import MarketingLanding from "@/components/marketing/LandingPage";
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

type ActiveView = "chat" | "resume-builder" | "drive" | "interview" | "learn";

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

// Build the chips line for a score-led welcome message. Score < 88 →
// surgical/commit/understand chips. Score ≥ 88 → next-level moves.
function buildWelcomeChipsForAnalysis(analysis: ResumeAnalysis | null): string {
  if (!analysis) return "__INLINE_CHIPS__:Walk me through the report|What's my biggest weakness?";
  const score = analysis.scores && typeof analysis.scores.total === "number" && analysis.scores.total > 0
    ? Math.round(Math.max(0, Math.min(100, analysis.scores.total)))
    : null;
  if (score !== null && score >= 88) {
    return "__INLINE_CHIPS__:Match a job description|Prep for interviews|Draft a cover letter";
  }
  // Three distinct intents — never duplicate "fix" actions:
  //   1. Walk me through fixes  → guided per-step (handleFixAll)
  //   2. Apply all fixes        → one-shot auto-apply (handleAcceptAll)
  //   3. Why this score?        → explanation, no mutation
  const whyChip = score !== null ? `Why is my score ${score}?` : "Why this score?";
  return `__INLINE_CHIPS__:Walk me through fixes|Apply all fixes|${whyChip}`;
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
  const [activeView, setActiveView] = useState<ActiveView>("resume-builder");
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

  // ── Auth init ─────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
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
          setChatList(chats);
          // Prefer the most recent chat that already has a parsed resume
          // attached. Falls back to the first chat. This way a returning
          // user always lands on the chat where their work actually is,
          // not on a blank "new chat" they happened to create last.
          const chatWithResume = chats.find((c) => c.resume_extraction)
            ?? chats[0];
          setActiveChatId(chatWithResume.id);
          restoreChatState(chatWithResume);

          // Fallback: even if the chosen chat has no extraction, the
          // user may still have one saved in Drive from earlier (e.g.
          // they signed in fresh-device and we picked an old chat row
          // that pre-dates the resume). Try Drive before falling back
          // to onboarding.
          if (user && !chatWithResume.resume_extraction) {
            try {
              const driveFiles = await loadAllDriveFiles();
              const original = driveFiles.find((f) => f.file_type === "original");
              if (original?.extraction_json) {
                setResumeExtraction(original.extraction_json!);
                setResumeText("");
                setResumeFilename(original.display_name ?? "resume.pdf");
                setOnboardingCompleted(true);
              }
            } catch (err) {
              console.warn("[loadChats] Drive fallback check failed:", err);
            }
          }
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
  const analysisLandedFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activeView !== "resume-builder") return;
    if (!resumeAnalysis) return;
    if (!resumeExtraction) return;
    const id = activeChatId ?? "local-chat";
    if (analysisLandedFiredRef.current.has(id)) return;

    // Detect the rotating-status placeholder pushed when user asked for
    // resume review before analysis finished.
    const hasProgressPlaceholder = chatMessages.some((m) => m.content === "__ANALYSIS_PROGRESS__");

    // Only fire if the user has signalled they want the resume review
    // (focus=resume from the orchestrator) OR if the placeholder exists.
    // Otherwise the user might be in another flow and we'd interrupt them.
    const userWantsResumeReview = orchFocusRef.current === "resume" || hasProgressPlaceholder;
    if (!userWantsResumeReview) return;

    analysisLandedFiredRef.current.add(id);

    const welcomeText = buildResumeBuilderWelcome(resumeExtraction, null, resumeAnalysis, chosenTargetRole);
    const chipLine = buildWelcomeChipsForAnalysis(resumeAnalysis);
    const reportBlock: ChatMessage[] = [
      { role: "assistant", content: "Done reading. Here's where you stand:", timestamp: now() },
      { role: "assistant", content: welcomeText, timestamp: now() },
      { role: "assistant", content: chipLine },
    ];

    let reportMsgs: ChatMessage[];
    if (hasProgressPlaceholder) {
      // Replace the placeholder in-place so the chat reads naturally.
      reportMsgs = chatMessages.flatMap((m) =>
        m.content === "__ANALYSIS_PROGRESS__" ? reportBlock : [m],
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
    setActiveView(chat.mode === "resume_builder" ? "resume-builder" : "chat");
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
  }

  function persistChat(
    id: string,
    msgs: ChatMessage[],
    mode: "chat" | "resume_builder",
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
    // No resume loaded at all → no choice to make, just open uploader.
    if (!resumeExtraction) {
      chatUploadInputRef.current?.click();
      return;
    }
    const currentName = resumeFilename || "current resume";
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
    console.log('RESUME TEXT LENGTH:', text?.length);
    console.log('RESUME TEXT PREVIEW:', text?.slice(0, 200));
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
    try {
      const extractRes = await fetch("/api/agents/resume/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: safeText }),
      });
      if (extractRes.ok) {
        extraction = await extractRes.json();
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
    } catch {
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
        setResumeAnalysis(analysis);
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: "__RESUME_ANALYSIS__" },
          { role: "assistant", content: "__RESUME_PRIORITIES__" },
          { role: "assistant", content: "Your report is ready. You can ask me anything — \"rewrite my summary\", \"explain my ATS score\", \"what keywords am I missing\"...\n\n📋 Change settings\n✅ All done" },
        ]);
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

      // ── Post-analysis actions ─────────────────────────
      if (/^change settings$/i.test(trimmed) && intakeStep === 5) {
        setIntakeStep(1);
        setIntakeAnswers({});
        setIntakeData(null);
        setResumeAnalysis(null);
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed },
          { role: "assistant", content: "Sure — let's redo the settings.\n\nWhat kind of report do you need?\n📋 Full Review\n⚡ Quick Scan" },
        ]);
        return;
      }
      if (/^all done$/i.test(trimmed) && intakeStep === 5) {
        setChatMessages((prev) => [
          ...prev,
          { role: "user", content: trimmed },
          { role: "assistant", content: "Great! Your report is ready in the panel on the right. Let me know if you have any questions about the results." },
        ]);
        setInput("");
        return;
      }

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
            { role: "assistant", content: `${ack}\n\nWhat level are they targeting?\n⭐ Senior\n⭐ Lead\n🧭 Manager\n💼 Director` },
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
            { role: "assistant", content: `${trimmed} — noted.\n\nWhat kind of company are they targeting?\n🌎 US General\n🏢 Big Tech\n🚀 Startup\n🏥 Healthcare\n💰 Finance` },
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
            { role: "assistant", content: `${trimmed} — great choice.\n\nDo you have a job description to benchmark against?\n✅ No JD\n📄 I have a JD` },
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
      if (isResumeMode && resumeAnalysis && intakeStep >= 5) {
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

      try {
        // Step 1: Orchestrate
        let decision: OrchestratorDecision = DEFAULT_ORCHESTRATOR_DECISION;
        try {
          const orchRes = await fetch("/api/orchestrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ messages: apiMessages, resumeText }),
          });
          if (orchRes.ok) decision = await orchRes.json();
        } catch { /* fallback */ }

        setOrchestratorDecision(decision);

        // Step 2: Resume Intelligence
        let currentAnalysis = resumeAnalysis;
        console.log('SEND MESSAGE - resumeText length:', resumeText?.length, 'runResumeIntelligence:', decision.runResumeIntelligence, 'hasAnalysis:', !!resumeAnalysis);
        if (decision.runResumeIntelligence && resumeText && !resumeAnalysis) {
          setIsAnalyzingResume(true);
          try {
            const analyzeRes = await fetch("/api/agents/resume/analyze", {
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
            });
            if (analyzeRes.ok) {
              currentAnalysis = await analyzeRes.json();
              finalAnalysis = currentAnalysis;
              setResumeAnalysis(currentAnalysis);
              const withAnalysis: ChatMessage[] = [
                ...updatedMessages,
                { role: "assistant", content: "__RESUME_ANALYSIS__" },
                { role: "assistant", content: "__RESUME_PRIORITIES__" },
              ];
              setMessages(withAnalysis);
              finalMessages = withAnalysis;

              // Auto-save report to Drive
              const chatId = activeChatIdRef.current;
              if (chatId && currentAnalysis) {
                saveReport({
                  chatId,
                  parentDriveId: originalDriveFileId ?? null,
                  extraction: resumeExtraction,
                  analysis: currentAnalysis,
                  candidateName: resumeExtraction?.name ?? "Resume",
                }).then((file) => {
                  if (file) loadDriveFiles(chatId).then(setDriveFiles).catch(() => {});
                }).catch(() => {});
              }
            }
          } catch { /* non-blocking */ }
          finally { setIsAnalyzingResume(false); }
        }

        // Step 3: Market Intelligence
        let currentMarketAnalysis = marketAnalysis;
        if (decision.runMarketIntelligence && decision.detectedTargetRole) {
          const marketKey = `${decision.detectedTargetRole}::${decision.detectedSeniority ?? "any"}::${decision.detectedLocation ?? "global"}`;
          if (analyzedMarketKey !== marketKey) {
            try {
              const marketRes = await fetch("/api/agents/market/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  targetRole: decision.detectedTargetRole,
                  seniority: decision.detectedSeniority,
                  location: decision.detectedLocation,
                  messages: apiMessages,
                }),
              });
              if (marketRes.ok) {
                currentMarketAnalysis = await marketRes.json();
                setMarketAnalysis(currentMarketAnalysis);
                setAnalyzedMarketKey(marketKey);
                const withMarket: ChatMessage[] = [
                  ...finalMessages,
                  { role: "assistant", content: "__MARKET_ANALYSIS__" },
                ];
                setMessages(withMarket);
                finalMessages = withMarket;
              }
            } catch { /* non-blocking */ }
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
        const res = await fetch("/api/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    [messages, setMessages, isLoading, isResumeMode, resumeText, resumeFilename, resumeExtraction, resumeAnalysis, intakeData, intakeStep, intakeAnswers, marketAnalysis, analyzedMarketKey, interviewPrepPlan]
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
        // Job Match has its own /job-match list route (href). Drive +
        // Foundations open inside the chat shell as workspace lenses.
        { key: "job-match",   label: "Job Match",   icon: Target,        view: null,    locked: false, href: "/job-match" },
        { key: "drive",       label: "Drive",       icon: FolderOpen,    view: "drive", locked: false },
        { key: "foundations", label: "Foundations", icon: GraduationCap, view: "learn", locked: false },
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
          className="w-8 h-8 rounded-xl flex items-center justify-center text-black text-xs font-bold flex-shrink-0 cursor-pointer"
          style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
          onClick={() => setIsSidebarExpanded(!expanded)}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        >
          S
        </div>
      </div>

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

      {/* Bottom: sign out */}
      <div className={`mt-auto pt-2 ${expanded ? "px-2" : "px-1.5"}`}>
        <div className="relative group">
          <button
            onClick={handleSignOut}
            className={`flex items-center ${expanded ? "gap-2.5 px-3 w-full" : "justify-center w-full px-0"} py-2.5 rounded-lg text-gray-600 hover:text-gray-500 hover:bg-gray-100 transition-colors border border-transparent`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
            {expanded && <span className="text-sm">Sign out</span>}
          </button>
          {!expanded && <SidebarTooltip label="Sign out" />}
        </div>
      </div>
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
            {/* Account button — circular avatar only (initial). Email
                still surfaces in the dropdown on click. */}
            {isSignedUp && (
              <div className="relative group">
                <button
                  onClick={() => setUserMenuOpen((v) => !v)}
                  title={user?.email ?? "Account"}
                  aria-label="Account menu"
                  className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center text-sm font-semibold"
                >
                  {(user?.email ?? "?").slice(0, 1).toUpperCase()}
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[220px]">
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
            )}
          </div>
        </header>

        {/* Content */}
        {activeView === "chat" ? (
          /* Chat view */
          <div className="flex flex-col flex-1 min-h-0">
            {chatMessages.length === 0 && !isLoading ? (
              /* Empty state — Claude/ChatGPT-style. Greeting + input
                 stacked together, vertically centered in the viewport.
                 No second input at the bottom; the input lives here
                 with the greeting until the first message lands. */
              <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-12">
                <div className="w-full max-w-2xl flex flex-col items-center">
                  {/* Resume status pill — only when a resume is loaded.
                      Keeps the user oriented (which file is active) and
                      gives a one-click swap via the source chooser. */}
                  {resumeExtraction && (
                    <button
                      type="button"
                      onClick={() => promptResumeSourceChoice()}
                      className="mb-4 inline-flex items-center gap-2 text-[12px] text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-full px-3 py-1 transition-colors"
                      title="Switch which resume Stackle uses"
                    >
                      <FileText className="w-3 h-3" strokeWidth={2} />
                      <span className="truncate max-w-[280px]">
                        Resume loaded · <strong className="font-medium text-gray-800">{resumeFilename || "your resume"}</strong>
                      </span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500">Change</span>
                    </button>
                  )}
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
              <>
                <ChatWindow
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
                      sendMessage("Proceed with the current resume review.");
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
                        setChatMessages((prev) => [
                          ...prev,
                          { role: "assistant", content: `Loaded **${file.display_name}**. Running the review now.`, timestamp: now() },
                        ]);
                        sendMessage("Proceed with the resume review.");
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

                    // All other chips → orchestrator decides.
                    sendMessage(prompt);
                  }}
                />
                <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-white">
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
              </>
            )}
          </div>
        ) : activeView === "interview" ? (
          <InterviewView
            candidateName={resumeExtraction?.name ?? null}
            resumeSkills={(resumeExtraction?.skillGroups ?? []).flatMap((g) => g.skills ?? [])}
          />
        ) : activeView === "learn" ? (
          <LearnView />
        ) : activeView === "drive" ? (
          /* Drive view — Dropbox-style */
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
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold text-black mb-6 hover:opacity-90 active:scale-95 transition-all"
              style={{ background: "linear-gradient(90deg, #fff7ad, #ffa9f9)" }}
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
