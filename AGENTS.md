<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Supabase dashboard prerequisites

Magic-link auth is wired into the onboarding flow via `supabase.auth.signInWithOtp`. For the link click to redirect back into the app, the Supabase project dashboard must have the following URLs allowlisted under **Authentication → URL Configuration → Redirect URLs**:

- `http://localhost:3000/auth/callback` (local dev)
- Production callback URL when deployed

Also confirm **Authentication → Email Templates → Magic Link** uses `{{ .ConfirmationURL }}` so the template resolves the redirect properly.

Drive writes (originals, working copies, versions, reports) require an authenticated user. If magic link is skipped during onboarding, no Drive persistence happens until the user authenticates later.

---

# Stackle agent rules — hard requirements

These are non-negotiable. The user has burned hours catching me violating them; if you find yourself rationalizing why "just this one time" is OK, stop and re-read.

## Resume handling

- **Drive resume = primary resume, always.** If a resume exists in Drive (`drive_files` with `file_type='original'`), that IS the user's resume. Never ask "do you have a resume" when one exists. Hydrate `resumeExtraction` from Drive on sign-in BEFORE the user can interact.
- **Never use placeholder brackets** like `[Your Name]`, `[Email]`, `[Phone]`, `[LinkedIn]`, `[stack]`, `[briefly describe...]`, `[mention one specific thing]` in generated content. Either use real values from the resume extraction or **omit the line entirely.** The user never fills in template brackets — we have the data.
- Generators (cover letter, tailored resume, etc.) must pass the FULL extraction including email, phone, LinkedIn, location to the agent. Adding a server-side placeholder-rejection guard is required for any new text-generation agent.

## Questionnaire UX (Claude-style intake)

- Multi-step questionnaires ask **one question per turn**, never a wall.
- Every prompt shows `N/total` — e.g. `1/4 — Which company is this for?`. Numbering recalculates when branching shrinks the effective path.
- Pills are **smart** — pulled from real context (past chats, resume skills, target role, Drive content). Never generic when context exists.
- Free-text answers always accepted alongside pills.
- Framework: `lib/intents/questionnaires.ts`. Adding a new artifact's questionnaire = one registry entry.

## Artifact pattern (Claude-style cards)

- Every significant generator output (resume review, tailored resume, cover letter, match report, study plan, interview prep, quick quiz, skill assessment, etc.) renders as an **artifact card** inline in chat.
- Card click → **right-side preview pane** slides in (`components/ArtifactPreviewPane.tsx`). Never dump the artifact body as another chat message as a shortcut.
- Every artifact card has a **Download menu** (PDF / DOCX where applicable). Use `lib/artifactExport.ts` for text-body artifacts; reuse `lib/resumeExport.ts:downloadResumePdf` for resumes.
- Cards stay inline forever. They ARE the timeline of milestones.
- Artifact kinds: `resume_review`, `tailored_resume`, `cover_letter`, `match_report`, `study_plan`, `interview_prep`, `quick_questions`, `skill_assessment`. See `lib/artifacts.ts` for the full registry + builder functions.

## Sidebar / navigation

- Sidebar is for **navigation** (where the user is). Artifact cards are for **outputs** (what they produced). They do not replace each other.
- Top-level destinations in the rail: chat surface + Drive + Foundations. Job Match and Interview Prep open via chat intent → chip → surface, not via permanent rail icons.
- Every chat self-labels with its primary artifact's icon + title. No hardcoded "Interview Prep" / "Job Match" rail entries beyond what's already there.

## Process

- **Never cut scope corners unilaterally.** If tempted to ship a lesser version of what the user asked for, stop and ask first. "I was going to skip X to save time — is that OK or do you want me to do it properly?"
- After every significant change, the user verifies on UAT before the next change ships.
- Each commit ships as its own PR-style unit so any single one can be reverted via `git revert <hash>`.
- **Anchor tag**: `artifact-foundation-v1` (commit `76822d8`) is the revert point for the dynamic-artifact build. If the user says *"go back to artifact-foundation"*, run `git reset --hard artifact-foundation-v1`.
- Never claim "fixed" until the user verifies on UAT.
- Logging instrumentation (`lib/flowLog.ts`) is live — use it. Every chat-side fetch should send `x-stackle-flow-id` header so server-side `[flow:*]` logs correlate.

## Files I touch / files I don't

When working on artifacts ONLY (the user's explicit constraint during the artifact build):

**Allowed**:
- `lib/artifacts.ts` (kinds, builders)
- `lib/intents/registry.ts`, `lib/intents/questionnaires.ts`
- `lib/agents/intentRouter.ts`
- `lib/artifactExport.ts`
- New files under `lib/agents/<artifact>/`, `app/api/agents/<artifact>/`
- `components/ArtifactCard.tsx`, `components/ArtifactPreviewPane.tsx`
- Artifact-specific chip handlers + preview routing in `app/page.tsx`

**Not touched** (unless explicitly asked):
- Sidebar nav / icons / layout
- Chat shell layout
- Resume Builder shell
- Interview Prep / Job Match surface internals
- Anything else

## Test accounts

If the user asks to delete a test account, the path is:
1. `DELETE FROM drive_files WHERE user_id = '<id>';`
2. `DELETE FROM auth.users WHERE id = '<id>';`

Run via the Supabase MCP `execute_sql`. Don't run `DELETE FROM auth.users` first — there's no `ON DELETE CASCADE` on `drive_files`.
