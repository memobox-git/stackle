import { ResumeExtraction } from "../schemas/resumeExtraction";
import { ResumeAnalysis } from "../schemas/resumeIntelligence";

/**
 * Build the opening assistant message for the Resume Builder chat panel.
 *
 * Deterministic (no LLM call) so it fires the instant the user lands on the
 * Resume Builder view. The goal: make the first impression feel like a senior
 * reviewer who has already read the resume — referencing specific companies,
 * titles, years, score, and a concrete recommended next action.
 *
 * Three-paragraph format when we have an analysis:
 *   1. Greeting + report ready
 *   2. Quick read — score + strongest signal + biggest wins
 *   3. First recommended action — section + why it matters + how to act
 *
 * Falls back to a shorter deterministic line when analysis is missing
 * (defensive — should never happen post-ScoreReveal).
 */
export function buildResumeBuilderWelcome(
  ext: ResumeExtraction,
  lastFinalized?: { displayName: string } | null,
  analysis?: ResumeAnalysis | null,
): string {
  const firstName = (ext.name ?? "").trim().split(/\s+/)[0] || "there";

  // Returning user — don't re-pitch the report, just nudge to keep editing.
  if (lastFinalized?.displayName) {
    return `Welcome back, ${firstName}. Your saved resume is "${lastFinalized.displayName}". Want to keep editing, or save a new version for a different role?`;
  }

  // No analysis yet — degrade gracefully to the legacy short welcome.
  if (!analysis) {
    return buildLegacyWelcome(ext, firstName);
  }

  const score = computeScore(analysis);
  const strongestSignal = pickStrongestSignal(ext);
  const biggestWinPointer = pickBiggestWinPointer(analysis, ext);

  const para1 = `Hey ${firstName} — your report's ready on the right.`;

  const quickReadParts = [`Quick read: you scored ${score}/100.`];
  if (strongestSignal) quickReadParts.push(strongestSignal);
  if (biggestWinPointer) quickReadParts.push(biggestWinPointer);
  const para2 = quickReadParts.join(" ");

  const action = pickFirstAction(analysis);
  const para3 = `I'd start with ${action.sectionPhrase} — ${action.whyItMatters}. ${action.howToAct}`;

  return [para1, para2, para3].join("\n\n");
}

// ── Score (mirrors components/ScoreReveal.tsx + ResumeBuilder.tsx deriveScore)
function computeScore(a: ResumeAnalysis): number {
  let score = 55;
  score += Math.min(a.strengths.length * 4, 20);
  score -= Math.min(a.weaknesses.length * 3, 15);
  score -= Math.min(a.keywordGaps.length * 1.5, 10);
  if (a.atsHeuristics?.formattingRisk === "low") score += 5;
  if (a.atsHeuristics?.formattingRisk === "high") score -= 5;
  if (a.atsHeuristics?.scanabilityRisk === "low") score += 5;
  if (a.atsHeuristics?.scanabilityRisk === "high") score -= 5;
  score -= Math.min((a.weakBullets ?? []).length, 5);
  return Math.max(20, Math.min(100, Math.round(score)));
}

// ── Strongest-signal sentence
// Looks for the most impressive quantified bullet across REAL employers.
// Returns a sentence like:
//   "The Medallia $150K cost-savings work is your strongest signal — that's
//    the kind of impact recruiters notice in 6 seconds."
function pickStrongestSignal(ext: ResumeExtraction): string {
  const jobs = ext.experience ?? [];
  type Hit = { company: string; bullet: string; score: number };
  const hits: Hit[] = [];

  for (const job of jobs) {
    const company = (job.company ?? "").trim();
    const title = (job.title ?? "").trim();
    if (!company) continue;
    if (NON_EMPLOYER_COMPANY_PATTERNS.some((re) => re.test(company))) continue;
    if (title && NON_EMPLOYER_TITLE_PATTERNS.some((re) => re.test(title))) continue;

    for (const bullet of job.bullets ?? []) {
      const score = bulletImpactScore(bullet);
      if (score > 0) hits.push({ company, bullet, score });
    }
  }

  if (hits.length === 0) return "";

  hits.sort((a, b) => b.score - a.score);
  const top = hits[0];
  const metricSnippet = extractMetricSnippet(top.bullet);

  if (metricSnippet) {
    return `The ${top.company} ${metricSnippet} work is your strongest signal — that's the kind of impact recruiters notice in six seconds.`;
  }
  return `Your work at ${top.company} is your strongest signal — that's the kind of detail recruiters notice in six seconds.`;
}

function bulletImpactScore(bullet: string): number {
  let score = 0;
  // Money references count most
  if (/\$\d+\s*[KMB]?/i.test(bullet) || /\d+\s*[KMB]\s*\$/i.test(bullet)) score += 5;
  // Percentages
  if (/\d+\s*%/.test(bullet)) score += 4;
  // Multipliers
  if (/\b\d+x\b/i.test(bullet)) score += 3;
  // Three-digit+ counts (records, users, latency-ms)
  if (/\b\d{3,}\b/.test(bullet)) score += 2;
  // Big numerals like 1M, 2B
  if (/\b\d+\s*[KMB]\b/i.test(bullet)) score += 3;
  // Strong action verbs at the start
  if (/^(Led|Built|Shipped|Migrated|Architected|Scaled|Cut|Grew|Reduced|Increased|Drove|Launched|Saved|Generated|Delivered)\b/i.test(bullet)) {
    score += 1;
  }
  return score;
}

function extractMetricSnippet(bullet: string): string {
  // Try to find a "$X cost-savings" / "40% reduction" / "10TB pipeline" style phrase.
  const moneyMatch = bullet.match(/(\$\d+\s*[KMB]?\+?)/i);
  if (moneyMatch) {
    // Pull a noun phrase nearby — look for words after the metric.
    const idx = bullet.indexOf(moneyMatch[1]);
    const after = bullet.slice(idx + moneyMatch[1].length).split(/[.,;]/)[0].trim().split(/\s+/).slice(0, 3).join(" ");
    return after ? `${moneyMatch[1]} ${after}` : moneyMatch[1];
  }
  const pctMatch = bullet.match(/(\d+\s*%)/);
  if (pctMatch) {
    const idx = bullet.indexOf(pctMatch[1]);
    const after = bullet.slice(idx + pctMatch[1].length).split(/[.,;]/)[0].trim().split(/\s+/).slice(0, 3).join(" ");
    return after ? `${pctMatch[1]} ${after}` : pctMatch[1];
  }
  return "";
}

// ── Biggest-win pointer
// Names where the user can recover the most score: summary + older roles.
function pickBiggestWinPointer(analysis: ResumeAnalysis, ext: ResumeExtraction): string {
  const weakBullets = analysis.weakBullets ?? [];
  const weaknesses = analysis.weaknesses ?? [];
  const summaryWeak = weaknesses.some((w) => /summary|profile|objective/i.test(w))
    || (ext.summary ?? "").length < 50;

  const realCompanies = realEmployerCompanies(ext);
  const olderRoles = realCompanies.slice(1, 3); // skip the first/current company

  if (summaryWeak && olderRoles.length >= 1) {
    if (olderRoles.length === 1) {
      return `Your summary and the older ${olderRoles[0]} role are where we'll get the biggest score gains.`;
    }
    return `Your summary and the older ${olderRoles.join(" and ")} roles are where we'll get the biggest score gains.`;
  }

  if (summaryWeak) {
    return "Your summary is where we'll get the biggest score gains.";
  }

  if (weakBullets.length > 0 && olderRoles.length >= 1) {
    return `The bullets in your older ${olderRoles[0]} role are where we'll get the biggest score gains.`;
  }

  if (weakBullets.length > 0) {
    return "Tightening a few weak bullets is where we'll get the biggest score gains.";
  }

  // Fall back to the analysis's own framing if we can't find structural targets
  const topWeakness = weaknesses[0];
  if (topWeakness) {
    return `One thing holding you back: ${topWeakness}`;
  }

  return "";
}

// ── First recommended action
type Action = { sectionPhrase: string; whyItMatters: string; howToAct: string };

function pickFirstAction(analysis: ResumeAnalysis): Action {
  const top = analysis.rewritePriorities?.[0] ?? "";

  if (/summary|profile|objective|headline|intro/i.test(top)) {
    return {
      sectionPhrase: "the summary",
      whyItMatters: "it's the first thing recruiters read and yours leads with generic phrases that get skipped",
      howToAct: "Click Fix Summary on the right when you're ready, or ask me anything about the report.",
    };
  }

  if (/skills?|keyword|stack|tech list|tools/i.test(top)) {
    return {
      sectionPhrase: "your skills",
      whyItMatters: "the keyword section is what ATS scans against the JD before a human ever sees you",
      howToAct: "Click Fix Skills on the right when you're ready, or ask me anything about the report.",
    };
  }

  if (/bullet|impact|metric|quantif|achievement|wins/i.test(top)) {
    return {
      sectionPhrase: "your experience bullets",
      whyItMatters: "weak bullets are where most candidates lose the recruiter's attention in the first six seconds",
      howToAct: "Click Fix this on the top priority on the right when you're ready, or ask me anything about the report.",
    };
  }

  // Default: point at the first priority generically.
  return {
    sectionPhrase: "the top priority",
    whyItMatters: "this is the highest-impact change we can make on your resume right now",
    howToAct: "Click Fix this on the right when you're ready, or ask me anything about the report.",
  };
}

// ── Legacy fallback (kept verbatim for the rare case where analysis is missing)
function buildLegacyWelcome(ext: ResumeExtraction, firstName: string): string {
  const years = ext.totalYearsExperience ?? null;
  const field = inferField(ext);
  const realJob = firstRealJob(ext);

  const headerParts: string[] = [`Hey ${firstName} —`];
  if (realJob?.title && realJob?.company) {
    headerParts.push(`I've read through your resume. ${realJob.title} at ${realJob.company}`);
    if (typeof years === "number" && years > 0) {
      headerParts.push(`, ${years} years in ${field}`);
    }
    headerParts.push(".");
  } else if (typeof years === "number" && years > 0) {
    headerParts.push(`read through your resume. ${years} years in ${field}.`);
  } else {
    headerParts.push(`read through your resume.`);
  }
  const header = headerParts.join(" ").replace(/\s+,/g, ",").replace(/\s+\./g, ".");
  const observation = pickObservation(ext);
  const close = "What are you trying to tighten up here?";
  return [header, observation, close].filter(Boolean).join(" ");
}

// ── Real-employer detection ─────────────────────────────────────────────────

const NON_EMPLOYER_COMPANY_PATTERNS = [
  /self[\s-]*initiated/i,
  /personal[\s-]*project/i,
  /side[\s-]*project/i,
  /independent/i,
  /freelance/i,
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
  /^project[\s:_-]/i,
  /^data\s+science\s+project/i,
  /^capstone/i,
  /^thesis/i,
  /^hackathon/i,
  /_/,
];

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

function realEmployerCompanies(ext: ResumeExtraction, limit = 4): string[] {
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
  const realJob = firstRealJob(ext);
  const title = (realJob?.title ?? ext.experience?.[0]?.title ?? "").toLowerCase();
  if (title.includes("data engineer")) return "data engineering";
  if (title.includes("ml") || title.includes("machine learning")) return "machine learning";
  if (title.includes("analyst") || title.includes("bi")) return "analytics";
  if (title.includes("scientist")) return "data science";
  if (title.includes("devops") || title.includes("infra")) return "infrastructure";
  if (title.includes("backend") || title.includes("software")) return "software engineering";
  const firstCategory = ext.skillGroups?.[0]?.category;
  if (firstCategory) return firstCategory.toLowerCase();
  return "the space";
}

function pickObservation(ext: ResumeExtraction): string {
  const jobs = ext.experience ?? [];
  for (const job of jobs) {
    const bullets = job.bullets ?? [];
    const quantified = bullets.find((b) => /\d+%|\$\d|\d+x\b|\d+[kKmM]\b|\d{3,}/.test(b));
    if (quantified) {
      const short = quantified.replace(/\s+/g, " ").trim();
      const snippet = short.length > 140 ? short.slice(0, 137) + "…" : short;
      return `One line that jumps out: "${snippet}" — that kind of detail is exactly what recruiters scan for.`;
    }
  }
  const realCompanies = realEmployerCompanies(ext);
  if (realCompanies.length >= 2) {
    return `Nice progression — ${realCompanies.join(" → ")}.`;
  }
  if (typeof ext.totalYearsExperience === "number" && ext.totalYearsExperience >= 5) {
    return `${ext.totalYearsExperience} years is solid senior territory.`;
  }
  const summary = (ext.summary ?? "").trim();
  if (summary.length > 30) {
    const snippet = summary.length > 140 ? summary.slice(0, 137) + "…" : summary;
    return `Your own framing: "${snippet}"`;
  }
  return "";
}
