// Artifact pattern (Fix 2 — Claude-style inline cards).
//
// Every significant generator output (resume review report, tailored
// resume, cover letter, match report, study plan, interview prep notes)
// becomes an Artifact. Artifacts appear as cards inline in chat AND get
// saved to Drive. Clicking the card opens a right-pane preview.
//
// The pattern is uniform across generators so the UI never has to ask
// "is this a resume report or a cover letter" — the card component
// reads `kind` and chooses an icon, the chat just renders <ArtifactCard>.
//
// This file defines the shape. Generators construct Artifact objects;
// chat renders them. Drive persistence lives in lib/supabase/drive.ts
// and is wired per-generator.

export type ArtifactKind =
  | "resume_review"     // analysis output from runResumeAnalyzer
  | "tailored_resume"   // rewrite output from runResumeOrchestrator
  | "cover_letter"      // (V1 Job Match — week 5)
  | "match_report"      // (V1 Job Match — week 3)
  | "study_plan"        // (V1 Job Match — week 6)
  | "interview_prep";   // (V1 Job Match — week 6)

export interface Artifact {
  id: string;            // stable id — usually the underlying record id
  kind: ArtifactKind;
  title: string;         // "Swetha — Full Resume Review"
  subtitle?: string;     // "Senior Data Engineer · 8 years"
  // Optional headline metric the card shows prominently (resume score,
  // match score, readiness %, etc). Color is computed from the value
  // bucket inside ArtifactCard so generators don't have to know.
  score?: number;
  // ISO 8601. Card renders relative time ("Just now", "2h ago").
  generatedAt: string;
  // Drive linkage — the file row that backs this artifact, when saved.
  driveFileId?: string;
  // Optional preview-pane payload pointer. The chat host (page.tsx) reads
  // `kind` to decide which workspace lens / preview surface to open. For
  // resume reviews this is null because the existing Report tab handles
  // preview; for cover letters this will point to the rendered DOCX/PDF.
  previewUrl?: string;
  // When true, the card is a placeholder shown the moment the
  // generator kicks off. ArtifactCard renders a skeleton score + a
  // "Generating…" non-clickable open button. The host replaces this
  // entry in-place when the real artifact lands.
  pending?: boolean;
}

// Build an artifact from a resume-review analysis. Pulls the score and
// composes a clean title from the extracted name when available.
export function buildResumeReviewArtifact(opts: {
  id: string;
  candidateName?: string | null;
  targetRole?: string | null;
  score: number;
  generatedAt?: string;
  driveFileId?: string;
}): Artifact {
  const name = opts.candidateName?.split(/\s+/)[0] ?? "Your";
  const title = `${name} — Full Resume Review`;
  const subtitle = opts.targetRole ?? undefined;
  return {
    id: opts.id,
    kind: "resume_review",
    title,
    subtitle,
    score: opts.score,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    driveFileId: opts.driveFileId,
  };
}

// Build an artifact for a Job Match Match Report. Verdict-driven —
// the score (0-100) drives the score badge color in ArtifactCard.
export function buildMatchReportArtifact(opts: {
  id: string;
  company: string | null;
  role: string | null;
  score: number;
  generatedAt?: string;
  driveFileId?: string;
}): Artifact {
  const role = opts.role?.trim() || "Role";
  const company = opts.company?.trim();
  const title = company ? `${role} at ${company} — Match Report` : `${role} — Match Report`;
  return {
    id: opts.id,
    kind: "match_report",
    title,
    subtitle: company ? `Match analysis vs your primary resume` : undefined,
    score: opts.score,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    driveFileId: opts.driveFileId,
  };
}

// Build an artifact for a JD-tailored resume rewrite. No score badge
// — the value is in the diff, not a number. Subtitle reflects the
// target role.
export function buildTailoredResumeArtifact(opts: {
  id: string;
  company: string | null;
  role: string | null;
  generatedAt?: string;
  driveFileId?: string;
}): Artifact {
  const role = opts.role?.trim() || "Role";
  const company = opts.company?.trim();
  const title = company ? `Tailored resume — ${role} at ${company}` : `Tailored resume — ${role}`;
  return {
    id: opts.id,
    kind: "tailored_resume",
    title,
    subtitle: "Rewritten to match this JD",
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    driveFileId: opts.driveFileId,
  };
}

// Build an artifact for a Job Match study plan.
export function buildStudyPlanArtifact(opts: {
  id: string;
  company: string | null;
  role: string | null;
  itemCount: number;
  generatedAt?: string;
}): Artifact {
  const role = opts.role?.trim() || "Role";
  const company = opts.company?.trim();
  const title = company ? `Study plan — ${role} at ${company}` : `Study plan — ${role}`;
  return {
    id: opts.id,
    kind: "study_plan",
    title,
    subtitle: `${opts.itemCount} skill${opts.itemCount === 1 ? "" : "s"} prioritized`,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
  };
}

// Pretty short relative-time string for card subtitles. Pure function,
// safe to call on every render.
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const delta = Math.max(0, Date.now() - t);
  const m = Math.floor(delta / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Icon glyph per kind. Kept as a string so we can use it in className-
// styled cards without importing lucide icons inline.
export function artifactIcon(kind: ArtifactKind): string {
  switch (kind) {
    case "resume_review":   return "📊";
    case "tailored_resume": return "📄";
    case "cover_letter":    return "✉️";
    case "match_report":    return "🎯";
    case "study_plan":      return "📚";
    case "interview_prep":  return "🎤";
  }
}

// Human-readable label for the type chip on the card.
export function artifactTypeLabel(kind: ArtifactKind): string {
  switch (kind) {
    case "resume_review":   return "Resume Review";
    case "tailored_resume": return "Tailored Resume";
    case "cover_letter":    return "Cover Letter";
    case "match_report":    return "Match Report";
    case "study_plan":      return "Study Plan";
    case "interview_prep":  return "Interview Prep";
  }
}
