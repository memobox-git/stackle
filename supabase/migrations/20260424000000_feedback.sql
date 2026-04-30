-- Feedback table for the floating "Send feedback" widget.
-- Anyone (auth or not) can insert. Only service-role can read/update.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  message     text not null,
  severity    text not null check (severity in ('bug', 'suggestion', 'praise')),
  email       text,
  page_url    text,
  user_agent  text,
  viewport    text,
  status      text not null default 'open' check (status in ('open', 'triaged', 'closed')),
  notes       text
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_severity_idx on public.feedback (severity);
create index if not exists feedback_status_idx on public.feedback (status);

-- Row-level security: anyone can submit, but only authenticated users with
-- the right role can read. Adjust to taste — for a soft launch you can
-- skip the read-policy and inspect via the Supabase Studio.
alter table public.feedback enable row level security;

create policy "Anyone can insert feedback"
  on public.feedback for insert
  to anon, authenticated
  with check (true);

-- No SELECT policy → only service-role / direct DB access can read. That's
-- intentional: feedback may contain sensitive details users wouldn't want
-- visible to other users.
