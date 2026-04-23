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
