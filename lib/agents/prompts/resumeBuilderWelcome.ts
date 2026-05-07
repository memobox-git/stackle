import { ResumeExtraction } from "../schemas/resumeExtraction";
import { ResumeAnalysis } from "../schemas/resumeIntelligence";
import { tierLabel, deriveScoreFromAnalysis } from "@/lib/score";

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
  chosenTargetRole?: string | null,
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
  const tier = tierLabel(score);
  const strongestSignal = pickStrongestSignal(ext);
  const biggestWinPointer = pickBiggestWinPointer(analysis, ext);

  // Chat-first refactor: para 1 leads with the score + tier so the chat
  // narrates the aha moment the user is simultaneously seeing in the
  // Report tab on the right. No more dedicated full-screen reveal — this
  // line IS the score reveal in conversation form.
  // If the analysis benchmarked against a more junior version of the
  // user's chosen role (e.g. user picked "Data Engineer", analyzer
  // chose seniority="Entry-level to Junior"), surface that explicitly
  // — silent re-targeting feels like gaslighting when the user later
  // sees "Junior Data Engineer" in the report.
  const seniorityNote = buildSeniorityNote(analysis, chosenTargetRole, ext.totalYearsExperience);
  const para1 = seniorityNote
    ? `Hey ${firstName}. You scored ${score}/100 — ${tier}. ${seniorityNote}`
    : `Hey ${firstName}. You scored ${score}/100 — ${tier}.`;

  const quickReadParts = [`Quick read: you scored ${score}/100.`];
  if (strongestSignal) quickReadParts.push(strongestSignal);
  if (biggestWinPointer) quickReadParts.push(biggestWinPointer);
  const para2 = quickReadParts.join(" ");

  const action = pickFirstAction(analysis);
  const para3 = `I'd start with ${action.sectionPhrase} — ${action.whyItMatters}. ${action.howToAct}`;

  return [para1, para2, para3].join("\n\n");
}

// Round fractional years into a clean phrase. Decimals like "1.4 years"
// read awkwardly in human copy. Mirrors describeYears() in ScoreReveal.tsx
// — kept duplicated rather than extracted to a shared module to avoid
// adding cross-import surface for two functions.
function describeYears(years: number | null | undefined): string {
  if (typeof years !== "number" || !isFinite(years) || years <= 0) return "";
  if (years < 1) return "less than a year in";
  const floor = Math.floor(years);
  const frac = years - floor;
  if (frac < 0.25) return floor === 1 ? "1 year in" : `${floor} years in`;
  if (frac >= 0.75) {
    const rounded = floor + 1;
    return rounded === 1 ? "almost 1 year in" : `almost ${rounded} years in`;
  }
  return floor === 1 ? "about 1 year in" : `about ${floor} years in`;
}

// Pick "a" or "an" based on the first word's leading sound. Vowel-letter
// heuristic with light vowel-sound exceptions ("UI", "FE" → "a"; "MBA",
// "HR" → "an"). Mirrors articleFor() in ScoreReveal.tsx.
function articleFor(phrase: string): string {
  const word = phrase.trim().split(/\s+/)[0] ?? "";
  if (!word) return "a";
  const upper = word.toUpperCase();
  const vowelSoundAcronyms = ["MBA", "MS", "MD", "FBI", "HR", "HTML", "HTTP", "L1", "L2"];
  const consonantSoundAcronyms = ["UI", "UX", "URL", "USB", "U.S.", "EU"];
  if (consonantSoundAcronyms.some((a) => upper.startsWith(a))) return "a";
  if (vowelSoundAcronyms.some((a) => upper.startsWith(a))) return "an";
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

// ── Seniority transparency
// When the user's chosen target role doesn't match their actual experience
// level — either the analyzer downshifted ("you picked Senior, I benchmarked
// against Junior") OR the years-of-experience clearly contradicts the
// chosen seniority ("you picked Senior · 10-15y but you have 4 years") —
// surface the mismatch honestly in the welcome.
//
// Three checks:
//   1. Years-vs-chosen mismatch (e.g. "Senior · 10-15 yrs" but totalYears=4)
//   2. Junior downshift (analyzer chose more junior than user)
//   3. Senior upshift (analyzer chose more senior than user)
function buildSeniorityNote(
  a: ResumeAnalysis | null | undefined,
  chosenTargetRole: string | null | undefined,
  totalYears?: number | null,
): string {
  if (!a || !chosenTargetRole) return "";

  const chosenLower = chosenTargetRole.toLowerCase();
  const chosenIsSenior = /\b(senior|sr\.?|staff|principal|lead|director|head|manager|10[-+]?\s*15\s*y|8\+|10\+)\b/.test(chosenLower);
  const chosenIsJunior = /\b(junior|jr\.?|entry|intern|associate|0[-]?2|new\s*grad|grad)\b/.test(chosenLower);

  // CHECK 1 — Years contradict the chosen seniority.
  if (typeof totalYears === "number" && isFinite(totalYears) && totalYears > 0) {
    if (chosenIsSenior && totalYears < 7) {
      return `Note: you picked ${chosenTargetRole}, but your resume shows ${formatYears(totalYears)} of experience — Senior roles typically expect 8+ years. I'm benchmarking against the realistic target for your background.`;
    }
    if (chosenIsJunior && totalYears >= 5) {
      return `Note: you picked ${chosenTargetRole}, but your resume shows ${formatYears(totalYears)} of experience — that supports a more senior target. Worth aiming higher.`;
    }
  }

  // CHECK 2 + 3 — Analyzer's benchmark differs from user's pick.
  const benchmark = (a.likelyTargetRole ?? "").trim();
  const seniority = (a.seniorityEstimate ?? "").trim();
  if (!benchmark && !seniority) return "";

  const benchLower = benchmark.toLowerCase();
  const senLower = seniority.toLowerCase();
  const benchmarkIsJunior =
    /\b(junior|jr\.?|entry|intern|associate)\b/.test(benchLower) ||
    /\b(junior|jr\.?|entry|intern|associate)\b/.test(senLower);
  const benchmarkIsSenior =
    /\b(senior|sr\.?|staff|principal|lead|manager)\b/.test(benchLower) ||
    /\b(senior|sr\.?|staff|principal|lead|manager)\b/.test(senLower);

  if (!chosenIsJunior && benchmarkIsJunior) {
    const targetLabel = benchmark || `${seniority} ${chosenTargetRole}`.trim();
    return `Note: you picked ${chosenTargetRole}, but I benchmarked against ${targetLabel} based on your years of experience and stack — that's the realistic target right now.`;
  }
  if (!chosenIsSenior && benchmarkIsSenior) {
    return `Note: you picked ${chosenTargetRole}, but the analysis benchmarked against ${benchmark || seniority} — your experience supports a more senior target.`;
  }

  return "";
}

function formatYears(years: number): string {
  if (years < 1) return "less than a year";
  const rounded = Math.round(years);
  return rounded === 1 ? "1 year" : `${rounded} years`;
}

// ── Score (delegates to lib/score.ts so welcome / Report / Edit / Rewrite
//    never disagree on the same analysis)
function computeScore(a: ResumeAnalysis): number {
  return deriveScoreFromAnalysis(a);
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

// Sub-score-driven recommendation. The earlier version regex-matched
// `analysis.rewritePriorities[0]` and frequently disagreed with the
// AI Coach's "Fastest Win" tile because each used different mapping
// logic. NEW logic: read the actual sub-scores, pick the lowest-percentage
// category (the real weakness), and recommend that. Falls back to the
// first priority's section bucket only when sub-scores are missing.
//
// Maps weakest sub-score → recommendation:
//   ATS lowest         → fix ATS-killers (URLs, formatting)
//   Content lowest     → rewrite weak bullets for impact + metrics
//   Format lowest      → restructure (section order, header)
//   Keywords lowest    → inject missing target-role keywords
//   Seniority lowest   → add leadership / scope signals
function pickFirstAction(analysis: ResumeAnalysis): Action {
  const subScoreAction = pickActionFromWeakestSubScore(analysis);
  if (subScoreAction) return subScoreAction;

  // Fallback: regex on priority[0] when sub-scores aren't populated.
  const top = analysis.rewritePriorities?.[0] ?? "";
  if (/summary|profile|objective|headline|intro/i.test(top)) {
    return {
      sectionPhrase: "the summary",
      whyItMatters: "it's the first thing recruiters read and yours leads with generic phrases that get skipped",
      howToAct: "Hit 'Fix top 3' on the right when you're ready, or ask me anything about the report.",
    };
  }
  if (/skills?|keyword|stack|tech list|tools/i.test(top)) {
    return {
      sectionPhrase: "your skills",
      whyItMatters: "the keyword section is what ATS scans against the JD before a human ever sees you",
      howToAct: "Hit 'Fix top 3' on the right when you're ready, or ask me anything about the report.",
    };
  }
  if (/bullet|impact|metric|quantif|achievement|wins/i.test(top)) {
    return {
      sectionPhrase: "your experience bullets",
      whyItMatters: "weak bullets are where most candidates lose the recruiter's attention in the first six seconds",
      howToAct: "Hit 'Fix top 3' on the right when you're ready, or ask me anything about the report.",
    };
  }
  return {
    sectionPhrase: "the top priority",
    whyItMatters: "this is the highest-impact change we can make on your resume right now",
    howToAct: "Hit 'Fix top 3' on the right when you're ready, or ask me anything about the report.",
  };
}

// Look at sub-scores, find the weakest by percentage, return a recommendation
// tailored to that category. Returns null if sub-scores aren't populated.
function pickActionFromWeakestSubScore(analysis: ResumeAnalysis): Action | null {
  const s = analysis.scores;
  if (!s) return null;
  const cats = [
    { key: "ats",      score: s.atsCompatibility?.score ?? 0,    max: s.atsCompatibility?.max ?? 20 },
    { key: "content",  score: s.contentImpact?.score ?? 0,        max: s.contentImpact?.max ?? 25 },
    { key: "format",   score: s.structureFormatting?.score ?? 0,  max: s.structureFormatting?.max ?? 20 },
    { key: "keywords", score: s.keywordCoverage?.score ?? 0,      max: s.keywordCoverage?.max ?? 20 },
    { key: "seniority",score: s.senioritySignal?.score ?? 0,      max: s.senioritySignal?.max ?? 15 },
  ].filter((c) => c.max > 0);
  if (cats.length === 0) return null;

  // Find the weakest by percentage. Tie-break: lower absolute score first.
  cats.sort((a, b) => (a.score / a.max) - (b.score / b.max) || a.score - b.score);
  const weakest = cats[0];
  const pct = Math.round((weakest.score / weakest.max) * 100);

  // Don't bother recommending a "weak" area if it's actually fine (≥80%).
  // In that rare case let the priority-list fallback drive the recommendation.
  if (pct >= 80) return null;

  switch (weakest.key) {
    case "ats":
      return {
        sectionPhrase: "your ATS compatibility",
        whyItMatters: `it's your weakest area at ${weakest.score}/${weakest.max} (${pct}%) — ATS bots reject before a human sees the resume`,
        howToAct: "Hit 'Fix top 3' on the right — the action plan leads with the ATS fixes.",
      };
    case "content":
      return {
        sectionPhrase: "your experience bullets",
        whyItMatters: `Content scored lowest at ${weakest.score}/${weakest.max} (${pct}%) — too many bullets read like task lists, not impact`,
        howToAct: "Hit 'Fix top 3' on the right — the action plan rewrites your weakest bullets first.",
      };
    case "format":
      return {
        sectionPhrase: "your section structure",
        whyItMatters: `Format is your weakest at ${weakest.score}/${weakest.max} (${pct}%) — section ordering and header format hurt scannability`,
        howToAct: "Hit 'Fix top 3' on the right — top fixes restructure the layout.",
      };
    case "keywords":
      return {
        sectionPhrase: "your skills section",
        whyItMatters: `Keyword Coverage is lowest at ${weakest.score}/${weakest.max} (${pct}%) — target-role keywords missing means ATS filters you out before a human reads`,
        howToAct: "Hit 'Fix top 3' on the right — the action plan injects missing target-role keywords.",
      };
    case "seniority":
      return {
        sectionPhrase: "your seniority signals",
        whyItMatters: `Seniority is your weakest at ${weakest.score}/${weakest.max} (${pct}%) — recruiters can't tell your scope or ownership at a glance`,
        howToAct: "Hit 'Fix top 3' on the right — the action plan adds leadership and scope signals to your bullets.",
      };
    default:
      return null;
  }
}

// ── Legacy fallback (kept verbatim for the rare case where analysis is missing)
function buildLegacyWelcome(ext: ResumeExtraction, firstName: string): string {
  const years = ext.totalYearsExperience ?? null;
  const field = inferField(ext);
  const realJob = firstRealJob(ext);

  const yearsPhrase = describeYears(years); // "about 1 year in" / "almost 5 years in"
  const headerParts: string[] = [`Hey ${firstName} —`];
  if (realJob?.title && realJob?.company) {
    const article = articleFor(realJob.title);
    headerParts.push(`I've read through your resume. ${article.charAt(0).toUpperCase() + article.slice(1)} ${realJob.title} at ${realJob.company}`);
    if (yearsPhrase) {
      headerParts.push(`, ${yearsPhrase} ${field}`);
    }
    headerParts.push(".");
  } else if (yearsPhrase) {
    headerParts.push(`read through your resume. ${yearsPhrase.charAt(0).toUpperCase() + yearsPhrase.slice(1)} ${field}.`);
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
