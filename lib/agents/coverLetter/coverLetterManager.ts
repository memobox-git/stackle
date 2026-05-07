// Cover Letter Manager (Layer 2) — V2 placeholder.
// When the Stackle Orchestrator routes a chat here, this Manager replies
// with a "coming soon" message and offers to bounce back to Resume or
// Interview Prep. Real Cover Letter sub-agents land in a future commit.

export const COVER_LETTER_MANAGER_KEY = "cover_letter" as const;
export const COVER_LETTER_MANAGER_DESCRIPTION = "Cover Letter writing. (Coming soon — placeholder for V2.)";

export interface ManagerReply {
  text: string;
  chips?: string[];
  /** When true, the chat's activeManager should reset so the Stackle
   *  Orchestrator can route again on the next message. */
  bounceToOrchestrator?: boolean;
}

export function handleCoverLetterMessage(): ManagerReply {
  return {
    text: "Cover Letter writing is coming soon — the agent that drafts and tunes letters to a specific JD is on the roadmap. For now I can help you tighten your resume or run interview practice. What sounds useful?",
    chips: ["Resume Builder", "Interview Prep", "Tell me when it's ready"],
    bounceToOrchestrator: true,
  };
}
