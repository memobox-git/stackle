"use client";

// Chat-as-chassis refactor — Phase A.
//
// A presentation-only wrapper that composes ChatWindow + ChatInput plus
// slots for mobile tab bar, empty state, and overlays. The component
// owns NO state — every behavior is driven by props passed from the
// parent. RB uses it today; main chat will switch to it in Phase B;
// every surface will share it once the refactor lands in Phase D.
//
// The four slots:
//   - mobileTabBar:  rendered above the chat content (mobile chat/workspace toggle)
//   - emptyState:    rendered IN PLACE OF ChatWindow when provided AND truthy
//   - overlays:      rendered between ChatWindow output and ChatInput
//                    (e.g. fix-flow loader, score toast, RB-specific bits)
//   - children:      not used — overlays slot covers that case explicitly
//
// Props for ChatWindow / ChatInput are passed straight through. We
// intentionally do NOT try to define a unified Chat API yet — that's
// a future cleanup. Today's goal is just to collapse the markup so
// the same JSX shape is rendered everywhere a chat surface lives.

import { ReactNode } from "react";
import ChatWindow from "@/components/ChatWindow";
import ChatInput from "@/components/ChatInput";
import { ChatMessage } from "@/components/Message";
import { ResumeAnalysis } from "@/lib/agents/schemas/resumeIntelligence";
import { MarketAnalysis } from "@/lib/agents/schemas/marketIntelligence";
import { ResumeExtraction } from "@/lib/agents/schemas/resumeExtraction";
import { InterviewPrepPlan } from "@/lib/agents/schemas/interviewPrep";
import type { Artifact } from "@/lib/artifacts";

export interface ChatSurfaceProps {
  // ── Wrapper appearance ───────────────────────────────────────
  /** Inline style on the outer panel (commonly `width: "X%"`). */
  style?: React.CSSProperties;
  /** Extra classes on the outer panel (e.g. `rb-chat-panel`). */
  className?: string;

  // ── Slots ────────────────────────────────────────────────────
  /** Mobile tab bar — rendered above chat content. */
  mobileTabBar?: ReactNode;
  /** Replaces the ChatWindow when set. Use for the empty-state hero
   *  the user sees before uploading their first resume. */
  emptyState?: ReactNode;
  /** Rendered between the ChatWindow and the ChatInput. Fix-flow
   *  loader, score toast, anything surface-specific. */
  overlays?: ReactNode;

  // ── ChatWindow props (forwarded) ─────────────────────────────
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
  onOpenReport?: () => void;
  isReportOpen?: boolean;
  resumeScore?: number;
  acceptedPoints?: number;
  resumeText?: string | null;
  resumeBuilderMode?: boolean;
  completedFixes?: Set<number>;
  acceptedFixes?: Set<number>;
  currentFixIndex?: number | null;
  starterPromptOverride?: string[];
  onStarterPromptClick?: (text: string) => void;
  onChatEditPrompt?: (text: string) => void;
  onApplyInBuilder?: (instruction: string) => void;
  onEditUserMessage?: (index: number, newContent: string) => void;
  onRetryAssistant?: (assistantIndex: number) => void;
  onOpenArtifact?: (artifact: Artifact) => void;
  onDownloadArtifactFormat?: (format: "pdf" | "docx", artifact: Artifact) => void;
  openArtifactId?: string | null;

  // ── ChatInput props (forwarded) ──────────────────────────────
  inputValue: string;
  onInputChange: (v: string) => void;
  onInputSend: () => void;
  inputDisabled?: boolean;
  inputBusy?: boolean;
  onInputStop?: () => void;
  onFileUpload?: (text: string, filename: string) => void;
  inputPlaceholder?: string;
}

export default function ChatSurface({
  style,
  className,
  mobileTabBar,
  emptyState,
  overlays,

  // ChatWindow forwarded
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
  acceptedPoints,
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
  onDownloadArtifactFormat,

  // ChatInput forwarded
  inputValue,
  onInputChange,
  onInputSend,
  inputDisabled,
  inputBusy,
  onInputStop,
  onFileUpload,
  inputPlaceholder,
}: ChatSurfaceProps) {
  return (
    <div className={`flex flex-col min-h-0 ${className ?? ""}`} style={style}>
      {mobileTabBar}

      {emptyState ?? (
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          loadingLabel={loadingLabel}
          resumeAnalysis={resumeAnalysis}
          marketAnalysis={marketAnalysis}
          resumePreview={resumePreview}
          resumeExtraction={resumeExtraction}
          interviewPrepPlan={interviewPrepPlan}
          onSend={onSend}
          onFixItem={onFixItem}
          onFixAll={onFixAll}
          completedActions={completedActions}
          onOpenReport={onOpenReport}
          isReportOpen={isReportOpen}
          resumeScore={resumeScore}
          acceptedPoints={acceptedPoints}
          resumeText={resumeText}
          resumeBuilderMode={resumeBuilderMode}
          completedFixes={completedFixes}
          acceptedFixes={acceptedFixes}
          currentFixIndex={currentFixIndex}
          starterPromptOverride={starterPromptOverride}
          onStarterPromptClick={onStarterPromptClick}
          onChatEditPrompt={onChatEditPrompt}
          onApplyInBuilder={onApplyInBuilder}
          onEditUserMessage={onEditUserMessage}
          onRetryAssistant={onRetryAssistant}
          onOpenArtifact={onOpenArtifact}
          openArtifactId={openArtifactId}
          onDownloadArtifactFormat={onDownloadArtifactFormat}
        />
      )}

      {overlays}

      <div className="relative px-4 pb-4 pt-2">
        {/* Soft fade so the last message doesn't butt up against the input. */}
        <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        <ChatInput
          value={inputValue}
          onChange={onInputChange}
          onSend={onInputSend}
          disabled={inputDisabled}
          busy={inputBusy}
          onStop={onInputStop}
          onFileUpload={onFileUpload}
          placeholder={inputPlaceholder}
        />
      </div>
    </div>
  );
}
