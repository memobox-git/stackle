import { ResumeExtraction } from "../schemas/resumeExtraction";

/**
 * Build the opening assistant message for the Resume Builder chat panel.
 *
 * Deterministic (no LLM call) so it fires the instant the user lands on the
 * Resume Builder view. The goal: make the first impression feel like a senior
 * reviewer who has already read the resume — referencing specific companies,
 * titles, years, and one concrete observation.
 *
 * Carefully skips self-initiated / personal / academic entries when naming
 * "where the candidate works" so we don't call a weekend project a job.
 */
export function buildResumeBuilderWelcome(
  ext: ResumeExtraction,
  lastFinalized?: { displayName: string } | null,
): string {
  const firstName = (ext.name ?? "").trim().split(/\s+/)[0] || "there";
  const years = ext.totalYearsExperience ?? null;
  const field = inferField(ext);

  // If the user finalized a version last time, open with that — it's the most
  // relevant context. Skip the first-impression pitch; they've been here.
  if (lastFinalized?.displayName) {
    const close = "Want to keep editing, or save a new version for a different role?";
    return `Welcome back, ${firstName}. Your saved resume is "${lastFinalized.displayName}". ${close}`;
  }

  // Use the first REAL employer, not a personal project or academic entry.
  const realJob = firstRealJob(ext);

  // Header line
  const headerParts: string[] = [`Hey ${firstName} —`];
  if (realJob?.title && realJob?.company) {
    headerParts.push(`I've read through your resume. ${realJob.title} at ${realJob.company}`);
    if (typeof years === "number" && years > 0) {
      headerParts.push(`, ${years} years in ${field}`);
    }
    headerParts.push(".");
  } else if (typeof years === "number" && years > 0) {
    // No clean employer but we know the years + field
    headerParts.push(`read through your resume. ${years} years in ${field}.`);
  } else {
    headerParts.push(`read through your resume.`);
  }
  const header = headerParts.join(" ").replace(/\s+,/g, ",").replace(/\s+\./g, ".");

  // One specific observation
  const observation = pickObservation(ext);

  // Close with an open invite
  const close = "What are you trying to tighten up here?";

  return [header, observation, close].filter(Boolean).join(" ");
}

// ── Real-employer detection ─────────────────────────────────────────────────
// Signals that an "experience" entry is actually a self-initiated project,
// academic coursework, volunteer gig, or a placeholder — not paid employment.

const NON_EMPLOYER_COMPANY_PATTERNS = [
  /self[\s-]*initiated/i,
  /personal[\s-]*project/i,
  /side[\s-]*project/i,
  /independent/i,
  /freelance/i,       // freelance is real work but ambiguous — treat as non-employer
  /open[\s-]*source/i,
  /university/i,
  /college/i,
  /school/i,
  /academic/i,
  /coursework/i,
  /bootcamp/i,
  /^n\/?a$/i,
  /^none$/i,
  /^$/,
];

const NON_EMPLOYER_TITLE_PATTERNS = [
  /^project[\s:_-]/i,          // "Project: X" / "Project_X"
  /^data\s+science\s+project/i,
  /^capstone/i,
  /^thesis/i,
  /^hackathon/i,
  /_/,                          // Underscores are almost always project-file-name artefacts
];

/**
 * Returns the first experience entry that looks like real paid employment.
 * Skips self-initiated / project / academic rows. Falls back to null if none.
 */
export function firstRealJob(ext: ResumeExtraction): { title: string; company: string } | null {
  const jobs = ext.experience ?? [];
  for (const job of jobs) {
    const company = (job.company ?? "").trim();
    const title = (job.title ?? "").trim();
    if (!company || !title) continue;
    if (NON_EMPLOYER_COMPANY_PATTERNS.some((re) => re.test(company))) continue;
    if (NON_EMPLOYER_TITLE_PATTERNS.some((re) => re.test(title))) continue;
    return { title, company };
  }
  return null;
}

function realEmployerCompanies(ext: ResumeExtraction, limit = 3): string[] {
  const jobs = ext.experience ?? [];
  const out: string[] = [];
  for (const job of jobs) {
    const company = (job.company ?? "").trim();
    const title = (job.title ?? "").trim();
    if (!company) continue;
    if (NON_EMPLOYER_COMPANY_PATTERNS.some((re) => re.test(company))) continue;
    if (title && NON_EMPLOYER_TITLE_PATTERNS.some((re) => re.test(title))) continue;
    out.push(company);
    if (out.length >= limit) break;
  }
  return out;
}

function inferField(ext: ResumeExtraction): string {
  // Prefer the first real job's title for field inference
  const realJob = firstRealJob(ext);
  const title = (realJob?.title ?? ext.experience?.[0]?.title ?? "").toLowerCase();
  if (title.includes("data engineer")) return "data engineering";
  if (title.includes("ml") || title.includes("machine learning")) return "machine learning";
  if (title.includes("analyst") || title.includes("bi")) return "analytics";
  if (title.includes("scientist")) return "data science";
  if (title.includes("devops") || title.includes("infra")) return "infrastructure";
  if (title.includes("backend") || title.includes("software")) return "software engineering";

  // Fall back to the first skill group's category
  const firstCategory = ext.skillGroups?.[0]?.category;
  if (firstCategory) return firstCategory.toLowerCase();
  return "the space";
}

function pickObservation(ext: ResumeExtraction): string {
  const jobs = ext.experience ?? [];

  // 1. Prefer a quantified bullet from any job (not just #0 — #0 might be the project)
  for (const job of jobs) {
    const bullets = job.bullets ?? [];
    const quantified = bullets.find((b) => /\d+%|\$\d|\d+x\b|\d+[kKmM]\b|\d{3,}/.test(b));
    if (quantified) {
      const short = quantified.replace(/\s+/g, " ").trim();
      const snippet = short.length > 140 ? short.slice(0, 137) + "…" : short;
      return `One line that jumps out: "${snippet}" — that kind of detail is exactly what recruiters scan for.`;
    }
  }

  // 2. Progression across real employers
  const realCompanies = realEmployerCompanies(ext);
  if (realCompanies.length >= 2) {
    return `Nice progression — ${realCompanies.join(" → ")}.`;
  }

  // 3. Tenure emphasis
  if (typeof ext.totalYearsExperience === "number" && ext.totalYearsExperience >= 5) {
    return `${ext.totalYearsExperience} years is solid senior territory.`;
  }

  // 4. Fall back to summary
  const summary = (ext.summary ?? "").trim();
  if (summary.length > 30) {
    const snippet = summary.length > 140 ? summary.slice(0, 137) + "…" : summary;
    return `Your own framing: "${snippet}"`;
  }

  return "";
}
