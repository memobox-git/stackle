// Interview Manager (Layer 2). Routes between four sub-agents:
//   - Skill Agent  (built — drills SQL etc.)
//   - Role Agent   (stub — coming Phase 3)
//   - Company Agent (stub — coming Phase 3)
//   - JD Agent     (stub — coming Phase 3)
//
// In Phase 1, only the Skill Agent is wired. The Manager's job is the
// initial sub-agent pick (chat asks "skill / role / company / JD?")
// and returning the appropriate sub-agent identifier so the UI can
// dispatch to the right runner / endpoint.

export const INTERVIEW_MANAGER_KEY = "interview" as const;
export const INTERVIEW_MANAGER_DESCRIPTION = "Interview Prep. Skill drills (live), Role/Company/JD coming.";

export type InterviewSubAgent = "skill" | "role" | "company" | "jd";

export interface InterviewManagerRoute {
  subAgent: InterviewSubAgent | null;
  /** When true, the sub-agent isn't built yet — UI should show the
   *  comingSoonText + bounce back to lens selection. */
  comingSoon?: boolean;
  comingSoonText?: string;
}

// Lightweight router: regex-classifies the user's lens choice. Cheap,
// deterministic, no LLM call needed for the picker. The Skill Agent
// handles the actual setup conversation once chosen.
export function pickInterviewSubAgent(message: string): InterviewManagerRoute {
  const lc = message.toLowerCase();
  if (/^skill$|by\s+skill|drill|skill\s+practice|skill\s+drill/i.test(lc) || /\bsql\b|\bpython\b|\bspark\b/i.test(lc)) {
    return { subAgent: "skill" };
  }
  if (/^role$|by\s+role|target\s+role|prep\s+for\s+(senior|junior|data|software|ml|ai)/i.test(lc)) {
    return {
      subAgent: null,
      comingSoon: true,
      comingSoonText: "Role Agent is coming next — prep tailored to a specific role's interview shape. For now I can drill specific skills (SQL is live).",
    };
  }
  if (/^company$|by\s+company|google|meta|amazon|stripe|snowflake|databricks/i.test(lc)) {
    return {
      subAgent: null,
      comingSoon: true,
      comingSoonText: "Company Agent is coming after Role — tailored to a company's interview patterns. For now I can drill specific skills.",
    };
  }
  if (/^jd$|paste\s+a\s+jd|job\s+description|by\s+jd/i.test(lc)) {
    return {
      subAgent: null,
      comingSoon: true,
      comingSoonText: "JD Agent is the most-anticipated one — paste a job description and I calibrate questions to it. Coming after Company. For now: skill drills.",
    };
  }
  // Ambiguous — caller should ask the user to pick.
  return { subAgent: null };
}

export function interviewManagerWelcome(candidateFirstName?: string | null): { text: string; chips: string[] } {
  const name = candidateFirstName?.trim().split(/\s+/)[0] ?? "there";
  return {
    text: `Hey ${name} — how do you want to practice today?`,
    chips: ["Skill drill", "By role (soon)", "By company (soon)", "By JD (soon)"],
  };
}
