# Stackle Auth — Setup Steps

The code is shipped. The dashboard work is yours. ~30 minutes total.

## 1 · Run the migration

In Supabase Studio → **SQL Editor** → paste the contents of:

```
supabase/migrations/20260507000000_users_profile_and_rls.sql
```

…and run it. Idempotent. Creates `public.users`, the auto-create trigger, RLS policies, and backfills profile rows for existing auth users.

You can also run it via the CLI:

```bash
supabase db push
```

…if your local schema is in sync with the remote.

## 2 · Configure OAuth providers

Supabase Studio → **Authentication → Providers**. Enable each one and paste the credentials.

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application).
2. **Authorized redirect URI:** `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase Studio shows the exact URL on the provider page).
3. Copy Client ID + Client Secret into the Supabase Google provider form.
4. Toggle **Enabled** → Save.

### LinkedIn (provider name in Supabase: `linkedin_oidc`)

1. [LinkedIn Developer Portal](https://www.linkedin.com/developers/) → Create App.
2. **Redirect URLs:** add `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. Under **OAuth 2.0 → Scopes**, request: `openid email profile`.
4. Note: Stackle uses the OIDC variant (`linkedin_oidc`). The legacy `linkedin` provider is deprecated.
5. Copy Client ID + Client Secret into the Supabase LinkedIn (OIDC) provider form.
6. Toggle **Enabled** → Save.

### GitHub

1. [GitHub Developer Settings](https://github.com/settings/developers) → New OAuth App.
2. **Authorization callback URL:** `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. Generate a client secret. Copy Client ID + Secret into the Supabase GitHub provider form.
4. Toggle **Enabled** → Save.

## 3 · Allow-list the redirect URLs in Supabase

Authentication → **URL Configuration → Redirect URLs**. Make sure these are listed:

```
http://localhost:3000/auth/callback
https://app.stackle.io/auth/callback
```

(Add staging / preview URLs as needed.)

## 4 · Email template

Authentication → **Email Templates → Magic Link** (and **Confirm Signup** if you use email+password). Make sure the template body includes `{{ .ConfirmationURL }}` so the redirect resolves to `/auth/callback`.

## 5 · Verify

After the dashboard work:

1. `npm run dev`
2. Visit `http://localhost:3000/signup` — sign up with email+password.
3. Check your inbox for the confirmation email. Click the link → land on `/`.
4. Open Supabase Studio → **Table Editor → public.users** — your row should be there with `subscription_tier = 'free'`.
5. Sign out (settings → log out, or call `supabase.auth.signOut()` from the console).
6. Visit `/dashboard` (or any non-public route) — should redirect to `/signin?next=/dashboard`.
7. Sign in via OAuth → land back on the originally-requested route.

## 6 · App-side cleanup (optional but recommended)

The app currently allows unauth use via localStorage fallback (Drive + Chats both have a localStorage path). With auth required by middleware, that fallback is now dead code for non-public routes — keep it for now (unauth users on the landing page might still hit the home `/` flow), but plan a follow-up commit to remove it once auth is locked in.

## 7 · Troubleshooting

**"Redirected to /signin in a loop"**
Middleware can't find a session cookie. Check that the Supabase URL + anon key are set in your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

**"OAuth provider returned an error"**
Most often: the redirect URL in the provider's console doesn't match the Supabase callback. Make sure both lists agree on `https://<project-ref>.supabase.co/auth/v1/callback`.

**"profile row didn't get created"**
The trigger fires on auth.users INSERT. If you backfilled users before running the migration, the bottom of the migration file has a backfill INSERT — re-run the file (it's idempotent).

**"users table doesn't exist"**
The migration didn't run. See step 1.
