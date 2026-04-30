// Output schema for /api/agents/jd-match.
//
// The route compares a candidate's resume extraction against a single job
// description and returns a structured fit report. Used by JDMatchCard to
// render score + keyword coverage + targeted rewrites, and by the existing
// resume edit + cover-letter flows when the user opts in to "tailor for
// this JD".

export interface JDKeyword {
  term: string;            // exact term as it appears in the JD
  importance: "must" | "nice"; // model's read on whether the JD treats it as required vs nice-to-have
  // Where in the resume it appears (if it does). Empty when missing.
  // sectionKeys mirror the LiveEditableResume pattern, e.g.
  // "experience.0.bullets.2", "skillGroups", "summary".
  resumeSectionKeys: string[];
}

export interface JDRewriteRecommendation {
  // Section to edit. Same key format as the writer pipeline so we can route
  // straight into runFixForAction with lockedSectionKey.
  sectionKey: string;
  // Short label the user sees in the card list.
  title: string;
  // One-sentence explanation of why this rewrite raises the JD-match score.
  why: string;
  // Free-form instruction string passed to the writer when the user clicks
  // "Apply this rewrite". Equivalent to the priority strings the
  // analyze route emits today.
  instruction: string;
}

export interface JDMatchReport {
  // 0-100. NOT a percentage of keywords matched — a holistic score from the
  // model accounting for keyword coverage + experience fit + seniority +
  // industry signal. Calibrated to be conservative.
  matchScore: number;
  // Short label derived from the score, e.g. "Strong fit" / "Good fit".
  verdict: "strong" | "good" | "stretch" | "mismatch";
  // 1-2 sentence prose verdict the user can paste into a tracking sheet.
  summary: string;

  // Keyword analysis. The model picks 8-15 of the JD's most-loaded terms
  // and tells us which the resume already covers vs which are missing.
  keywordsPresent: JDKeyword[];
  keywordsMissing: JDKeyword[];

  // Experience / seniority fit
  experienceFit: {
    yearsResume: number | null;     // best estimate from extraction
    yearsRequired: string | null;   // raw string from JD, e.g. "5-8 years"
    fits: boolean;                  // model's binary read
    note: string;                   // one short sentence
  };
  seniorityFit: {
    resumeLevel: string | null;     // e.g. "Senior"
    jdLevel: string | null;         // e.g. "Staff"
    fits: boolean;
    note: string;
  };

  // 3-6 targeted rewrite suggestions, ordered by score impact.
  rewriteRecommendations: JDRewriteRecommendation[];

  // Rough company / role pulled out of the JD when present, so callers can
  // pre-fill the cover letter modal without asking again.
  detected: {
    companyName: string | null;
    roleTitle: string | null;
  };
}
