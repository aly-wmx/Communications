-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-07.

create or replace function public.current_member_id()
returns text language sql stable security definer set search_path = '' as $$
  select id from public.team_members
  where email <> '' and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;
revoke all on function public.current_member_id() from public, anon;
grant execute on function public.current_member_id() to authenticated;

alter table public.team_members add column ghl_contact_id text;
alter table public.contacts add column reminded_at timestamptz;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id text not null references public.team_members(id) on delete cascade,
  kind text not null check (kind in ('escalation','reminder','new_message','picked_up','mention')),
  title text not null,
  body text not null default '',
  link text not null default '',
  contact_id text references public.contacts(id) on delete cascade,
  client_id text references public.clients(id) on delete cascade,
  urgent boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  slack_status text not null default 'pending' check (slack_status in ('pending','sent','skipped','failed')),
  email_status text not null default 'pending' check (email_status in ('pending','sent','skipped','failed')),
  attempts int not null default 0,
  delivery_error text not null default ''
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_pending_idx on public.notifications (created_at) where slack_status = 'pending' or email_status = 'pending';
alter table public.notifications enable row level security;
create policy "own read" on public.notifications for select to authenticated using (recipient_id = (select public.current_member_id()));
create policy "own mark read" on public.notifications for update to authenticated
  using (recipient_id = (select public.current_member_id())) with check (recipient_id = (select public.current_member_id()));
alter publication supabase_realtime add table public.notifications;

create table public.notification_prefs (
  member_id text primary key references public.team_members(id) on delete cascade,
  slack boolean not null default true,
  email boolean not null default true,
  new_messages boolean not null default true,
  reminders boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy "own or admin read" on public.notification_prefs for select to authenticated
  using (member_id = (select public.current_member_id()) or (select public.current_member_role()) = 'admin');
create policy "own insert" on public.notification_prefs for insert to authenticated with check (member_id = (select public.current_member_id()));
create policy "own update" on public.notification_prefs for update to authenticated
  using (member_id = (select public.current_member_id())) with check (member_id = (select public.current_member_id()));

-- Scheduled: notify-run every minute → POST /api/notify/run (reminders, auto-escalation, Slack/email delivery).
