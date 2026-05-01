-- Career goal + first-time-seen flag for the new Career Profile landing
-- screen. Both are nullable / default-false so existing rows unaffected.

alter table public.chats add column if not exists career_goal text;
alter table public.chats add column if not exists career_profile_seen boolean not null default false;
