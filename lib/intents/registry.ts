// Intent registry — single source of truth for the dynamic chip
// catalog. Maps a detected intent CATEGORY into a list of option
// chips the user picks from. Each option has an action KEY that the
// client-side chip handler dispatches on.
//
// Adding a new category: extend IntentCategory + INTENT_REGISTRY +
// add handler cases in app/page.tsx. Three files, ~10 minutes.

export type IntentCategory =
  | "interview"     // any "quiz / drill / practice / prep" framing
  | "resume"        // rewrite / tailor / fix / polish
  | "cover_letter"  // write / draft / generate for a role
  | "unknown";

export interface IntentOption {
  label: string;       // displayed on chip
  key: string;         // action id matched in chip handler
  helpText?: string;   // optional one-liner shown beneath if surfacing tooltips later
}

export interface IntentRoute {
  category: IntentCategory;
  options: IntentOption[];
  // The narration line above the chip row. Kept generic so the same
  // narration works for both regex hits and Haiku hits.
  narration: string;
  // Optional slot — when the classifier picks up a specific skill /
  // role / company name from the user message, the chip handlers can
  // use it (e.g. "Python quiz" → skill=Python passed through).
  detectedSkill?: string | null;
}

// Pre-built option sets. Action keys are namespaced by category so a
// single switch in the chip handler can dispatch unambiguously.
export const INTERVIEW_OPTIONS: IntentOption[] = [
  { label: "Skill Assessment",  key: "interview.assessment", helpText: "5–7 scored questions, one verdict." },
  { label: "Interview Drill",   key: "interview.drill",      helpText: "Open Interview Prep with this skill loaded." },
  { label: "Quick Question Set",key: "interview.quick",      helpText: "3 questions inline as an artifact." },
];

export const RESUME_OPTIONS: IntentOption[] = [
  { label: "Recreate with all Fixes", key: "resume.recreate_all", helpText: "Opus rewrite applying every report priority." },
  { label: "Tailor to a JD",          key: "resume.tailor_jd",    helpText: "Paste a JD, get a JD-tuned rewrite." },
  { label: "Quick polish",            key: "resume.quick_polish", helpText: "Light pass — tighten language, no restructure." },
];

export const COVER_LETTER_OPTIONS: IntentOption[] = [
  { label: "For a specific JD",   key: "cover.jd",       helpText: "Paste a JD, get a matched cover letter." },
  { label: "Generic strong one",  key: "cover.generic",  helpText: "Resume-grounded, no specific role." },
  { label: "For a company",       key: "cover.company",  helpText: "Name the company, I match your fit." },
];

export const UNKNOWN_FALLBACK: IntentOption[] = [];

// Lookup: category → options.
export function optionsFor(category: IntentCategory): IntentOption[] {
  switch (category) {
    case "interview":     return INTERVIEW_OPTIONS;
    case "resume":        return RESUME_OPTIONS;
    case "cover_letter":  return COVER_LETTER_OPTIONS;
    case "unknown":       return UNKNOWN_FALLBACK;
  }
}

// Default narrations per category. Kept short — chips do the talking.
export function narrationFor(category: IntentCategory, detectedSkill: string | null): string {
  switch (category) {
    case "interview":
      return detectedSkill
        ? `Three ways I can help you with ${detectedSkill} — pick one:`
        : "Three ways I can help — pick one:";
    case "resume":
      return "How do you want me to recreate your resume?";
    case "cover_letter":
      return "What kind of cover letter?";
    case "unknown":
      return "";
  }
}
