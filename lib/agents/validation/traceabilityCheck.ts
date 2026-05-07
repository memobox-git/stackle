// ── Traceability Check ────────────────────────────────────────────────────
// Detects hallucinated facts (numbers, technologies) in a rewritten section
// that don't appear anywhere in the original extraction.
//
// The contract: every quantitative claim and every named technology in a
// rewrite MUST be traceable back to the original resume. If the LLM invented
// "by 35%" or "Apache Airflow" out of thin air, this catches it before the
// content reaches the user.
//
// Usage:
//   const issues = checkTraceability(rewrittenText, extraction);
//   if (issues.length > 0) → regenerate or surface to user.

import type { ResumeExtraction } from "../schemas/resumeExtraction";

export type TraceabilityIssue = {
  kind: "metric" | "technology" | "company" | "title";
  claim: string;
  message: string;
};

// Numeric-claim regex set. Captures the kinds of metrics writers typically
// invent. Conservative — we only flag things shaped like "by X%" / "$X" /
// "Nx" / "5+ analysts" / counts. Time durations like "daily" pass.
//
// Critical update (after user reported "50+ analysts" / "15+ global markets"
// / "20+ heterogeneous source feeds" being fabricated): we now catch ANY
// digit followed by "+" (the "10+", "50+", "200+" pattern most writers
// reach for to invent precision they don't have).
const METRIC_PATTERNS: RegExp[] = [
  /\b(\d+(?:\.\d+)?)\s*%/g,                        // 35%, 12.5%
  /\$\s?(\d+(?:[.,]\d+)?)\s*[kKmMbB]?/g,           // $150K, $2M
  /\b(\d+(?:\.\d+)?)\s*[kKmMbB]\b/g,               // 2M records, 500K rows
  /\b(\d+(?:\.\d+)?)\s*x\b/gi,                     // 3x, 10x
  /\b(\d+\+)/g,                                    // 50+, 15+, 12+, 200+ — "+ suffix" counts
  /\b(\d{2,})\b/g,                                 // any 2+ digit standalone number (50, 150, 1000)
];

// Pull every quantitative substring out of a body of text.
function extractMetrics(text: string): string[] {
  const hits = new Set<string>();
  for (const re of METRIC_PATTERNS) {
    let m: RegExpExecArray | null;
    const reGlobal = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    while ((m = reGlobal.exec(text)) !== null) {
      hits.add(m[0].trim().toLowerCase());
    }
  }
  return Array.from(hits);
}

// Build a single haystack string from every text-bearing field on the
// extraction so we can check whether a rewrite's claims appear ANYWHERE in
// the original.
function buildOriginalHaystack(ext: ResumeExtraction): string {
  const parts: string[] = [];
  parts.push(ext.summary ?? "");
  for (const exp of ext.experience ?? []) {
    parts.push(exp.title ?? "");
    parts.push(exp.company ?? "");
    parts.push(exp.startDate ?? "");
    parts.push(exp.endDate ?? "");
    for (const b of exp.bullets ?? []) parts.push(b);
  }
  for (const p of ext.projects ?? []) {
    parts.push(p.name ?? "");
    parts.push(p.description ?? "");
    for (const t of p.tech ?? []) parts.push(t);
  }
  for (const e of ext.education ?? []) {
    parts.push(e.degree ?? "");
    parts.push(e.field ?? "");
    parts.push(e.institution ?? "");
    parts.push(e.gpa ?? "");
  }
  for (const c of ext.certifications ?? []) {
    parts.push(c.name ?? "");
    parts.push(c.issuer ?? "");
  }
  for (const g of ext.skillGroups ?? []) {
    parts.push(g.category ?? "");
    for (const s of g.skills ?? []) parts.push(s);
  }
  return parts.join(" ").toLowerCase();
}

// A short list of well-known technologies. If a rewrite mentions one of
// these and it's NOT in the original, that's a hallucinated claim.
// The list is intentionally narrow — only techs that are commonly
// fabricated to chase missing-keyword targets. Generic verbs and product
// names that vary in spelling are kept out to avoid false positives.
const NOTABLE_TECHS = [
  "airflow",
  "dbt",
  "snowflake",
  "databricks",
  "bigquery",
  "redshift",
  "delta lake",
  "terraform",
  "kubernetes",
  "docker",
  "kafka",
  "spark",
  "pyspark",
  "hadoop",
  "tensorflow",
  "pytorch",
  "scikit-learn",
  "xgboost",
  "mlflow",
  "great expectations",
  "monte carlo",
  "soda",
  "prefect",
  "dagster",
  "fivetran",
  "tableau",
  "power bi",
  "looker",
  "mode",
];

// Run the traceability check on a single rewritten string (bullet, summary,
// project description, etc) against the candidate's original extraction.
// Returns an array of issues — empty array means the rewrite is clean.
//
// Algorithm: extract metric SETS from both the rewrite and the original
// haystack using the same regex. Any metric in the rewrite-set that's NOT
// in the original-set is flagged as invented. This is more robust than
// substring matching (which let "50" pass when haystack contained "503"
// or "2050").
export function checkTraceability(rewritten: string, original: ResumeExtraction): TraceabilityIssue[] {
  if (!rewritten || !rewritten.trim()) return [];
  const issues: TraceabilityIssue[] = [];
  const haystack = buildOriginalHaystack(original);

  // 1. Metrics — set-difference, not substring.
  const rewrittenMetrics = new Set(extractMetrics(rewritten));
  const originalMetrics = new Set(extractMetrics(haystack));
  for (const metric of rewrittenMetrics) {
    if (originalMetrics.has(metric)) continue;
    // Allow numeric matches that differ only by leading/trailing whitespace
    // or a trailing "+" suffix vs no suffix ("50+" passes if "50" is in
    // original, since the candidate clearly has at least 50 of whatever).
    const stripped = metric.replace(/[+\s]/g, "");
    if (originalMetrics.has(stripped)) continue;
    if (originalMetrics.has(stripped + "+")) continue;
    // 4-digit numbers are likely years — be generous (they often appear
    // in dates the writer can legitimately reference).
    if (/^\d{4}$/.test(stripped)) continue;
    issues.push({
      kind: "metric",
      claim: metric,
      message: `"${metric}" is not in the original — looks invented. Either remove it or replace with a scope phrase ("across multiple", "high-volume", "production-grade").`,
    });
  }

  // 2. Technologies — named tools mentioned in the rewrite must appear
  // somewhere in the original. Word-boundary check against the haystack.
  const rewrittenLC = rewritten.toLowerCase();
  for (const tech of NOTABLE_TECHS) {
    const techRe = new RegExp(`\\b${tech.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (techRe.test(rewrittenLC) && !techRe.test(haystack)) {
      issues.push({
        kind: "technology",
        claim: tech,
        message: `"${tech}" appears in the rewrite but not in the original resume. Don't claim experience the candidate doesn't have.`,
      });
    }
  }

  return issues;
}

// Convenience: format issues into a single feedback paragraph the writer
// can re-consume on a regenerate pass.
export function describeIssues(issues: TraceabilityIssue[]): string {
  if (issues.length === 0) return "";
  return [
    "Your previous rewrite contained these traceability issues — facts that don't appear in the candidate's original resume:",
    ...issues.map((i, idx) => `  ${idx + 1}. ${i.message}`),
    "",
    "Regenerate the rewrite WITHOUT these unsupported claims. Use qualitative language ('measurably reduced X') where the original lacks numbers, instead of inventing them.",
  ].join("\n");
}
