-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-08.
alter table public.settings
  add column slack_channel_id text not null default '' check (slack_channel_id = '' or slack_channel_id ~ '^[CG][A-Z0-9]{8,}$'),
  add column slack_channel_events text[] not null default array['escalation','picked_up','mention'];
update public.settings set slack_channel_id = 'C0C7KR2UH9U' where id = 1;

create table public.slack_channel_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text not null default '',
  link text not null default '',
  urgent boolean not null default false,
  mention_member_ids text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  attempts int not null default 0,
  error text not null default '',
  created_at timestamptz not null default now()
);
create index slack_channel_posts_pending_idx on public.slack_channel_posts (created_at) where status = 'pending';
alter table public.slack_channel_posts enable row level security;
create policy "admin read" on public.slack_channel_posts for select to authenticated using ((select public.current_member_role()) = 'admin');
