"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { deriveScoreFromAnalysis } from "@/lib/score";
import { X, ChevronLeft, ChevronDown, FileText, ClipboardList, Pencil, Download, Link2, Share2, Check, Mail, Target, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import ResumeDocument from "@/components/ResumeDocument";
const PDFViewer = dynamic(() => import("@/components/PDFViewer"), { ssr: false });
const DocxViewer = dynamic(() => import("@/components/DocxViewer"), { ssr: false });
import LiveEditableResume from "@/components/LiveEditableResume";
import ResumeCompletionModal from "@/components/ResumeCompletionModal";
import CoverLetterModal from "@/components/CoverLetterModal";
import JDMatchModal from "@/components/JDMatchModal";
import SideBySideCompareModal from "@/components/SideBySideCompareModal";
import RewriteTab from "@/components/RewriteTab";
import ToastStack, { useToasts } from "@/components/ToastStack";
import ResumeReportCard from "@/components/ResumeReportCard";
import { ChatMessage } from "@/components/Message";
import { ResumeExtraction, SkillGroup } from "@/lib/agents/schemas/resumeExtraction";
import { analysisWithAccepted } from "@/lib/scoreRedistribution";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import { applyEdit, resolveSectionContent } from "@/lib/resumeEditUtils";
import { strongBulletKeys } from "@/lib/resumeLinters";
import {
  DriveFile,
  saveReport,
  createWorkingCopy,
  updateWorkingCopy,
  finalizeVersion,
  loadDriveFiles,
} from "@/lib/supabase/drive";

type PanelTab = "resume" | "report" | "edit" | "rewrite";

// Module-scope guard for the one-shot skills-gap fetch. Lives outside the
// component so it survives unmount/remount cycles when the user navigates
// between Chat / Resume Builder / Drive views. Without this, every remount
// re-fired the fetch and re-pushed the "Strong AWS + Spark…" message into
// the chat. Keyed by chatId so different chat sessions still each get one
// skills-gap pass.
const SKILLS_GAP_FIRED = new Set<string>();
// Per-chatId dismiss state for the slim AI Coach card on the Report tab.
// Module scope (not React state) so a remount during view switches doesn't
// clear it — once the user clicks ×, it stays gone for that chat session.
const AI_COACH_DISMISSED = new Set<string>();

// Friendly label for a sectionKey — used in the chat log ("Rewrote your summary",
// "bullet 2 at Acme Corp", etc.) so the user sees what changed without
// decoding "experience.0.bullets.1".
function describeSection(sectionKey: string, ext: ResumeExtraction | null): string {
  if (sectionKey === "summary") return "your summary";
  if (sectionKey === "skillGroups") return "the skills section";
  const parts = sectionKey.split(".");
  if (parts[0] === "experience") {
    const i = parseInt(parts[1] ?? "", 10);
    const job = Number.isFinite(i) ? ext?.experience?.[i] : undefined;
    const company = job?.company ? ` at ${job.company}` : "";
    if (parts[2] === "bullets" && parts[3] !== undefined) {
      const j = parseInt(parts[3], 10);
      return `bullet ${Number.isFinite(j) ? j + 1 : "?"}${company}`;
    }
    return `the ${job?.title ?? "experience"} entry${company}`;
  }
  if (parts[0] === "projects") {
    const i = parseInt(parts[1] ?? "", 10);
    const p = Number.isFinite(i) ? ext?.projects?.[i] : undefined;
    return `the ${p?.name ?? "project"} entry`;
  }
  if (parts[0] === "education") return "an education entry";
  return "that section";
}

interface ResumeBuilderProps {
  resumeText: string | null;
  resumeFilename?: string;
  resumeExtraction: ResumeExtraction | null;
  resumeAnalysis: ResumeAnalysis | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isAnalyzingResume?: boolean;
  input: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onSendMessage: (text: string) => void;
  // Abort the parent's in-flight chat agent call (orchestrate/synthesize).
  // Lets the composer's Stop button cancel both local writer work AND the
  // main chat generation in one click.
  onStopAgent?: () => void;
  // When the user clicked "Apply in Resume Builder →" on a main-chat message,
  // the parent hands the instruction through here. On mount / on change,
  // ResumeBuilder fires the fix flow with it, then signals back so the parent
  // can clear the state (so refreshing or returning later doesn't re-fire).
  pendingInstruction?: string | null;
  onPendingInstructionConsumed?: () => void;
  // Phase 2/3: chat-first orchestrator. The parent forwards a tool call from
  // the streaming /api/agents/resume-orchestrator response; this component
  // executes it (switch tab, apply fix, highlight section, etc.) and then
  // calls onChatToolConsumed so the parent clears the pending event.
  pendingChatTool?: { ts: number; name: string; input: Record<string, unknown> } | null;
  onChatToolConsumed?: () => void;
  // Memory hooks: notify parent when the user accepts/rejects a fix so the
  // orchestrator's ConversationState stays in sync.
  onApplyAcceptedFix?: (sectionKey: string, priorityIndex: number) => void;
  onRejectFixSignal?: (sectionKey: string) => void;
  onEditUserMessage?: (index: number, newContent: string) => void;
  // Push a non-synthesis assistant message directly into the Resume Builder
  // chat (used for skills-gap surfacing and similar system prompts).
  onPushAssistantMessage?: (text: string) => void;
  onFileUpload: (text: string, filename: string) => void;
  onUpdateExtraction: (updated: ResumeExtraction) => void;
  // Drive props
  chatId?: string | null;
  originalDriveFileId?: string | null;
  onDriveUpdate?: (files: DriveFile[]) => void;
  resumeFileUrl?: string | null;
  resumeDocHtml?: string | null;
  // External trigger to open report panel (counter increments = open)
  openReportSignal?: number;
}

export default function ResumeBuilder({
  resumeText,
  resumeFilename,
  resumeExtraction,
  resumeAnalysis,
  messages,
  isLoading,
  isAnalyzingResume = false,
  input,
  onInputChange,
  onSend,
  onSendMessage,
  onStopAgent,
  pendingInstruction,
  onPendingInstructionConsumed,
  pendingChatTool,
  onChatToolConsumed,
  onApplyAcceptedFix,
  onRejectFixSignal,
  onEditUserMessage,
  onPushAssistantMessage,
  onFileUpload,
  onUpdateExtraction,
  chatId,
  originalDriveFileId,
  onDriveUpdate,
  resumeFileUrl,
  resumeDocHtml,
  openReportSignal,
}: ResumeBuilderProps) {
  // Transient status updates (rewrite confirmations, skip notices, score
  // changes) flow through this stack instead of the chat thread.
  const toasts = useToasts();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // Initial tab: if the analysis is already present at mount time (user just
  // finished onboarding and lands here), open the Report tab. The useEffect
  // below stays as a safety net in case analysis arrives after first render.
  const [activeTab, setActiveTab] = useState<PanelTab>(() =>
    resumeAnalysis ? "report" : "resume"
  );
  // Tabs the user has dismissed via the × button. Filter out of the strip.
  // Re-opening the panel or hitting the "Restore" chip brings them back.
  const [closedTabs, setClosedTabs] = useState<Set<PanelTab>>(new Set());
  const [reportIsNew, setReportIsNew] = useState(false);
  const [mobileView, setMobileView] = useState<"chat" | "panel">("chat");
  const didAutoOpenForExtraction = useRef(false);

  // ── Edit tab state ───────────────────────────────────────────────
  const [editedExtraction, setEditedExtraction] = useState<ResumeExtraction | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [typewriterContent, setTypewriterContent] = useState<string>("");
  const [editHistory, setEditHistory] = useState<ResumeExtraction[]>([]);
  const [isEditStreaming, setIsEditStreaming] = useState(false);
  const hasInitializedEdit = useRef(false);
  const typewriterAbort = useRef(false);

  // Generation counter — every new typewriter call bumps this. Loop ticks
  // only commit state if their generation still matches the current one.
  // Prevents a prior, accepted/rejected run from overwriting new content
  // when it resumes after a React scheduling gap.
  const typewriterGenRef = useRef(0);

  // Animate text being typed into a section in the Edit tab
  const runTypewriter = useCallback(async (text: string, sectionKey: string, speed = 16) => {
    typewriterAbort.current = false;
    typewriterGenRef.current += 1;
    const myGen = typewriterGenRef.current;
    setActiveTab("edit");
    setIsPanelOpen(true);
    setEditingSection(sectionKey);
    setTypewriterContent("");
    for (let i = 1; i <= text.length; i++) {
      if (typewriterAbort.current || typewriterGenRef.current !== myGen) return;
      setTypewriterContent(text.slice(0, i));
      await new Promise((r) => setTimeout(r, speed));
    }
    await new Promise((r) => setTimeout(r, 500));
    if (typewriterGenRef.current !== myGen) return;
    setEditingSection(null);
    setTypewriterContent("");
  }, []);

  // ── Fix flow state machine ──────────────────────────────────────
  // "loading" only — shows while the writer call is in flight before the
  // typewriter starts. "why" intermediate panel was removed to cut friction.
  type FixFlowState =
    | null
    | { step: "loading"; action: string; index: number };
  const [fixFlow, setFixFlow] = useState<FixFlowState>(null);

  // Inline fix shown directly inside the resume document
  type InlineFixState = {
    sectionKey: string;
    before: string;
    after: string;
    action: string;
    priorityIndex: number;
  } | null;
  const [inlineFix, setInlineFix] = useState<InlineFixState>(null);
  // Tracks AI versions the user rejected via Rewrite for the current fix, so
  // the next call can ask Sonnet for something substantively different.
  const [rewriteAttempts, setRewriteAttempts] = useState<string[]>([]);
  // True while a Rewrite call is in flight — used to disable the buttons and
  // show a "Rewriting…" state without unmounting the current proposal.
  const [isRewriting, setIsRewriting] = useState(false);
  // Active AbortController for the in-flight writer request. Lets the Stop
  // button cancel the fetch mid-flight instead of waiting it out.
  const activeEditAbortRef = useRef<AbortController | null>(null);
  // Fix All chain state. `fixAllActive` keeps the Stop button visible during
  // the 2s settle between fixes (when no fetch is in flight but a new one is
  // queued). `fixAllAbortedRef` is checked inside advanceToNextFix to bail
  // out of the chain when the user hits Stop.
  const [fixAllActive, setFixAllActive] = useState(false);
  const fixAllAbortedRef = useRef(false);

  const [acceptedPoints, setAcceptedPoints] = useState(0);
  const [firstAcceptFired, setFirstAcceptFired] = useState(false);
  const [confettiBurst, setConfettiBurst] = useState<{ id: number } | null>(null);
  // Subtle "Saved" ghost beside the score toast whenever an accepted edit
  // is persisted to the Drive working copy.
  const [savedGhost, setSavedGhost] = useState(false);

  // Skills gap — populated once per chat after analysis loads.
  // `missing` → suggested chips rendered under the skills section
  // `chatLine` → surfaced as an assistant message so the user hears it
  type SkillGapMissing = { skill: string; category: string; reason: string; priority: "high" | "medium" };
  const [skillsGap, setSkillsGap] = useState<{ missing: SkillGapMissing[]; chatLine: string } | null>(null);
  // Tick state used solely to re-render after toggling AI_COACH_DISMISSED so
  // the slim coach card on the Report tab disappears immediately on click.
  const [, setCoachDismissTick] = useState(0);
  // Skills the user has dismissed from the suggested row in this session
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  // 1-deep snapshot of skillGroups before the auto-regroup so the user can Undo.
  const [skillsRegroupSnapshot, setSkillsRegroupSnapshot] = useState<SkillGroup[] | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<number>>(new Set());
  // Subset of completedActions that were ACCEPTED (vs rejected). Used to
  // render ✓ vs ✗ next to each priority in the Report.
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(new Set());
  // Section keys whose fix the user has ACCEPTED. Auto-advance skips any
  // remaining priority instruction that clearly targets one of these so we
  // don't re-rewrite a section the user already committed to.
  const [acceptedSections, setAcceptedSections] = useState<Set<string>>(new Set());
  // Completion modal trigger state
  const [rejectedCount, setRejectedCount] = useState(0);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  // Persisted Rewrite-tab snapshot. When the user generates a full-resume
  // rewrite in the Rewrite tab, we cache it here (and in localStorage)
  // so refreshing the page doesn't lose the result. RewriteTab seeds
  // its own `rewritten` state from this on mount.
  const [savedRewrite, setSavedRewrite] = useState<{ extraction: ResumeExtraction; changedKeys: string[]; styleHint?: string; generatedAt: string } | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  // Most-recently finalized version's display name — drives the Edit tab label,
  // the PDF filename, and the "you finalized X last time" greeting on re-entry.
  const [lastFinalizedName, setLastFinalizedName] = useState<string | null>(null);
  const [completionBaseScore, setCompletionBaseScore] = useState(0);
  const [hasCelebratedCompletion, setHasCelebratedCompletion] = useState(false);
  const [scoreToast, setScoreToast] = useState<{ pts: number } | null>(null);

  // Sections that are never auto-fixed
  const PROTECTED = ["education", "certification", "contact", "name", "email", "phone", "address", "linkedin"];
  const isProtected = (key: string) => PROTECTED.some(p => key.toLowerCase().startsWith(p));

  // ── Original preview hover state (Edit tab) ─────────────────────
  const [showOriginalPreview, setShowOriginalPreview] = useState(false);

  // ── Drive state ──────────────────────────────────────────────────
  const [workingCopyId, setWorkingCopyId] = useState<string | null>(null);
  const [driveEditingState, setDriveEditingState] = useState<"idle" | "editing" | "saving">("idle");
  const [isSavingReportToDrive, setIsSavingReportToDrive] = useState(false);
  const [isSavedReportToDrive, setIsSavedReportToDrive] = useState(false);
  // Guards the auto-save-on-analysis-ready effect from re-firing per chat.
  const autoSavedReportRef = useRef<Set<string>>(new Set());
  const [isDownloadingResume, setIsDownloadingResume] = useState(false);
  const resumeDocRef = useRef<HTMLDivElement>(null);

  async function refreshDriveFiles() {
    if (!chatId || !onDriveUpdate) return;
    const files = await loadDriveFiles(chatId);
    onDriveUpdate(files);
  }

  async function handleSaveReportToDrive() {
    if (!chatId || !resumeAnalysis || isSavingReportToDrive) return;
    setIsSavingReportToDrive(true);
    try {
      await saveReport({
        chatId,
        parentDriveId: originalDriveFileId ?? null,
        extraction: resumeExtraction,
        analysis: resumeAnalysis,
        candidateName: resumeExtraction?.name ?? "Resume",
      });
      await refreshDriveFiles();
      setIsSavedReportToDrive(true);
      setTimeout(() => setIsSavedReportToDrive(false), 3000);
    } finally {
      setIsSavingReportToDrive(false);
    }
  }

  async function handleDownloadResume() {
    if (!resumeDocRef.current || isDownloadingResume) return;
    setIsDownloadingResume(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const name = resumeExtraction?.name ?? "Resume";
      const role = resumeAnalysis?.likelyTargetRole ?? "Role";
      // If the user finalized a named version, honour it as the filename.
      // Strip unsafe path chars and cap length so we don't produce a monster
      // download name.
      const filename = lastFinalizedName
        ? `${lastFinalizedName.replace(/[\/\\:*?"<>|]+/g, "").trim().slice(0, 60)}.pdf`
        : `${name}_${role}_Stackle.pdf`;
      await html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(resumeDocRef.current)
        .save();
    } finally {
      setIsDownloadingResume(false);
    }
  }

  // Initialize editedExtraction once when extraction first arrives.
  // PRIORITY ORDER:
  //   1. Drive working copy for this chat (preserves accepted edits across refresh)
  //   2. Original extraction from props (first ever load — no fixes yet)
  // The Drive load happens async; while waiting we seed from props so the
  // Edit tab is never empty. If the Drive load lands later with a richer
  // working copy, we replace.
  useEffect(() => {
    if (!resumeExtraction || hasInitializedEdit.current) return;
    hasInitializedEdit.current = true;
    // Seed from props synchronously.
    setEditedExtraction(structuredClone(resumeExtraction));
    // Then check Drive for a working copy keyed to this chat.
    if (!chatId) return;
    let cancelled = false;
    (async () => {
      try {
        const files = await loadDriveFiles(chatId);
        if (cancelled) return;
        const wc = files.find(
          (f) => f.file_type === "working_copy" && f.chat_id === chatId && f.extraction_json,
        );
        if (wc?.extraction_json) {
          setEditedExtraction(structuredClone(wc.extraction_json));
          setWorkingCopyId(wc.id);
          // Restore the accepted-fix state from localStorage so score
          // bumps + action-plan badges reflect what the user already
          // accepted before refresh. Keyed on chatId.
          try {
            const raw = localStorage.getItem(`stackle_accepted_${chatId}`);
            if (raw) {
              const saved = JSON.parse(raw) as {
                acceptedIndices?: number[];
                acceptedSections?: string[];
                completedActions?: number[];
                acceptedPoints?: number;
                rejectedCount?: number;
              };
              if (Array.isArray(saved.acceptedIndices)) setAcceptedIndices(new Set(saved.acceptedIndices));
              if (Array.isArray(saved.acceptedSections)) setAcceptedSections(new Set(saved.acceptedSections));
              if (Array.isArray(saved.completedActions)) setCompletedActions(new Set(saved.completedActions));
              if (typeof saved.acceptedPoints === "number") setAcceptedPoints(saved.acceptedPoints);
              if (typeof saved.rejectedCount === "number") setRejectedCount(saved.rejectedCount);
            }
          } catch (err) {
            console.warn("[restore] accepted-state failed:", err);
          }
        }
        // Restore any cached Rewrite-tab snapshot for this chat so the
        // generated resume isn't lost on refresh.
        try {
          const rawRewrite = localStorage.getItem(`stackle_rewrite_${chatId}`);
          if (rawRewrite) {
            const saved = JSON.parse(rawRewrite) as { extraction: ResumeExtraction; changedKeys?: string[]; styleHint?: string; generatedAt?: string };
            if (saved?.extraction) {
              setSavedRewrite({
                extraction: saved.extraction,
                changedKeys: saved.changedKeys ?? [],
                styleHint: saved.styleHint,
                generatedAt: saved.generatedAt ?? new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          console.warn("[restore] rewrite-snapshot failed:", err);
        }
      } catch (err) {
        console.warn("[restore] working-copy load failed:", err);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeExtraction, chatId]);

  // Persist the accepted-fix state to localStorage on every change so a
  // refresh restores the score bumps and action-plan badges. Keyed on
  // chatId so multiple chats don't collide. Skips when no chatId yet.
  useEffect(() => {
    if (!chatId) return;
    try {
      const payload = {
        acceptedIndices: Array.from(acceptedIndices),
        acceptedSections: Array.from(acceptedSections),
        completedActions: Array.from(completedActions),
        acceptedPoints,
        rejectedCount,
      };
      // Only write when there's something to remember — avoids clobbering
      // a fresh chat's state with an empty payload during the initial
      // restore handshake.
      const hasState =
        payload.acceptedIndices.length > 0 ||
        payload.acceptedSections.length > 0 ||
        payload.completedActions.length > 0;
      if (hasState) {
        localStorage.setItem(`stackle_accepted_${chatId}`, JSON.stringify(payload));
      }
    } catch (err) {
      console.warn("[persist] accepted-state failed:", err);
    }
  }, [chatId, acceptedIndices, acceptedSections, completedActions, acceptedPoints, rejectedCount]);

  // Reset edit state on new conversation — must clear EVERYTHING derived
  // from the previous resume or we leak scores, completion badges, and a
  // stale workingCopyId that blocks new Drive working-copy creation.
  useEffect(() => {
    if (!resumeExtraction && !resumeAnalysis) {
      hasInitializedEdit.current = false;
      setEditedExtraction(null);
      setEditingSection(null);
      setTypewriterContent("");
      setEditHistory([]);
      setAcceptedPoints(0);
      setCompletedActions(new Set());
      setAcceptedSections(new Set());
      setAcceptedIndices(new Set());
      setSkillsGap(null);
      setDismissedSuggestions(new Set());
      setRewriteAttempts([]);
      setWorkingCopyId(null);
      setInlineFix(null);
      setFixFlow(null);
      setScoreToast(null);
      setShowOriginalPreview(false);
      setMobileView("chat");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeExtraction, resumeAnalysis]);

  // Skills-gap fetch — runs once per chat after both extraction + analysis land.
  // Uses `skillsGap` state as the gate (once populated, never re-fetches) plus
  // an in-flight ref to catch the React-StrictMode and chatId-transition
  // double-fire cases. The old chatKey-based ref wasn't enough because chatId
  // often flips from null to a real UUID mid-session, creating a "new" key
  // that slipped past the guard.
  // Auto-save the report to Drive the first time we see a fresh analysis for
  // a given chat. No UI button needed — user shouldn't have to think about
  // "did I save the report?". Guarded per chatId so navigating back in doesn't
  // duplicate rows. Fires fire-and-forget; failures log to console.
  useEffect(() => {
    if (!chatId || !resumeAnalysis) return;
    if (autoSavedReportRef.current.has(chatId)) return;
    autoSavedReportRef.current.add(chatId);
    (async () => {
      try {
        await saveReport({
          chatId,
          parentDriveId: originalDriveFileId ?? null,
          extraction: resumeExtraction,
          analysis: resumeAnalysis,
          candidateName: resumeExtraction?.name ?? "Resume",
        });
        await refreshDriveFiles();
        setIsSavedReportToDrive(true);
        setTimeout(() => setIsSavedReportToDrive(false), 2400);
      } catch (err) {
        console.error("[drive] auto-save report failed:", err);
        // Allow retry on next effect run
        autoSavedReportRef.current.delete(chatId);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, resumeAnalysis]);

  const skillsGapInFlightRef = useRef(false);
  useEffect(() => {
    if (!resumeExtraction || !resumeAnalysis) return;
    if (!chatId) return;
    // Module-scope guard: only fire once per chatId across the entire
    // session, even across remounts. The earlier in-component ref reset
    // when ResumeBuilder unmounted on view switch, so the fetch fired
    // again and pushed a duplicate "Strong AWS + Spark…" line.
    if (SKILLS_GAP_FIRED.has(chatId)) return;
    if (skillsGap) return;                    // already have it
    if (skillsGapInFlightRef.current) return; // already fetching
    skillsGapInFlightRef.current = true;
    SKILLS_GAP_FIRED.add(chatId);

    (async () => {
      try {
        const res = await fetch("/api/agents/skills-gap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extraction: resumeExtraction,
            targetRole: resumeAnalysis.likelyTargetRole ?? null,
            seniority: resumeAnalysis.seniorityEstimate ?? null,
            // Full raw resume so the model can sweep bullets / projects / titles
            // for technical skills that never made the Skills section.
            resumeText: resumeText ?? null,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.chatLine) return;
        setSkillsGap({ missing: data.missing ?? [], chatLine: data.chatLine });
        // SILENT — skills-gap data flows into the Skills section UI inline.
        // We do NOT push it into chat. The fetch resolves 20-40s after the
        // user lands in Resume Builder and a delayed message felt like the
        // app was "possessed" — the welcome already covers what the user
        // needs to know up front.

        // Apply the full re-categorised sweep if it's materially richer than
        // what's currently in skillGroups. Replace in place + persist + toast.
        const recategorized = (data.recategorizedGroups ?? []) as SkillGroup[];
        const currentSkillCount = (resumeExtraction.skillGroups ?? [])
          .reduce((n, g) => n + (g.skills?.length ?? 0), 0);
        const newSkillCount = recategorized.reduce((n, g) => n + (g.skills?.length ?? 0), 0);
        // Apply if it pulled at least 3 more skills OR >=20% more total.
        const addedEnough = newSkillCount >= currentSkillCount + 3 ||
          (currentSkillCount > 0 && newSkillCount >= currentSkillCount * 1.2);
        if (recategorized.length > 0 && addedEnough) {
          setSkillsRegroupSnapshot(resumeExtraction.skillGroups ?? []);
          const next: ResumeExtraction = { ...resumeExtraction, skillGroups: recategorized };
          persistWorkingCopy(next);
          // SILENT — the regroup is visible directly in the Skills section UI.
          // No chat toast (used to fire 30-60s after mount and read as noise).
        }
      } catch (err) {
        console.warn("[skills-gap] failed:", err);
      } finally {
        skillsGapInFlightRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeExtraction, resumeAnalysis]);

  // When the user lands on the Edit tab, ensure a working copy exists in Drive.
  // Previously this only happened when clicking "Fix" on a Report item, which
  // meant users who opened Edit directly never got a working copy in Drive.
  useEffect(() => {
    if (activeTab !== "edit") return;
    if (!chatId || !originalDriveFileId) return; // need an anchor to parent
    if (!editedExtraction) return;
    if (workingCopyId) return; // already exists
    setDriveEditingState("editing");
    createWorkingCopy({ parentId: originalDriveFileId, chatId, extraction: editedExtraction })
      .then(async (copy) => {
        if (copy) {
          setWorkingCopyId(copy.id);
          await refreshDriveFiles();
        }
      })
      .catch(() => { /* non-fatal — inline edits still work in memory */ })
      .finally(() => setDriveEditingState("idle"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, chatId, originalDriveFileId, editedExtraction, workingCopyId]);

  function pushToHistory(snapshot: ResumeExtraction) {
    setEditHistory((prev) => [...prev, structuredClone(snapshot)].slice(-10));
  }

  function handleUndo() {
    setEditHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setEditedExtraction(structuredClone(last));
      setEditingSection(null);
      setTypewriterContent("");
      return prev.slice(0, -1);
    });
  }

  // Call the edit API — AI identifies the correct sectionKey + rewrites content
  const callEditApi = useCallback(async (
    instruction: string,
    extraction: ResumeExtraction,
    opts?: { previousAttempts?: string[]; styleHint?: string; lockedSectionKey?: string; lockedBullets?: string[]; userVerbatim?: boolean }
  ): Promise<{ sectionKey: string; newContent: string } | null> => {
    setIsEditStreaming(true);
    setEditingSection("__loading__");
    const controller = new AbortController();
    activeEditAbortRef.current = controller;
    try {
      const res = await fetch("/api/agents/resume/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          extraction,
          instruction,
          resumeContext: {
            name: extraction.name,
            targetRole: resumeAnalysis?.likelyTargetRole ?? null,
            seniority: resumeAnalysis?.seniorityEstimate ?? null,
          },
          previousAttempts: opts?.previousAttempts,
          styleHint: opts?.styleHint,
          lockedSectionKey: opts?.lockedSectionKey,
          lockedBullets: opts?.lockedBullets,
          userVerbatim: opts?.userVerbatim,
        }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (!json.sectionKey || json.newContent === undefined) return null;
      return { sectionKey: json.sectionKey, newContent: json.newContent };
    } catch {
      return null;
    } finally {
      setIsEditStreaming(false);
      setEditingSection(null);
      if (activeEditAbortRef.current === controller) activeEditAbortRef.current = null;
    }
  }, [resumeAnalysis]);

  // Ref indirection avoids circular useCallback dependencies between
  // `runFixForAction` and `advanceToNextFix` — both call each other.
  const runFixForActionRef = useRef<((instruction: string, priorityIndex: number, currentExtraction?: ResumeExtraction, opts?: { fromFixAll?: boolean; lockedSectionKey?: string }) => Promise<void>) | null>(null);

  // Core: generate + show the fix inline for a given action/index.
  // Used by both the first Fix click and the auto-advance after Accept/Reject.
  const runFixForAction = useCallback(async (instruction: string, priorityIndex: number, currentExtraction?: ResumeExtraction, opts?: { fromFixAll?: boolean; lockedSectionKey?: string }) => {
    const workingExtraction = currentExtraction ?? editedExtraction;
    if (!workingExtraction) return;

    // For direct per-section AI edits (Sparkles button — lockedSectionKey
    // set), skip the chat-side "Generating…" spinner. The section's
    // existing content stays visible during the API call (don't replace
    // it with an empty cursor — that's worse UX than just waiting).
    // The AI button greys out via isRewriting so the user knows it's
    // working; on response the diff box appears + typewriter fills.
    const isDirectSectionEdit = !!opts?.lockedSectionKey;
    if (!isDirectSectionEdit) {
      setFixFlow({ step: "loading", action: instruction, index: priorityIndex });
    } else {
      setIsRewriting(true);
    }
    setActiveTab("edit");
    setIsPanelOpen(true);
    setRewriteAttempts([]); // fresh fix — clear any prior rewrite history

    // Ensure a working copy exists in Drive (first-fix path)
    if (chatId && originalDriveFileId && !workingCopyId) {
      setDriveEditingState("editing");
      const copy = await createWorkingCopy({
        parentId: originalDriveFileId,
        chatId,
        extraction: workingExtraction,
      });
      if (copy) {
        setWorkingCopyId(copy.id);
        await refreshDriveFiles();
      }
    }

    // Fix All respects the "don't rewrite already-good bullets" rule —
    // direct Fix clicks and Rewrite bypass it (user explicitly asked).
    const lockedBullets = opts?.fromFixAll
      ? strongBulletKeys(workingExtraction.experience)
      : undefined;

    const result = await callEditApi(instruction, workingExtraction, { lockedBullets, lockedSectionKey: opts?.lockedSectionKey });

    // Writer marked this priority not applicable (structural action it
    // can't perform — e.g. "remove References section", "convert table to
    // bullets"). Auto-skip with a chat note so the user knows why this
    // priority isn't being acted on, instead of letting the writer
    // silently drift into rewriting the summary as a fallback.
    if (result && result.sectionKey === "__not_applicable__") {
      setFixFlow(null);
      if (opts?.lockedSectionKey) setIsRewriting(false);
      const reason = result.newContent?.trim() || "This action can't be performed by the writer.";
      toasts.push({ kind: "warn", text: `Skipped: ${reason}`, durationMs: 4000 });
      if (priorityIndex >= 0) {
        setCompletedActions((prev) => {
          const next = new Set([...prev, priorityIndex]);
          advanceToNextFix(priorityIndex, next, workingExtraction);
          return next;
        });
      }
      return;
    }

    // Defensive: the writer occasionally returns "experience.{i}" as a whole-entry
    // key but the UI only has bullet-level editables. Redirect to the first bullet
    // of that job so the fix is at least visible somewhere.
    if (result && /^experience\.\d+$/.test(result.sectionKey)) {
      const parts = result.sectionKey.split(".");
      const jobIdx = parseInt(parts[1] ?? "", 10);
      const hasBullet = Number.isFinite(jobIdx) && workingExtraction.experience?.[jobIdx]?.bullets?.length;
      if (hasBullet) {
        result.sectionKey = `experience.${jobIdx}.bullets.0`;
        // Take only the first line of the multi-bullet content so it fits one bullet slot
        const firstLine = result.newContent.split("\n").map(s => s.trim()).filter(Boolean)[0] ?? result.newContent;
        result.newContent = firstLine;
      }
    }

    // Fallback check: if writer ignored the lockedBullets hint and still
    // returned a locked key, skip it.
    const writerReturnedLockedBullet = opts?.fromFixAll
      && result
      && (lockedBullets ?? []).includes(result.sectionKey);

    // Drift check: if the writer chose a section the user has already
    // accepted a fix on, this priority is a duplicate of earlier work —
    // skip rather than rewriting an already-finalised section. Bypass
    // the check when lockedSectionKey is set (user explicitly asked to
    // re-edit that section via Rewrite or Sparkles).
    const writerDriftedIntoAcceptedSection = result
      && !opts?.lockedSectionKey
      && acceptedSections.has(result.sectionKey);

    if (!result || isProtected(result.sectionKey) || writerReturnedLockedBullet || writerDriftedIntoAcceptedSection) {
      // Skip silently and advance to the next non-protected priority so the
      // chain never stalls on a protected section.
      setFixFlow(null);
      if (opts?.lockedSectionKey) setIsRewriting(false);
      if (writerDriftedIntoAcceptedSection && result) {
        toasts.push({ kind: "warn", text: `Skipped — overlaps with an accepted fix on ${describeSection(result.sectionKey, workingExtraction)}.`, durationMs: 4000 });
      }
      if (priorityIndex >= 0) {
        setCompletedActions((prev) => {
          const next = new Set([...prev, priorityIndex]);
          advanceToNextFix(priorityIndex, next, workingExtraction);
          return next;
        });
      }
      return;
    }

    const before = resolveSectionContent(workingExtraction, result.sectionKey);
    setFixFlow(null);
    // Set editingSection + clear typewriterContent IN THE SAME RENDER as
    // setInlineFix so the green box never flashes the full text before the
    // typewriter starts. EditableSection's `isEditing` check now flips to
    // true immediately, displayAfter = typewriterContent = "" (empty), and
    // the typewriter fills it character-by-character from there.
    setInlineFix({ sectionKey: result.sectionKey, before, after: result.newContent, action: instruction, priorityIndex });
    setEditingSection(result.sectionKey);
    setTypewriterContent("");
    // Direct section edit done — clear the AI-button busy state so the
    // section's Sparkles control becomes clickable again next round.
    if (opts?.lockedSectionKey) setIsRewriting(false);

    // Kick off the typewriter immediately. Scroll + flash run in parallel
    // — they no longer block the animation behind a 550ms timeout.
    runTypewriter(result.newContent, result.sectionKey);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-section-key^="${CSS.escape(result.sectionKey)}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove("stackle-fix-flash");
        void el.offsetHeight; // force reflow so the keyframe restarts cleanly
        el.classList.add("stackle-fix-flash");
        setTimeout(() => el.classList.remove("stackle-fix-flash"), 1200);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedExtraction, callEditApi, chatId, originalDriveFileId, workingCopyId, runTypewriter]);

  // User clicks Fix in the Report — jump straight to the typewriter (no "Why" gate)
  const handleFixItem = useCallback((instruction: string, priorityIndex: number) => {
    if (isEditStreaming) return;
    runFixForAction(instruction, priorityIndex);
  }, [isEditStreaming, runFixForAction]);

  // Advance to the next un-completed, non-protected priority — used after
  // both Accept and Reject so the user flows through all fixes without
  // extra clicks. Returns true if it queued a next fix.
  // Cheap keyword check: does this priority instruction target a section the
  // user already accepted a fix on? Used to skip re-rewrites on the same spot.
  function priorityTargetsAcceptedSection(instruction: string, accepted: Set<string>): boolean {
    const lc = instruction.toLowerCase();
    if (accepted.has("summary") && /(summary|profile|objective|headline|intro)/.test(lc)) return true;
    if (accepted.has("skillGroups") && /(skills?|keywords?|stack|technolog|tools|tech list)/.test(lc)) return true;
    // Per-bullet acceptance is common; don't block the whole experience section just because one bullet was accepted
    return false;
  }

  const advanceToNextFix = useCallback((
    justCompletedIndex: number,
    completedSet: Set<number>,
    extractionForNext: ResumeExtraction | null,
    acceptedSet: Set<string> = acceptedSections,
  ) => {
    // Chat-initiated fixes use index -1 and don't auto-chain — the user is
    // driving one edit at a time via pills/chat.
    if (justCompletedIndex < 0) return false;
    // User hit Stop — break the chain cleanly.
    if (fixAllAbortedRef.current) {
      setFixAllActive(false);
      return false;
    }
    const allActions = resumeAnalysis?.rewritePriorities ?? [];
    const nextIdx = allActions.findIndex((action, i) =>
      i > justCompletedIndex &&
      !completedSet.has(i) &&
      !priorityTargetsAcceptedSection(action, acceptedSet)
    );
    if (nextIdx === -1 || !extractionForNext) {
      // Chain exhausted. If the user accepted ≥3 and we haven't celebrated
      // yet, show the completion modal. Delay 2.5s so the last accepted fix
      // has time to settle visually.
      const acceptedCount = completedSet.size - rejectedCount;
      if (acceptedCount >= 3 && !hasCelebratedCompletion) {
        setTimeout(() => setShowCompletionModal(true), 2500);
      }
      setFixAllActive(false);
      return false;
    }
    // 2 s delay so the user sees their just-accepted green text settle into
    // the document before the next fix's red/green box pops in.
    setTimeout(() => {
      // Re-check the abort flag right before firing — user might have hit
      // Stop during the 2s settle.
      if (fixAllAbortedRef.current) { setFixAllActive(false); return; }
      // Auto-advance always counts as "Fix All mode" — it only fires from
      // within a Fix-All chain — so propagate the strength-guard flag.
      runFixForActionRef.current?.(allActions[nextIdx], nextIdx, extractionForNext, { fromFixAll: true });
    }, 2000);
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAnalysis, acceptedSections, hasCelebratedCompletion, rejectedCount]);

  // Sync the ref after runFixForAction is defined
  useEffect(() => {
    runFixForActionRef.current = runFixForAction;
  }, [runFixForAction]);

  // Accept inline fix — apply, score, toast, auto-advance directly to next fix's typewriter
  const handleAcceptFix = useCallback(() => {
    if (!inlineFix || !editedExtraction) return;
    const { sectionKey, after, action, priorityIndex } = inlineFix;

    typewriterAbort.current = true;
    setEditingSection(null);
    setTypewriterContent("");

    const nextExtraction = applyEdit(editedExtraction, sectionKey, after);
    pushToHistory(editedExtraction);
    setEditedExtraction(nextExtraction);

    // Persist to Drive immediately so tab-close doesn't lose the edit. The
    // working copy stays a working copy — finalize-to-version only happens
    // when the user hits "Save as v1" in the Completion modal.
    if (workingCopyId) {
      updateWorkingCopy({ workingCopyId, extraction: nextExtraction })
        .then((ok) => {
          if (ok) {
            setSavedGhost(true);
            setTimeout(() => setSavedGhost(false), 1200);
          }
        })
        .catch((err) => console.error("[drive] save on accept failed:", err));
    }

    // Mark this section as locked so auto-advance won't re-rewrite it
    const nextAccepted = new Set([...acceptedSections, sectionKey]);
    setAcceptedSections(nextAccepted);

    // Phase 2/3 memory: tell the orchestrator's ConversationState.
    onApplyAcceptedFix?.(sectionKey, priorityIndex);

    const pts = action.toUpperCase().startsWith("HIGH") ? 4 : action.toUpperCase().startsWith("MEDIUM") ? 2 : 1;
    setAcceptedPoints((p) => p + pts);
    if (priorityIndex >= 0) {
      setAcceptedIndices((prev) => new Set([...prev, priorityIndex]));
      setCompletedActions((prev) => {
        const next = new Set([...prev, priorityIndex]);
        advanceToNextFix(priorityIndex, next, nextExtraction, nextAccepted);
        return next;
      });
    }
    setScoreToast({ pts });
    setTimeout(() => setScoreToast(null), 2500);
    // First-accept celebration — confetti burst + score pulse, once per session
    if (!firstAcceptFired) {
      setFirstAcceptFired(true);
      setConfettiBurst({ id: Date.now() });
      setTimeout(() => setConfettiBurst(null), 1200);
    }
    // Surface the accept as a toast (slides in bottom-right, 3s, no chat
    // clutter). Score animation is handled separately by the +pts pulse.
    const logLabel = describeSection(sectionKey, editedExtraction);
    toasts.push({ kind: "score", badge: `+${pts} pts`, text: `Rewrote ${logLabel}` });
    setInlineFix(null);
    setRewriteAttempts([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineFix, editedExtraction, advanceToNextFix, firstAcceptFired]);

  // Reject inline fix — discard the rewrite, mark as completed (won't retry),
  // and advance to the next fix's typewriter.
  const handleRejectFix = useCallback(() => {
    if (!inlineFix || !editedExtraction) return;
    const { priorityIndex, sectionKey } = inlineFix;

    typewriterAbort.current = true;
    setEditingSection(null);
    setTypewriterContent("");
    setInlineFix(null);
    setRewriteAttempts([]);

    // Reject as a toast. Quick, non-celebratory.
    const logLabel = describeSection(sectionKey, editedExtraction);
    toasts.push({ kind: "info", text: `Kept your original ${logLabel}.` });

    // Phase 2/3 memory: tell the orchestrator's ConversationState.
    onRejectFixSignal?.(sectionKey);

    if (priorityIndex >= 0) {
      setRejectedCount((r) => r + 1);
      setCompletedActions((prev) => {
        const next = new Set([...prev, priorityIndex]);
        advanceToNextFix(priorityIndex, next, editedExtraction);
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineFix, editedExtraction, advanceToNextFix, onPushAssistantMessage]);

  // Rewrite — user didn't like the proposal. Re-call the writer with the
  // current proposal listed as "do not repeat this" plus a rotating style
  // hint. Replaces the inline fix with the new version. Does NOT advance.
  const REWRITE_STYLE_HINTS = [
    "go tighter — cut every non-essential word, aim for one clean line",
    "lead with quantified impact — numbers, percentages, scale indicators",
    "swap the opening verb to a more senior one (Led, Architected, Shipped, Scaled)",
    "restructure — if it was one long sentence, make it two short ones; if two short, make it one",
    "emphasize outcome over activity — what changed for the business, not what you did",
  ];
  const handleRewriteFix = useCallback(async () => {
    if (!inlineFix || !editedExtraction || isRewriting) return;
    const { action, sectionKey, after: currentProposal, before, priorityIndex } = inlineFix;
    setIsRewriting(true);
    try {
      const nextAttempts = [...rewriteAttempts, currentProposal];
      const hint = REWRITE_STYLE_HINTS[nextAttempts.length % REWRITE_STYLE_HINTS.length];
      const result = await callEditApi(action, editedExtraction, {
        previousAttempts: nextAttempts,
        styleHint: hint,
        lockedSectionKey: sectionKey,
      });
      if (!result) return;
      // Force the section to match the locked key — safety net in case the
      // writer ignored the lock. Keep the new content either way.
      result.sectionKey = sectionKey;
      setRewriteAttempts(nextAttempts);
      // Update inline fix in place — same section, same before, new after.
      setInlineFix({
        sectionKey: result.sectionKey,
        before,
        after: result.newContent,
        action,
        priorityIndex,
      });
      // Re-scroll into view before retyping so the user sees the new proposal land
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-section-key^="${CSS.escape(result.sectionKey)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => runTypewriter(result.newContent, result.sectionKey), 550);
        } else {
          runTypewriter(result.newContent, result.sectionKey);
        }
      });
    } finally {
      setIsRewriting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineFix, editedExtraction, isRewriting, rewriteAttempts, callEditApi, runTypewriter]);

  // "Tell it what you want" — same machinery as handleRewriteFix but the
  // styleHint is the user's free-form instruction ("add more categories",
  // "quantify this", etc.) instead of a rotated preset.
  const handleCustomRewrite = useCallback(async (instruction: string) => {
    if (!inlineFix || !editedExtraction || isRewriting) return;
    const clean = instruction.trim();
    if (!clean) return;
    const { sectionKey, after: currentProposal, before, priorityIndex } = inlineFix;
    setIsRewriting(true);
    try {
      const nextAttempts = [...rewriteAttempts, currentProposal];
      // Critical: pass the user's words as the PRIMARY instruction — not as
      // styleHint. styleHint is a soft nudge the writer sometimes ignores.
      // userVerbatim flips the writer into "follow literally" mode.
      const result = await callEditApi(clean, editedExtraction, {
        previousAttempts: nextAttempts,
        lockedSectionKey: sectionKey,
        userVerbatim: true,
      });
      if (!result) return;
      result.sectionKey = sectionKey;
      setRewriteAttempts(nextAttempts);
      setInlineFix({
        sectionKey: result.sectionKey,
        before,
        after: result.newContent,
        action: clean,
        priorityIndex,
      });
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-section-key^="${CSS.escape(result.sectionKey)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => runTypewriter(result.newContent, result.sectionKey), 550);
        } else {
          runTypewriter(result.newContent, result.sectionKey);
        }
      });
    } finally {
      setIsRewriting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineFix, editedExtraction, isRewriting, rewriteAttempts, callEditApi, runTypewriter]);

  // "Apply in Resume Builder →" from main chat → queue the instruction here.
  // Wait until we have an extraction + runFixForAction is ready, then fire.
  // One-shot: clears after consumption so a stray re-render can't re-apply.
  useEffect(() => {
    if (!pendingInstruction) return;
    if (!editedExtraction) return;
    if (isEditStreaming || isRewriting || inlineFix) return; // don't collide
    const instr = pendingInstruction;
    // Defer one tick so React finishes any in-flight state before we kick
    // off the writer call.
    const id = setTimeout(() => {
      onPendingInstructionConsumed?.();
      runFixForAction(instr, -1);
    }, 0);
    return () => clearTimeout(id);
  // runFixForAction is stable via ref pattern; keep deps tight to avoid re-fires
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInstruction, editedExtraction]);

  // When a fix starts, pull the chat's pinned FixProgressCard into view so
  // the user sees WHICH priority is being worked on (pulsing purple row)
  // without having to scroll. Replaces the old "Fix ready — review in Edit
  // tab" banner. Scoped to priority-driven fixes only — ad-hoc Rewrite or
  // custom (priorityIndex < 0) doesn't have a progress card row to highlight.
  useEffect(() => {
    if (!inlineFix || inlineFix.priorityIndex < 0) return;
    const card = document.querySelector("[data-fix-progress-card]");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [inlineFix]);

  // ── Skills operations (surgical add/remove, bypasses the writer) ───────
  function persistWorkingCopy(next: ResumeExtraction) {
    setEditedExtraction(next);
    if (workingCopyId) {
      updateWorkingCopy({ workingCopyId, extraction: next })
        .then((ok) => {
          if (ok) {
            setSavedGhost(true);
            setTimeout(() => setSavedGhost(false), 1200);
          }
        })
        .catch((err) => console.error("[drive] save failed:", err));
    }
  }

  // AI-edit the section under the cursor. Called from the ✨ button that
  // appears next to the pencil on hover. Runs the standard fix flow with
  // the section locked so the writer can't drift. Default instruction is
  // tailored to the field type so the rewrite is actually useful.
  const handleAiEdit = useCallback((sectionKey: string) => {
    if (!editedExtraction || isEditStreaming || isRewriting) return;
    let instruction: string;
    if (sectionKey === "summary") {
      instruction = "Rewrite this professional summary — tighter, more specific, lead with a quantified credential, close on business impact. Keep it 2–3 sentences.";
    } else if (/^experience\.\d+\.bullets\.\d+$/.test(sectionKey)) {
      instruction = "Rewrite this bullet for stronger impact — quantify if possible, lead with a senior action verb, close on the business outcome. One line.";
    } else {
      instruction = "Improve this section — tighter, more specific, recruiter-legible.";
    }
    runFixForAction(instruction, -1, editedExtraction, { lockedSectionKey: sectionKey });
  }, [editedExtraction, isEditStreaming, isRewriting, runFixForAction]);

  // Manual edit — user typed into the textarea on a section directly (no AI).
  // Path resolver covers the two keys we support today: summary and a
  // specific experience bullet ("experience.{i}.bullets.{j}"). Unknown keys
  // are ignored silently — future keys can be added here.
  const handleManualEdit = useCallback((key: string, newText: string) => {
    if (!editedExtraction) return;
    const next: ResumeExtraction = structuredClone(editedExtraction);
    if (key === "summary") {
      next.summary = newText;
    } else {
      const m = key.match(/^experience\.(\d+)\.bullets\.(\d+)$/);
      if (m) {
        const i = Number(m[1]);
        const j = Number(m[2]);
        if (next.experience?.[i]?.bullets?.[j] !== undefined) {
          next.experience[i].bullets[j] = newText;
        } else {
          return;
        }
      } else {
        return; // unsupported key — bail
      }
    }
    pushToHistory(editedExtraction);
    persistWorkingCopy(next);
  }, [editedExtraction]);

  const handleAddSkill = useCallback((skill: string, categoryHint?: string) => {
    if (!editedExtraction) return;
    const trimmed = skill.trim();
    if (!trimmed) return;

    const groups = [...(editedExtraction.skillGroups ?? [])];
    // Find the matching category (case-insensitive) or create a new one
    let targetIdx = categoryHint
      ? groups.findIndex((g) => g.category.toLowerCase() === categoryHint.toLowerCase())
      : -1;

    if (targetIdx === -1 && categoryHint) {
      // New category
      groups.push({ category: categoryHint, skills: [trimmed] });
    } else if (targetIdx === -1) {
      // Nothing matched and no hint → dump into the first group
      if (groups.length === 0) groups.push({ category: "Skills", skills: [trimmed] });
      else if (!groups[0].skills.includes(trimmed)) {
        groups[0] = { ...groups[0], skills: [...groups[0].skills, trimmed] };
      }
    } else {
      if (!groups[targetIdx].skills.includes(trimmed)) {
        groups[targetIdx] = { ...groups[targetIdx], skills: [...groups[targetIdx].skills, trimmed] };
      }
    }

    pushToHistory(editedExtraction);
    persistWorkingCopy({ ...editedExtraction, skillGroups: groups });

    // If the added skill was suggested, dismiss it from the row
    setDismissedSuggestions((prev) => new Set([...prev, trimmed.toLowerCase()]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedExtraction, workingCopyId]);

  const handleRemoveSkill = useCallback((categoryIndex: number, skill: string) => {
    if (!editedExtraction) return;
    const groups = [...(editedExtraction.skillGroups ?? [])];
    if (!groups[categoryIndex]) return;
    const filtered = groups[categoryIndex].skills.filter((s) => s !== skill);
    if (filtered.length === 0) {
      groups.splice(categoryIndex, 1);
    } else {
      groups[categoryIndex] = { ...groups[categoryIndex], skills: filtered };
    }
    pushToHistory(editedExtraction);
    persistWorkingCopy({ ...editedExtraction, skillGroups: groups });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedExtraction, workingCopyId]);

  const handleDismissSuggestion = useCallback((skill: string) => {
    setDismissedSuggestions((prev) => new Set([...prev, skill.toLowerCase()]));
  }, []);

  // Build a case-insensitive set of skills already on the resume, including
  // common variants ("Apache Airflow" ↔ "Airflow", "AWS S3" ↔ "S3"). The
  // skills-gap model occasionally suggests a skill that's already present
  // under a slightly different name; we filter those out client-side as a
  // safety net on top of the prompt-side rule.
  const existingSkillsLC = useMemo(() => {
    const set = new Set<string>();
    const ext = editedExtraction ?? resumeExtraction;
    for (const g of ext?.skillGroups ?? []) {
      for (const s of g.skills ?? []) {
        const lc = s.toLowerCase().trim();
        if (!lc) continue;
        set.add(lc);
        // Strip common prefixes for variant matching
        set.add(lc.replace(/^apache\s+/, ""));
        set.add(lc.replace(/^aws\s+/, ""));
        set.add(lc.replace(/^google\s+cloud\s+/, ""));
        set.add(lc.replace(/^microsoft\s+/, ""));
      }
    }
    return set;
  }, [editedExtraction, resumeExtraction]);

  const visibleSuggestions = (skillsGap?.missing ?? []).filter((s) => {
    const lc = s.skill.toLowerCase().trim();
    if (dismissedSuggestions.has(lc)) return false;
    if (existingSkillsLC.has(lc)) return false;
    if (existingSkillsLC.has(lc.replace(/^apache\s+/, ""))) return false;
    if (existingSkillsLC.has(lc.replace(/^aws\s+/, ""))) return false;
    return true;
  });

  // Fix All kicks off the first pending fix. Auto-advance chains through the
  // rest — each one shows its own typewriter + ✓/✗ so the user approves each
  // change. No silent bulk-apply.
  const handleFixAll = useCallback(async () => {
    if (!editedExtraction || !resumeAnalysis || isEditStreaming) return;

    const allActions = resumeAnalysis.rewritePriorities;
    const firstPending = allActions.findIndex(
      (action, i) => !completedActions.has(i) && !isProtected(action)
    );
    if (firstPending === -1) return;

    // Pin the checklist into the chat so the user sees progress live.
    if (onPushAssistantMessage && !messages.some((m) => m.content === "__FIX_PROGRESS_CARD__")) {
      onPushAssistantMessage("__FIX_PROGRESS_CARD__");
    }

    // Capture the score before Fix All starts so the completion modal can show a delta
    if (!hasCelebratedCompletion && completionBaseScore === 0) {
      setCompletionBaseScore(deriveScore(resumeAnalysis));
    }
    // Mark the chain active so the Stop button stays visible across the
    // settle delays between individual fixes. Clear the abort flag in case a
    // prior stop left it true.
    fixAllAbortedRef.current = false;
    setFixAllActive(true);
    await runFixForAction(allActions[firstPending], firstPending, editedExtraction, { fromFixAll: true });
  }, [editedExtraction, resumeAnalysis, isEditStreaming, completedActions, runFixForAction, hasCelebratedCompletion, completionBaseScore, onPushAssistantMessage, messages]);

  // ── Accept All ─────────────────────────────────────────────────────
  // Chains through every pending priority, calls the writer for each,
  // applies the result to the working copy WITHOUT showing the per-fix
  // accept/reject UI. The user gets one confirm modal at the start,
  // then watches chat narrate progress while the panel updates live.
  // Different from handleFixAll, which still requires accept/reject on
  // every step.
  const [acceptAllRunning, setAcceptAllRunning] = useState(false);
  const acceptAllAbortedRef = useRef(false);
  const handleAcceptAll = useCallback(async () => {
    if (!editedExtraction || !resumeAnalysis || isEditStreaming || acceptAllRunning) return;
    const allActions = resumeAnalysis.rewritePriorities ?? [];
    if (allActions.length === 0) return;

    // One-shot confirm. Window.confirm is intentional — keeps the change
    // surface tiny while the feature stabilises. We can replace with a
    // proper modal once the flow is validated.
    const pending = allActions.filter((_, i) => !completedActions.has(i)).length;
    const ok = window.confirm(`Apply all ${pending} fixes? Each will be saved to your working copy. About ${Math.max(30, pending * 5)} seconds.`);
    if (!ok) return;

    setAcceptAllRunning(true);
    acceptAllAbortedRef.current = false;
    if (onPushAssistantMessage) {
      onPushAssistantMessage(`On it. Applying ${pending} fixes — I'll narrate each as it lands. Watch the right panel.`);
      if (!messages.some((m) => m.content === "__FIX_PROGRESS_CARD__")) {
        onPushAssistantMessage("__FIX_PROGRESS_CARD__");
      }
    }

    let working = editedExtraction;
    let applied = 0;
    let skipped = 0;
    const newAcceptedSections = new Set(acceptedSections);
    const newAcceptedIndices = new Set(acceptedIndices);
    const newCompletedActions = new Set(completedActions);

    for (let i = 0; i < allActions.length; i++) {
      if (acceptAllAbortedRef.current) break;
      if (completedActions.has(i)) continue;
      if (isProtected(allActions[i])) continue;

      const action = allActions[i];
      const lockedBullets = strongBulletKeys(working.experience);
      const result = await callEditApi(action, working, { lockedBullets });
      if (!result || result.sectionKey === "__not_applicable__" || isProtected(result.sectionKey)) {
        skipped++;
        newCompletedActions.add(i);
        if (onPushAssistantMessage) {
          onPushAssistantMessage(`Skipped fix ${i + 1} of ${allActions.length} — couldn't improve without more context.`);
        }
        continue;
      }
      if (newAcceptedSections.has(result.sectionKey)) {
        // Don't double-edit a section already accepted earlier in the chain.
        skipped++;
        newCompletedActions.add(i);
        continue;
      }
      // Apply the section change to the working copy.
      const next = applyEdit(working, result.sectionKey, result.newContent);
      working = next;
      newAcceptedSections.add(result.sectionKey);
      newAcceptedIndices.add(i);
      newCompletedActions.add(i);
      applied++;

      // Persist to Drive immediately so a refresh mid-chain doesn't lose
      // progress. The persistWorkingCopy helper handles the localStorage
      // bookkeeping for us.
      persistWorkingCopy(next);
      setAcceptedSections(new Set(newAcceptedSections));
      setAcceptedIndices(new Set(newAcceptedIndices));
      setCompletedActions(new Set(newCompletedActions));

      if (onPushAssistantMessage) {
        const pts = action.toUpperCase().startsWith("HIGH") ? 4 : action.toUpperCase().startsWith("MEDIUM") ? 2 : 1;
        const newScore = deriveScore({ ...resumeAnalysis });
        onPushAssistantMessage(`Fix ${i + 1} of ${allActions.length}: applied. +${pts} pts. Score now ${newScore + applied}.`);
      }
    }

    setIsEditStreaming(false);
    setEditingSection(null);
    setAcceptAllRunning(false);
    setIsRewriting(false);

    if (onPushAssistantMessage) {
      const finalScore = deriveScore(resumeAnalysis) + applied * 2;
      onPushAssistantMessage(
        `Done. Applied ${applied}${skipped ? `, skipped ${skipped}` : ""}. Score is roughly ${Math.min(100, finalScore)} now. Open the Rewrite tab to download.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedExtraction, resumeAnalysis, isEditStreaming, acceptAllRunning, completedActions, acceptedSections, acceptedIndices, callEditApi, onPushAssistantMessage, messages]);

  // ── Chat-first orchestrator: tool dispatch ────────────────────────
  // The parent forwards tool_use blocks from the streaming orchestrator
  // response. Each tool maps to an existing handler. We consume the event
  // by calling onChatToolConsumed once dispatched.
  useEffect(() => {
    if (!pendingChatTool) return;
    const { name, input } = pendingChatTool;

    try {
      switch (name) {
        case "show_panel": {
          const tab = input.tab as PanelTab | undefined;
          const validTabs: PanelTab[] = ["resume", "report", "edit", "rewrite"];
          if (tab && validTabs.includes(tab)) {
            setIsPanelOpen(true);
            setActiveTab(tab);
            // Restore tab if user had dismissed it
            setClosedTabs((prev) => {
              if (!prev.has(tab)) return prev;
              const next = new Set(prev);
              next.delete(tab);
              return next;
            });
          }
          break;
        }
        case "highlight_section": {
          const sectionKey = input.section_key as string | undefined;
          if (!sectionKey) break;
          setIsPanelOpen(true);
          setActiveTab("resume");
          requestAnimationFrame(() => {
            const el = document.querySelector(`[data-section-key^="${CSS.escape(sectionKey)}"]`) as HTMLElement | null;
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.remove("stackle-fix-flash");
              void el.offsetHeight;
              el.classList.add("stackle-fix-flash");
              setTimeout(() => el.classList.remove("stackle-fix-flash"), 1200);
            }
          });
          break;
        }
        case "apply_fix": {
          const instruction = (input.instruction as string | undefined) ?? "";
          const priorityIndex = typeof input.priority_index === "number" ? input.priority_index : -1;
          if (instruction && !isEditStreaming) {
            runFixForAction(instruction, priorityIndex);
          }
          break;
        }
        case "apply_all_fixes": {
          if (!isEditStreaming) handleFixAll();
          break;
        }
        case "rewrite_section": {
          const section = input.section as string | undefined;
          const styleHint = input.style_hint as string | undefined;
          if (section && !isEditStreaming) {
            const instr = styleHint
              ? `Rewrite the ${section} section in a ${styleHint} tone.`
              : `Rewrite the ${section} section.`;
            runFixForAction(instr, -1, undefined, { lockedSectionKey: section });
          }
          break;
        }
        case "open_rewrite_all": {
          setIsPanelOpen(true);
          setActiveTab("rewrite");
          break;
        }
        case "compare_versions": {
          setShowCompletionModal(true);
          break;
        }
        case "set_style_preference": {
          // Parent stores it in conversationState; we just toast a confirmation.
          const style = input.style as string | undefined;
          if (style) {
            toasts.push({ kind: "success", text: `Got it — ${style} style noted for next rewrites.`, durationMs: 2800 });
          }
          break;
        }
        case "undo_last": {
          toasts.push({ kind: "info", text: "Use ⌘Z to undo the last accepted edit.", durationMs: 2500 });
          break;
        }
        case "tailor_for_jd": {
          // JD-to-Resume Phase 1. Two-step pipeline:
          // 1) Haiku JD Analyzer extracts {company, role, seniority, ...}
          // 2) Opus rewrite-all generates the tailored extraction with the
          //    JD passed as jobDescription
          // Result saved to Drive as a 'version' file named "{Company}_{Role}.docx"
          // and surfaced in chat with download chips.
          const jdText = (input.jd_text as string | undefined) ?? "";
          if (!jdText.trim() || !resumeExtraction) {
            toasts.push({ kind: "warn", text: "Need both a resume and a JD to tailor." });
            break;
          }
          if (onPushAssistantMessage) onPushAssistantMessage("Reading the JD…");
          tailorForJD(jdText).catch((err) => {
            console.error("[tailor_for_jd]", err);
            if (onPushAssistantMessage) onPushAssistantMessage("Hit a snag generating the tailored version. Try again?");
          });
          break;
        }
        case "tailor_for_jd_url": {
          // JD-to-Resume Phase 2. Three-step pipeline:
          // 0) Scrape the URL (best-effort for Greenhouse/Lever/Ashby/generic;
          //    JS-heavy sites return needsManual=true with an honest error)
          // 1+2) Same as tailor_for_jd from there.
          const url = (input.url as string | undefined) ?? "";
          if (!url.trim() || !resumeExtraction) {
            toasts.push({ kind: "warn", text: "Need both a resume and a URL to tailor." });
            break;
          }
          if (onPushAssistantMessage) onPushAssistantMessage("Fetching the JD…");
          tailorForJDUrl(url).catch((err) => {
            console.error("[tailor_for_jd_url]", err);
            if (onPushAssistantMessage) onPushAssistantMessage("Hit a snag fetching that URL. Try pasting the JD text instead?");
          });
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.warn("[chat-tool] dispatch failed:", err);
    } finally {
      onChatToolConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChatTool]);

  // JD-to-Resume Phase 1 — async pipeline triggered by the tailor_for_jd tool.
  async function tailorForJD(jdText: string) {
    if (!resumeExtraction || !resumeAnalysis) return;
    // 1. Analyze the JD (Haiku, ~3s).
    const aRes = await fetch("/api/agents/jd/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jdText }),
    });
    if (!aRes.ok) {
      onPushAssistantMessage?.("Couldn't read the JD. Try pasting more text or check formatting.");
      return;
    }
    const { analysis } = await aRes.json() as { analysis: { company: string | null; role: string; seniority: string; redFlags: string[] } };
    const companyLabel = analysis.company ?? "the role";
    const roleLabel = analysis.role || "Senior position";
    onPushAssistantMessage?.(`Got it. ${roleLabel} at ${companyLabel} — ${analysis.seniority} level. Generating tailored version…`);

    // 2. Run rewrite-all with the JD passed in (Opus, ~30-60s).
    const rRes = await fetch("/api/agents/resume/rewrite-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extraction: resumeExtraction,
        analysis: resumeAnalysis,
        targetRole: roleLabel,
        jobDescription: jdText,
      }),
    });
    if (!rRes.ok) {
      onPushAssistantMessage?.("Generation failed. Try again in a moment?");
      return;
    }
    const { extraction: tailored, changedKeys } = await rRes.json() as { extraction: ResumeExtraction; changedKeys: string[] };

    // 3. Save to Drive as a version file with company-named display_name.
    const safeName = (s: string) => s.replace(/[\/\\:*?"<>|]+/g, "").replace(/\s+/g, "_").slice(0, 40);
    const displayName = analysis.company
      ? `${safeName(analysis.company)}_${safeName(roleLabel)}.docx`
      : `${safeName(roleLabel)}_v1.docx`;
    if (chatId && originalDriveFileId) {
      try {
        const { saveTailoredVersion } = await import("@/lib/supabase/drive");
        await saveTailoredVersion({
          parentId: originalDriveFileId,
          chatId,
          extraction: tailored,
          displayName,
          targetRole: roleLabel,
          candidateName: tailored.name,
        });
        await refreshDriveFiles();
      } catch (err) {
        console.warn("[tailor_for_jd] Drive save failed:", err);
      }
    }

    // 4. Apply to working extraction so the user sees it in the panel + persist.
    setEditedExtraction(tailored);
    persistWorkingCopy(tailored);
    onUpdateExtraction(tailored);

    // 5. Narrate what changed in chat.
    const changeCount = (changedKeys ?? []).length;
    const summaryLines = [
      `Done — saved as **${displayName}** in your Drive.`,
      changeCount > 0 ? `Tailored ${changeCount} section${changeCount !== 1 ? "s" : ""} for the ${roleLabel} role.` : "Resume is now tuned for this JD.",
      "",
      `__INLINE_CHIPS__:Open in Editor|Download PDF|Tailor another JD`,
    ];
    onPushAssistantMessage?.(summaryLines.slice(0, 2).join("\n\n"));
    onPushAssistantMessage?.(summaryLines[3]);
    setActiveTab("rewrite");
  }

  // JD-to-Resume Phase 2 — fetch URL → extract JD text → fall through to tailorForJD.
  async function tailorForJDUrl(url: string) {
    const sRes = await fetch("/api/agents/jd/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!sRes.ok) {
      onPushAssistantMessage?.("Couldn't reach that URL — try pasting the JD text instead.");
      return;
    }
    const data = await sRes.json() as
      | { ok: true; jdText: string; sourcePlatform: string; sourceUrl: string; cached: boolean }
      | { ok: false; sourcePlatform: string; sourceUrl: string; error: string; needsManual: boolean };

    if (!data.ok) {
      onPushAssistantMessage?.(`${data.error} Paste the JD text and I'll tailor from there.`);
      return;
    }

    const cachedTag = data.cached ? " (cached)" : "";
    onPushAssistantMessage?.(`Got it from ${data.sourcePlatform}${cachedTag}. Reading the JD…`);
    return tailorForJD(data.jdText);
  }

  // ── Global keyboard shortcuts ─────────────────────────────────────
  // Enter    → Accept the current inline fix (when buttons are visible)
  // Escape   → Reject the current inline fix
  // ⌘/Ctrl+Z → Undo the last accepted edit
  // ⌘/Ctrl+⇧Z → Redo (not yet wired — placeholder no-op)
  // ⌘/Ctrl+⇧F → Fix All from anywhere
  // Shortcuts are suppressed while the user is focused in an input / textarea
  // so they don't hijack typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inTextField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      // Accept / Reject when a fix is visible and not still typing
      if (inlineFix && !isRewriting && !isEditStreaming) {
        if (e.key === "Enter" && !inTextField && !mod) {
          e.preventDefault();
          handleAcceptFix();
          return;
        }
        if (e.key === "Escape" && !inTextField) {
          e.preventDefault();
          handleRejectFix();
          return;
        }
      }

      // ⌘Z undo — only when Edit tab is visible and no fix in flight.
      // Priority: undo the skills auto-regroup first (it's the most recent
      // "thing that just happened to you without you asking") if present.
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey && !inTextField) {
        if (skillsRegroupSnapshot && editedExtraction && !inlineFix) {
          e.preventDefault();
          const restored: ResumeExtraction = { ...editedExtraction, skillGroups: skillsRegroupSnapshot };
          setSkillsRegroupSnapshot(null);
          persistWorkingCopy(restored);
          toasts.push({ kind: "info", text: "Restored your original skill groups." });
          return;
        }
        if (activeTab === "edit" && editHistory.length > 0 && !inlineFix) {
          e.preventDefault();
          handleUndo();
        }
      }

      // ⌘⇧F — Fix All
      if (mod && e.shiftKey && e.key.toLowerCase() === "f" && !inTextField) {
        if (resumeAnalysis) {
          e.preventDefault();
          handleFixAll();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineFix, isRewriting, isEditStreaming, activeTab, editHistory.length, resumeAnalysis]);

  function handleChipAction(
    label: string,
    chips: { instruction: string; sectionKey: string; newText: string; priorityIndex: number }
  ) {
    if (label === "Keep it") {
      if (editedExtraction) {
        onUpdateExtraction(editedExtraction);
        // Finalize the version in drive
        if (chatId && originalDriveFileId && workingCopyId && resumeAnalysis) {
          setDriveEditingState("saving");
          finalizeVersion({
            workingCopyId,
            extraction: editedExtraction,
            targetRole: resumeAnalysis.likelyTargetRole ?? "Edited",
            parentId: originalDriveFileId,
          }).then(() => {
            setWorkingCopyId(null);
            setDriveEditingState("idle");
            refreshDriveFiles();
          });
        }
      }
    } else if (label === "Try different version") {
      handleFixItem(chips.instruction, chips.priorityIndex);
    } else if (label === "Undo") {
      handleUndo();
    } else if (label === "Move to next") {
      if (editedExtraction) onUpdateExtraction(editedExtraction);
      const actions = resumeAnalysis?.rewritePriorities ?? [];
      const nextIndex = chips.priorityIndex + 1;
      if (nextIndex < actions.length) {
        handleFixItem(actions[nextIndex], nextIndex);
      }
    }
  }

  // ── Sharing state ────────────────────────────────────────────────
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);
  // When the cover letter is opened from JD-match, we pre-fill these so the
  // modal lands on a populated state. Reset to null on close.
  const [coverLetterPrefill, setCoverLetterPrefill] = useState<{
    companyName?: string;
    roleTitle?: string;
    jobDescription?: string;
  } | null>(null);
  const [jdMatchOpen, setJdMatchOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Single source of truth — see lib/score.ts. Removes the per-component
  // heuristic that diverged between Edit / Rewrite / Welcome / Report.
  const deriveScore = deriveScoreFromAnalysis;

  async function handleDownloadDocx() {
    if (!resumeAnalysis || isDownloadingDocx) return;
    setIsDownloadingDocx(true);
    try {
      const res = await fetch("/api/reports/generate-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: resumeAnalysis,
          candidateName: resumeExtraction?.name ?? "Candidate",
        }),
      });
      if (!res.ok) throw new Error("Failed to generate docx");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = resumeExtraction?.name?.replace(/[^a-zA-Z0-9]/g, "_") ?? "Resume";
      a.href = url;
      a.download = `${name}_Resume_Review.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingDocx(false);
    }
  }

  async function handleDownload() {
    if (!reportRef.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const name = resumeExtraction?.name ?? "Resume";
      await html2pdf()
        .set({
          margin: 0,
          filename: `${name}-Resume-Report-Stackle.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#0e0e0f" },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(reportRef.current)
        .save();
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleCopyLink() {
    if (!resumeAnalysis || isCopying) return;
    setIsCopying(true);
    try {
      const score = deriveScore(resumeAnalysis);
      const res = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_data: resumeAnalysis,
          extraction_data: resumeExtraction,
          candidate_name: resumeExtraction?.name ?? null,
          score,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const url = `${window.location.origin}/report/${json.id}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } finally {
      setIsCopying(false);
    }
  }

  // Peer-review share — encode the current resume extraction into a URL hash
  // so the recipient sees a read-only copy without needing any server or auth.
  // Good for "what do you think?" among mentors/friends. NOT for sensitive data.
  async function handleShareReviewLink() {
    const source = editedExtraction ?? resumeExtraction;
    if (!source) return;
    try {
      // base64(utf-8) the extraction, stuff it in the hash
      const json = JSON.stringify(source);
      // encodeURIComponent + escape + btoa handles UTF-8 safely
      const encoded = btoa(unescape(encodeURIComponent(json)));
      const url = `${window.location.origin}/shared-resume#d=${encoded}`;
      if (url.length > 16000) {
        alert("Resume is too large to share via URL. Try the PDF download instead.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setIsSavedReportToDrive(true); // reuse the "copied" toast
      setTimeout(() => setIsSavedReportToDrive(false), 2400);
    } catch (err) {
      console.error("[share] peer-review link failed:", err);
      alert("Couldn't copy the link. Try again.");
    }
    setShareOpen(false);
  }

  async function handleShare(target: "linkedin" | "email") {
    if (!resumeAnalysis) return;
    const score = deriveScore(resumeAnalysis);
    const name = resumeExtraction?.name ?? "My";

    // Get or create a shareable link first
    let url = window.location.href;
    try {
      const res = await fetch("/api/reports/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_data: resumeAnalysis,
          extraction_data: resumeExtraction,
          candidate_name: resumeExtraction?.name ?? null,
          score,
        }),
      });
      const json = await res.json();
      if (res.ok) url = `${window.location.origin}/report/${json.id}`;
    } catch { /* use current url */ }

    if (target === "linkedin") {
      const caption = encodeURIComponent(
        `Just reviewed my resume with Stackle and scored ${score}/100. Here's the full breakdown → ${url}`
      );
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${caption}`, "_blank");
    } else {
      const subject = encodeURIComponent(`${name}'s Resume Review — ${score}/100 on Stackle`);
      const body = encodeURIComponent(`Hey,\n\nI just ran my resume through Stackle and got a score of ${score}/100. Check out the full report here:\n\n${url}\n\n— Stackle`);
      window.open(`mailto:?subject=${subject}&body=${body}`);
    }
    setShareOpen(false);
  }

  // External signal to open report panel (from sidebar)
  useEffect(() => {
    if (openReportSignal && openReportSignal > 0 && resumeAnalysis) {
      setIsPanelOpen(true);
      setActiveTab("report");
      setReportIsNew(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReportSignal]);

  // Auto-open panel when extraction first arrives. If the analysis is
  // already present (user just finished onboarding and lands here), open
  // the Report tab — that's the wow moment they expect. Otherwise default
  // to the Resume preview tab.
  // No auto-open. Panel only opens when the user explicitly asks for the
  // report (clicks the chip / picks Resume Review / asks in chat). Showing
  // it unprompted is jarring — the chat is the conversation, the panel is
  // the artifact. User stays in control of when artifact appears.
  // (Effect intentionally removed.)

  // When analysis arrives, DON'T auto-switch to Report — that was annoying.
  // Just mark Report as "new" so the tab has a small dot indicating fresh
  // content. The user opens it when they want it. Panel stays on the Resume
  // tab (or whichever tab they had open) so they keep seeing their document.
  useEffect(() => {
    if (resumeAnalysis) {
      setReportIsNew(true);
    }
  }, [resumeAnalysis]);

  // Reset when there's no resume (new conversation)
  useEffect(() => {
    if (!resumeExtraction && !resumeAnalysis) {
      setIsPanelOpen(false);
      didAutoOpenForExtraction.current = false;
      setReportIsNew(false);
    }
  }, [resumeExtraction, resumeAnalysis]);

  // Available tabs — appear only when content exists
  // Once a version is finalized in this session, swap the Edit tab label for
  // the version's name (truncated). That one tab label is the cleanest signal
  // that "this is the resume now", not "a working copy of the original".
  // Redistribute accepted-fix points into the category bars so the Report
  // and scorecard actually move as the user accepts fixes. Without this,
  // only the top-line total updates via acceptedPoints while the category
  // scores stay frozen at the original analysis values.
  const effectiveAnalysis = useMemo(
    () => analysisWithAccepted(resumeAnalysis, resumeAnalysis?.rewritePriorities, acceptedIndices),
    [resumeAnalysis, acceptedIndices],
  );

  const editTabLabel = lastFinalizedName
    ? lastFinalizedName.length > 22 ? `${lastFinalizedName.slice(0, 21)}…` : lastFinalizedName
    : "Edit";
  const allTabs: { key: PanelTab; label: string; icon: typeof FileText }[] = [
    ...(resumeExtraction ? [{ key: "resume" as PanelTab, label: "Resume", icon: FileText }] : []),
    ...(resumeAnalysis ? [{ key: "report" as PanelTab, label: "Report", icon: ClipboardList }] : []),
    ...(resumeAnalysis ? [{ key: "edit" as PanelTab, label: editTabLabel, icon: Pencil }] : []),
    ...(resumeAnalysis ? [{ key: "rewrite" as PanelTab, label: "Rewrite", icon: Sparkles }] : []),
  ];
  const availableTabs = allTabs.filter((t) => !closedTabs.has(t.key));
  const hasHiddenTabs = allTabs.length > availableTabs.length;

  // Close a tab. If it was the active one, jump to the first remaining tab.
  // If nothing's left, collapse the whole panel so the user isn't staring at
  // an empty strip — the "Restore" chip brings it all back.
  function handleCloseTab(key: PanelTab) {
    setClosedTabs((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (activeTab === key) {
      const first = allTabs.find((t) => t.key !== key && !closedTabs.has(t.key));
      if (first) setActiveTab(first.key);
      else setIsPanelOpen(false);
    }
  }

  function handleRestoreTabs() {
    setClosedTabs(new Set());
  }

  // Score for Edit tab banner — derives from effectiveAnalysis (post-accepted
  // priorities) so Edit / Report / Rewrite all show the same current number
  // for the same analysis run. Welcome chat message is frozen at first-fire
  // (historical, expected) — every other live surface tracks effectiveAnalysis.
  const baseScore = deriveScore(effectiveAnalysis);
  const currentEditScore = Math.min(100, baseScore + Math.min(editHistory.length * 3, 15));

  // Panel content gate. Strict: require analysis to be ready before the
  // panel + toggle button materialise. The post-upload calibration phase
  // shows ONE column — chat only — until "Done reading. Here's where
  // you stand." lands and analysis populates. Eliminates the
  // empty/loading panel that looked broken.
  const hasPanelContent = !!resumeAnalysis;

  // ── Chat panel ──────────────────────────────────────────────────
  const chatPanel = (
    <div
      className={`flex flex-col min-h-0 rb-chat-panel ${isPanelOpen ? "rb-chat-panel-open" : ""} ${mobileView === "panel" ? "hidden md:flex" : "flex"}`}
      style={{
        // 25/75 split — narrow chat rail, wide workspace canvas.
        width: isPanelOpen ? "25%" : "100%",
        transition: "width 300ms ease",
        minWidth: 0,
      }}
    >
      {/* Mobile tab bar */}
      {hasPanelContent && (
        <div className="flex md:hidden bg-white px-3 pt-2 pb-1 gap-1">
          {(["chat", "panel"] as const).map((view) => {
            const isActive = mobileView === view;
            const label = view === "chat" ? "Chat" : "Workspace";
            return (
              <button
                key={view}
                onClick={() => setMobileView(view)}
                className="relative flex items-center justify-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-all"
                style={{
                  background: isActive ? "#1a1a1a" : "transparent",
                  color: isActive ? "#fff" : "#555",
                  border: isActive ? "1px solid #2a2a2a" : "1px solid transparent",
                  borderBottom: isActive ? "1px solid #1a1a1a" : "1px solid transparent",
                  marginBottom: isActive ? "-1px" : "0",
                }}
              >
                {label}
                {view === "panel" && reportIsNew && mobileView !== "panel" && (
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {messages.length === 0 && !resumeText ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-16 gap-6 select-none">
          {/* Logo mark */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-black text-lg font-bold animate-pulse"
            style={{ background: "linear-gradient(135deg, #fff7ad, #ffa9f9)", animationDuration: "3s" }}
          >
            S
          </div>
          {/* Headline */}
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2 tracking-tight">Drop your resume, get your score.</h2>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
              Upload a PDF or DOCX below — get a full breakdown in under 30 seconds.
            </p>
          </div>
          {/* Capability pills */}
          <div className="flex flex-wrap gap-2 justify-center max-w-xs">
            {[
              { icon: "📊", label: "5-Category Score" },
              { icon: "🎯", label: "Keyword Gaps" },
              { icon: "📝", label: "Action Plan" },
              { icon: "⚡", label: "ATS Check" },
            ].map(({ icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-500"
              >
                <span>{icon}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {/* Upload hint */}
          <p className="text-xs text-gray-600 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3 4l3-3 3 3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Use the attach button below to upload
          </p>
        </div>
      ) : (
        <ChatWindow
          messages={messages}
          isLoading={isLoading || isAnalyzingResume}
          loadingLabel={isAnalyzingResume && !isLoading ? "Analysing resume" : undefined}
          resumeAnalysis={effectiveAnalysis}
          marketAnalysis={null}
          resumePreview={null}
          resumeExtraction={resumeExtraction}
          onSend={onSendMessage}
          onFixItem={handleFixItem}
          onFixAll={handleFixAll}
          completedActions={completedActions}
          completedFixes={completedActions}
          acceptedFixes={acceptedIndices}
          currentFixIndex={inlineFix?.priorityIndex ?? null}
          onOpenReport={() => { setIsPanelOpen(true); setActiveTab("report"); setReportIsNew(false); }}
          isReportOpen={isPanelOpen && activeTab === "report"}
          resumeScore={deriveScore(effectiveAnalysis)}
          acceptedPoints={0}
          resumeBuilderMode
          onStarterPromptClick={onInputChange}
          onChatEditPrompt={(text) => {
            // Action chips → fire the real handler directly. Everything
            // else → send to chat. Avoids the bug where "Apply all fixes"
            // produced narration only with no actual mutation.
            const t = text.trim().toLowerCase();
            if (t === "apply all fixes") {
              handleAcceptAll();
              return;
            }
            if (t === "walk me through fixes" || t === "guide me through fixes") {
              handleFixAll();
              return;
            }
            // Context replies (chip text not matching any action) just go
            // through chat. Rewrites only fire from explicit Fix buttons.
            onSendMessage(text);
          }}
          onEditUserMessage={onEditUserMessage}
        />
      )}

      {/* ── Fix Flow Overlay ──
          The "why" intermediate panel was removed so the flow goes straight
          from Fix click → typewriter → Accept/Rewrite/Reject. Only the
          "loading" state remains to signal the writer call is in flight. */}
      {fixFlow && fixFlow.step === "loading" && (
        <div className="mx-4 mb-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-[#a99af9] border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <span className="text-xs text-gray-500">Generating improved version…</span>
        </div>
      )}

      {/* "Fix ready" banner removed — the pinned FixProgressCard in chat with
          its pulsing in-progress dot already signals what's happening, and the
          section flash + scroll-into-view on the resume itself shows the
          actual change. No need for a third signal saying the same thing. */}

      {/* Score toast */}
      {scoreToast && (
        <div
          className="mx-4 mb-2 px-4 py-2.5 rounded-xl flex items-center gap-2.5 pointer-events-none relative overflow-visible"
          style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", animation: "fadeIn 300ms ease" }}
        >
          <span className={`text-green-700 text-base ${confettiBurst ? "stackle-score-pulse" : ""}`}>✓</span>
          <span className={`text-xs font-semibold text-green-800 ${confettiBurst ? "stackle-score-pulse" : ""}`}>
            Fix accepted — +{scoreToast.pts} pts added to your score
          </span>
          {savedGhost && (
            <span className="ml-auto text-[10px] text-green-500/80 italic tracking-wider">· saved</span>
          )}
          {/* First-accept confetti burst */}
          {confettiBurst && (
            <div className="absolute inset-0 pointer-events-none">
              {Array.from({ length: 18 }).map((_, i) => {
                const angle = (i / 18) * Math.PI * 2;
                const dist = 60 + Math.random() * 50;
                const x = Math.cos(angle) * dist;
                const y = Math.sin(angle) * dist - 20;
                const colors = ["#4fc9a4", "#a99af9", "#fff7ad", "#ffa9f9", "#86efac"];
                const bg = colors[i % colors.length];
                return (
                  <span
                    key={`${confettiBurst.id}-${i}`}
                    className="stackle-confetti-piece"
                    style={{
                      background: bg,
                      ["--x" as string]: `${x}px`,
                      ["--y" as string]: `${y}px`,
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="relative px-4 pb-4 pt-2">
        {/* Soft fade so the last message doesn't butt up against the input.
            Was a hard dark gradient (#0d0d0d) from when the app was dark-themed —
            that read as a black band on light bg. Now subtle white fade. */}
        <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        <ChatInput
          value={input}
          onChange={onInputChange}
          onSend={onSend}
          disabled={isLoading}
          busy={isEditStreaming || isRewriting || editingSection !== null || isLoading || fixAllActive}
          onStop={() => {
            // Abort any in-flight writer call, cancel the typewriter,
            // tear down the inline fix so the resume re-renders clean.
            // Also break the Fix All chain so queued fixes don't fire.
            // Also tell the parent to cancel the main chat agent if it's
            // running (chat message send hit the orchestrate/synthesize path).
            activeEditAbortRef.current?.abort();
            activeEditAbortRef.current = null;
            typewriterAbort.current = true;
            fixAllAbortedRef.current = true;
            setFixAllActive(false);
            setIsEditStreaming(false);
            setIsRewriting(false);
            setEditingSection(null);
            setTypewriterContent("");
            setInlineFix(null);
            setRewriteAttempts([]);
            onStopAgent?.();
          }}
          onFileUpload={onFileUpload}
          placeholder="Ask anything about your resume..."
        />
      </div>

      {/* Completion modal — fires once the Fix cycle exhausts with ≥3 accepted */}
      {coverLetterOpen && (
        <CoverLetterModal
          extraction={editedExtraction ?? resumeExtraction ?? null}
          defaultRole={resumeAnalysis?.likelyTargetRole ?? null}
          prefillCompany={coverLetterPrefill?.companyName}
          prefillRole={coverLetterPrefill?.roleTitle}
          prefillJobDescription={coverLetterPrefill?.jobDescription}
          onClose={() => { setCoverLetterOpen(false); setCoverLetterPrefill(null); }}
        />
      )}

      {jdMatchOpen && (
        <JDMatchModal
          extraction={editedExtraction ?? resumeExtraction ?? null}
          onClose={() => setJdMatchOpen(false)}
          onApplyRewrite={(sectionKey, instruction) => {
            // Route the targeted rewrite into the existing fix flow with the
            // section locked so the writer can't drift. Same path as the
            // chat's "Apply in Resume Builder" sentinel.
            runFixForAction(instruction, -1, undefined, { lockedSectionKey: sectionKey });
          }}
          onOpenCoverLetter={(input) => {
            setCoverLetterPrefill(input);
            setJdMatchOpen(false);
            setCoverLetterOpen(true);
          }}
        />
      )}

      {showCompletionModal && resumeAnalysis && (
        <ResumeCompletionModal
          baseScore={completionBaseScore || deriveScore(resumeAnalysis)}
          // finalScore must reflect what the user is seeing in the Edit tab
          // banner. Two paths can move the score: (1) accepted PRIORITIES
          // (tracked in acceptedIndices) bump the analysis directly via
          // analysisWithAccepted, (2) any edit (priority or direct AI rewrite)
          // adds editHistory entries and earns up to +15 from currentEditScore.
          // Take whichever is higher so the modal never under-reports vs. the
          // banner the user just looked at.
          finalScore={Math.max(deriveScore(effectiveAnalysis), currentEditScore)}
          accepted={acceptedPoints > 0 ? completedActions.size - rejectedCount : 0}
          rejected={rejectedCount}
          signalsHit={{
            trust: acceptedPoints > 0,
            voice: acceptedPoints >= 3,
            scoreMoved: acceptedPoints >= 5,
            targeted: !!resumeAnalysis.likelyTargetRole,
            formatSafe: true, // PDF export works, print stylesheet in place
            secondOpinion: false, // flips to true when peer-review link copied
            versioned: false, // flips when Save as version fires
          }}
          isSaving={driveEditingState === "saving"}
          suggestedName={(() => {
            const role = resumeAnalysis?.likelyTargetRole?.trim();
            const firstName = (editedExtraction?.name ?? resumeExtraction?.name ?? "").trim().split(/\s+/)[0];
            // v-number is best-effort: if we've already finalized in this
            // session, bump; otherwise start at v1. User can rename freely.
            const v = lastFinalizedName ? 2 : 1;
            if (role) return `${role} — v${v}`;
            if (firstName) return `${firstName}'s Resume v${v}`;
            return `Resume v${v}`;
          })()}
          onSaveAsVersion={async (name: string) => {
            if (chatId && originalDriveFileId && workingCopyId && editedExtraction && resumeAnalysis) {
              setDriveEditingState("saving");
              const targetRole = resumeAnalysis.likelyTargetRole ?? "Edited";
              await finalizeVersion({
                workingCopyId,
                extraction: editedExtraction,
                targetRole,
                parentId: originalDriveFileId,
                customDisplayName: name,
              });
              setLastFinalizedName(name);
              setWorkingCopyId(null);
              setDriveEditingState("idle");
              await refreshDriveFiles();
            } else {
              // Even without drive wiring, remember the name so tab label +
              // filename + re-open greeting still reflect the user's intent.
              setLastFinalizedName(name);
            }
            setHasCelebratedCompletion(true);
            setShowCompletionModal(false);
            onUpdateExtraction(editedExtraction ?? resumeExtraction!);
          }}
          onDownloadPdf={() => {
            setShowCompletionModal(false);
            handleDownloadResume();
          }}
          onCopyShareLink={() => {
            handleShareReviewLink();
          }}
          onWriteCoverLetter={() => {
            setShowCompletionModal(false);
            setCoverLetterOpen(true);
          }}
          onCompareWithOriginal={resumeExtraction && editedExtraction ? () => {
            setShowCompareModal(true);
          } : undefined}
          onKeepEditing={() => {
            setShowCompletionModal(false);
          }}
        />
      )}

      {showCompareModal && resumeExtraction && editedExtraction && (
        <SideBySideCompareModal
          original={resumeExtraction}
          working={editedExtraction}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </div>
  );

  // ── Right workspace panel ────────────────────────────────────────
  const workspacePanel = (
    <div
      className={`flex-col min-h-0 bg-white overflow-hidden rb-workspace-panel ${isPanelOpen ? "rb-workspace-panel-open" : ""}
        ${mobileView === "panel" ? "flex flex-1" : "hidden md:flex"}`}
      style={{
        // 25/75 split.
        width: isPanelOpen ? "75%" : "0",
        minWidth: isPanelOpen ? "0" : "0",
        transition: "width 300ms ease",
        flexShrink: 0,
        boxShadow: isPanelOpen ? "inset 1px 0 0 rgba(0, 0, 0, 0.04)" : "none",
      }}
    >
      {isPanelOpen && (
        <>
          {/* Panel header — tabs + action buttons + X. Floating tabs, no
              underline beneath the tab strip (Lovable / Linear pattern). */}
          <div className="flex items-center px-3 pt-2 pb-1 flex-shrink-0 bg-white gap-1">
            <div className="flex flex-1 overflow-x-auto items-center">
              {availableTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <div
                    key={tab.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveTab(tab.key);
                      if (tab.key === "report") setReportIsNew(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActiveTab(tab.key);
                        if (tab.key === "report") setReportIsNew(false);
                      }
                    }}
                    className={`group relative flex items-center gap-1.5 pl-4 pr-2 py-2.5 text-sm font-medium transition-colors whitespace-nowrap rounded-t-lg flex-shrink-0 cursor-pointer ${
                      isActive
                        ? "text-gray-900 bg-gray-100 border border-gray-200 border-b-[#1a1a1a]"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    {tab.label}
                    {tab.key === "report" && reportIsNew && (
                      <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.key); }}
                      title={`Close ${tab.label}`}
                      aria-label={`Close ${tab.label} tab`}
                      className={`ml-1 w-4 h-4 flex items-center justify-center rounded-sm transition-opacity hover:bg-gray-200 ${
                        isActive ? "text-gray-500 hover:text-gray-900 opacity-70 hover:opacity-100" : "text-gray-600 hover:text-gray-900 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <X className="w-3 h-3" strokeWidth={2.25} />
                    </button>
                  </div>
                );
              })}
              {hasHiddenTabs && (
                <button
                  type="button"
                  onClick={handleRestoreTabs}
                  className="ml-2 text-[10px] font-semibold text-gray-600 hover:text-gray-900 border border-dashed border-gray-200 hover:border-gray-300 rounded px-2 py-1 transition-colors flex-shrink-0"
                  title="Show tabs you've closed"
                >
                  + Restore tabs
                </button>
              )}
            </div>

            {/* Resume tab action buttons */}
            {activeTab === "resume" && resumeExtraction && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {driveEditingState === "editing" && (
                  <span className="text-[10px] text-purple-400 flex items-center gap-1 px-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    Editing…
                  </span>
                )}
                {driveEditingState === "saving" && (
                  <span className="text-[10px] text-[#4fc9a4] flex items-center gap-1 px-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4fc9a4] animate-pulse" />
                    Saving…
                  </span>
                )}
                <button
                  onClick={handleDownloadResume}
                  disabled={isDownloadingResume}
                  title="Download resume as PDF"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors text-xs disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span className="hidden sm:inline">{isDownloadingResume ? "Saving…" : "Download"}</span>
                </button>
              </div>
            )}

            {/* Report action buttons — consolidated into two dropdowns.
                Save-to-Drive is gone; the report auto-saves when the
                analysis lands (see autoSavedReportRef effect above). */}
            {activeTab === "report" && resumeAnalysis && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Subtle "Saved" indicator — appears briefly on auto-save */}
                {isSavedReportToDrive && (
                  <span className="text-[10px] text-[#4fc9a4] flex items-center gap-1 px-2">
                    <Check className="w-3 h-3" strokeWidth={2.25} />
                    Saved
                  </span>
                )}

                {/* Download dropdown — PDF + Word */}
                <div className="relative">
                  <button
                    onClick={() => { setDownloadOpen((v) => !v); setShareOpen(false); }}
                    disabled={isDownloading || isDownloadingDocx}
                    title="Download"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors text-xs disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span className="hidden sm:inline">
                      {isDownloading ? "PDF…" : isDownloadingDocx ? "Word…" : "Download"}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-70" strokeWidth={2} />
                  </button>
                  {downloadOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setDownloadOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-40 bg-gray-100 border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[180px]">
                        <button
                          onClick={() => { setDownloadOpen(false); handleDownload(); }}
                          disabled={isDownloading}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors border-b border-gray-200 disabled:opacity-50"
                        >
                          <Download className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => { setDownloadOpen(false); handleDownloadDocx(); }}
                          disabled={isDownloadingDocx}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors disabled:opacity-50"
                        >
                          <FileText className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                          <span>Word document (.docx)</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Share dropdown — Copy link + Peer-review + LinkedIn + Email */}
                <div className="relative">
                  <button
                    onClick={() => { setShareOpen((v) => !v); setDownloadOpen(false); }}
                    title="Share"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors text-xs"
                  >
                    <Share2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span className="hidden sm:inline">Share</span>
                    <ChevronDown className="w-3 h-3 opacity-70" strokeWidth={2} />
                  </button>
                  {shareOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShareOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-40 bg-gray-100 border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[220px]">
                        <button
                          onClick={() => { setShareOpen(false); setCoverLetterOpen(true); }}
                          disabled={!editedExtraction}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors border-b border-gray-200 disabled:opacity-50"
                        >
                          <Mail className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                          <span>Generate cover letter</span>
                        </button>
                        <button
                          onClick={() => { setShareOpen(false); handleCopyLink(); }}
                          disabled={isCopying}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors border-b border-gray-200 disabled:opacity-50"
                        >
                          {copiedLink
                            ? <Check className="w-4 h-4 text-green-400" strokeWidth={2} />
                            : <Link2 className="w-4 h-4 text-gray-500" strokeWidth={1.75} />}
                          <span>{copiedLink ? "Copied!" : "Copy shareable link"}</span>
                        </button>
                        <button
                          onClick={() => { setShareOpen(false); handleShareReviewLink(); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors border-b border-gray-200"
                        >
                          <Link2 className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                          <span>Copy peer-review link</span>
                        </button>
                        <button
                          onClick={() => { setShareOpen(false); handleShare("linkedin"); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                          <span>Share on LinkedIn</span>
                        </button>
                        <button
                          onClick={() => { setShareOpen(false); handleShare("email"); }}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                        >
                          <Mail className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                          <span>Share via email</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* X button — desktop only */}
            <button
              onClick={() => setIsPanelOpen(false)}
              className="hidden md:flex ml-1 p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "resume" && resumeExtraction && (() => {
              const isValid = resumeExtraction.name && resumeExtraction.name.trim().length > 2 &&
                (resumeExtraction.experience?.length > 0 || resumeExtraction.education?.length > 0);
              if (!isValid) return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "12px" }}>
                  <span style={{ fontSize: "32px" }}>📄</span>
                  <p style={{ color: "#555", fontSize: "14px", textAlign: "center", maxWidth: "260px", lineHeight: 1.5 }}>
                    Couldn&apos;t fully parse the resume. Try uploading again or paste the text into chat.
                  </p>
                </div>
              );
              return (
                <div style={{ animation: "fadeIn 200ms ease" }}>
                  {resumeDocHtml ? (
                    <DocxViewer html={resumeDocHtml} />
                  ) : resumeFileUrl ? (
                    <PDFViewer fileUrl={resumeFileUrl} />
                  ) : (
                    <div ref={resumeDocRef}>
                      <ResumeDocument extraction={resumeExtraction} />
                    </div>
                  )}
                </div>
              );
            })()}

            {activeTab === "report" && effectiveAnalysis && (
              <div className="p-4" style={{ animation: "fadeIn 200ms ease" }} ref={reportRef}>
                {/* AI Coach moved INTO ResumeReportCard as the first card.
                    Single source for that callout, lives next to the data
                    it summarises. JD-match strip retired here too — will
                    return as a dedicated tab. */}
                <ResumeReportCard
                  analysis={effectiveAnalysis}
                  candidateName={resumeExtraction?.name}
                  onFixItem={handleFixItem}
                  onFixAll={handleFixAll}
                  onAcceptAll={handleAcceptAll}
                  completedActions={completedActions}
                  acceptedActions={acceptedIndices}
                  isFinalized={!!lastFinalizedName}
                />
              </div>
            )}

            {activeTab === "edit" && (
              <div style={{ animation: "fadeIn 200ms ease" }}>
                {/* Unified version bar — Working Copy badge, score
                    progression (hidden while no edits made), saved-state
                    indicator, undo, and View Original — all in one row. */}
                <div style={{
                  background: "#fafafa",
                  borderBottom: "1px solid #e5e7eb",
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "12px",
                  fontFamily: "system-ui, sans-serif",
                  flexShrink: 0,
                  position: "relative",
                }}>
                  <span style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em", textTransform: "uppercase", color: "#15803d", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "4px", padding: "2px 7px" }}>Working Copy</span>

                  {/* Score progression. We always show the original score
                      so the user has a reference; we ONLY surface the
                      working-version score when it differs from baseline,
                      so the bar reads quietly until there's actual progress. */}
                  <span style={{ color: "#52525b" }}>Original score:</span>
                  <span
                    key={`base-${baseScore}`}
                    style={{ fontFamily: "monospace", fontWeight: 500, color: "#71717a" }}
                  >
                    {baseScore}
                  </span>
                  {currentEditScore !== baseScore && (
                    <>
                      <span style={{ color: "#a1a1aa", margin: "0 2px" }}>→</span>
                      <span style={{ color: "#52525b" }}>Working:</span>
                      <span
                        key={`edit-${currentEditScore}`}
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 600,
                          color: "#15803d",
                          transition: "color 300ms",
                        }}
                      >
                        {currentEditScore}
                      </span>
                      <span style={{ fontSize: "11px", color: "#15803d", fontWeight: 500 }}>
                        +{currentEditScore - baseScore} pts
                      </span>
                    </>
                  )}

                  {/* Saved-just-now indicator. savedGhost flips true for
                      ~1.2s after each persistWorkingCopy success. */}
                  {savedGhost && (
                    <span style={{ fontSize: "11px", color: "#15803d", display: "inline-flex", alignItems: "center", gap: "4px", animation: "fadeIn 200ms ease" }}>
                      <Check size={11} strokeWidth={2.5} />
                      Saved · just now
                    </span>
                  )}

                  {editHistory.length > 0 && (
                    <button
                      onClick={handleUndo}
                      style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        color: "#555",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "monospace",
                      }}
                    >
                      ↩ Undo
                    </button>
                  )}
                  {/* View Original hover button */}
                  {resumeExtraction && (
                    <div
                      style={{ marginLeft: editHistory.length > 0 ? "8px" : "auto", position: "relative" }}
                      onMouseEnter={() => setShowOriginalPreview(true)}
                      onMouseLeave={() => setShowOriginalPreview(false)}
                    >
                      <button
                        style={{
                          fontSize: "11px",
                          color: "#666",
                          background: "none",
                          border: "1px solid #2a2a2a",
                          borderRadius: "6px",
                          padding: "2px 8px",
                          cursor: "default",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <FileText style={{ width: "11px", height: "11px" }} strokeWidth={1.75} />
                        Original
                      </button>
                      {showOriginalPreview && (
                        <div
                          style={{
                            position: "absolute",
                            top: "calc(100% + 6px)",
                            right: 0,
                            zIndex: 50,
                            width: "480px",
                            maxHeight: "70vh",
                            overflowY: "auto",
                            background: "#ffffff",
                            border: "1px solid #2a2a2a",
                            borderRadius: "10px",
                            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                          }}
                        >
                          <div style={{ padding: "8px 12px", borderBottom: "1px solid #e5e7eb", fontSize: "11px", color: "#555", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                            Original Resume
                          </div>
                          {resumeDocHtml ? (
                            <DocxViewer html={resumeDocHtml} />
                          ) : resumeFileUrl ? (
                            <PDFViewer fileUrl={resumeFileUrl} />
                          ) : (
                            <ResumeDocument extraction={resumeExtraction} />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Edit content — always show the live editor once extraction exists */}
                {!editedExtraction ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "50vh", gap: "12px", color: "#444", fontSize: "14px", textAlign: "center", padding: "0 40px" }}>
                    <Pencil style={{ width: "28px", height: "28px", color: "#333" }} strokeWidth={1.25} />
                    <p style={{ lineHeight: 1.6, maxWidth: "280px" }}>
                      Loading your resume…
                    </p>
                  </div>
                ) : (
                  <LiveEditableResume
                    extraction={editedExtraction}
                    editingSection={editingSection}
                    typewriterContent={typewriterContent}
                    inlineFix={inlineFix}
                    onAcceptFix={handleAcceptFix}
                    onSkipFix={handleRejectFix}
                    onRewriteFix={handleRewriteFix}
                    onCustomFix={handleCustomRewrite}
                    onManualEdit={handleManualEdit}
                    onAiEdit={handleAiEdit}
                    isRewriting={isRewriting}
                    onAddSkill={handleAddSkill}
                    onRemoveSkill={handleRemoveSkill}
                    suggestedSkills={visibleSuggestions}
                    onDismissSuggestion={handleDismissSuggestion}
                    onSectionClick={(key) => {
                      if (!isEditStreaming) setEditingSection(key === editingSection ? null : key);
                    }}
                  />
                )}
              </div>
            )}

            {activeTab === "rewrite" && resumeAnalysis && resumeExtraction && (
              <RewriteTab
                extraction={editedExtraction ?? resumeExtraction}
                analysis={effectiveAnalysis}
                targetRole={resumeAnalysis.likelyTargetRole ?? "your target role"}
                jobDescription={null}
                acceptedFixCount={acceptedIndices.size}
                baseScore={baseScore}
                initialRewritten={savedRewrite?.extraction ?? null}
                initialChangedKeys={savedRewrite?.changedKeys ?? []}
                onRewriteGenerated={(rewritten, changedKeys, styleHint) => {
                  // Persist the generated rewrite so refresh restores it.
                  // localStorage keyed on chatId; future enhancement = also
                  // store as a Drive 'version' file with display_name
                  // 'AI Rewrite — {date}'.
                  const snapshot = {
                    extraction: rewritten,
                    changedKeys,
                    styleHint,
                    generatedAt: new Date().toISOString(),
                  };
                  setSavedRewrite(snapshot);
                  if (chatId) {
                    try {
                      localStorage.setItem(`stackle_rewrite_${chatId}`, JSON.stringify(snapshot));
                    } catch (err) {
                      console.warn("[persist] rewrite-snapshot failed:", err);
                    }
                  }
                }}
                onAcceptAll={(rewritten) => {
                  // Replace the working extraction with the AI rewrite,
                  // bump editHistory so the score banner reflects the
                  // change, AND persist immediately to the Drive working
                  // copy so a refresh keeps the rewrite (the parent's
                  // onUpdateExtraction only persists chat metadata —
                  // Drive working copy is its own write).
                  setEditedExtraction(rewritten);
                  setEditHistory((prev) => [...prev, rewritten]);
                  persistWorkingCopy(rewritten);
                  onUpdateExtraction(rewritten);
                  // Clear the cached Rewrite-tab snapshot — it's been
                  // applied to the working copy now, so refreshing should
                  // land the user on Resume tab with the rewrite live,
                  // not the Rewrite tab in "generated" state.
                  setSavedRewrite(null);
                  if (chatId) {
                    try { localStorage.removeItem(`stackle_rewrite_${chatId}`); }
                    catch { /* non-fatal */ }
                  }
                  toasts.push({ kind: "score", badge: "AI Rewrite", text: "Optimised resume applied + saved. Hit 'Save as version' when you're ready to lock it." });
                  setActiveTab("resume");
                }}
                onTweakInEdit={(rewritten) => {
                  setEditedExtraction(rewritten);
                  setEditHistory((prev) => [...prev, rewritten]);
                  onUpdateExtraction(rewritten);
                  setActiveTab("edit");
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );

  // ── Toggle button (desktop, right edge) ─────────────────────────
  const toggleButton = hasPanelContent && !isPanelOpen ? (
    <button
      onClick={() => setIsPanelOpen(true)}
      className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 z-40 flex-col items-center justify-center w-5 h-16 bg-gray-100 border border-r-0 border-gray-200 rounded-l-lg text-gray-500 hover:text-gray-900 hover:bg-gray-200 transition-colors"
      title="Open workspace panel"
    >
      <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} />
    </button>
  ) : null;

  return (
    <>
      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        /* Mobile: chat always full width, workspace shown via tab toggle */
        @media (max-width: 767px) {
          .rb-chat-panel { width: 100% !important; }
          .rb-workspace-panel { width: 100% !important; }
        }
        /* Tablet (iPad): chat 30%, workspace 70% — narrower screens need
           a slightly wider chat rail to stay legible. Desktop keeps 25/75. */
        @media (min-width: 768px) and (max-width: 1199px) {
          .rb-chat-panel-open { width: 30% !important; }
          .rb-workspace-panel-open { width: 70% !important; }
        }
      `}</style>

      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {chatPanel}
        {workspacePanel}
      </div>

      {toggleButton}
    </>
  );
}
