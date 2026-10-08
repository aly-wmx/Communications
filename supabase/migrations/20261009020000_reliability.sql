-- Reliability fixes from the October 2026 audit.

-- 1. Run locks for background jobs (the GHL sync), so two runs never overlap.
--    A lock expires on its own, so a crashed run can't block the next one.
create table public.integration_locks (
  key text primary key,
  locked_until timestamptz not null
);
alter table public.integration_locks enable row level security; -- server only: no policies

create or replace function public.take_integration_lock(lock_key text, ttl_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  got boolean;
begin
  insert into public.integration_locks as l (key, locked_until)
  values (lock_key, now() + make_interval(secs => ttl_seconds))
  on conflict (key) do update set locked_until = excluded.locked_until
    where l.locked_until < now()
  returning true into got;
  return coalesce(got, false);
end;
$$;

create or replace function public.release_integration_lock(lock_key text)
returns void language sql security definer set search_path = '' as $$
  update public.integration_locks set locked_until = now() where key = lock_key;
$$;

revoke all on function public.take_integration_lock(text, int) from public, anon, authenticated;
revoke all on function public.release_integration_lock(text) from public, anon, authenticated;
grant execute on function public.take_integration_lock(text, int) to service_role;
grant execute on function public.release_integration_lock(text) to service_role;

-- 2. Send each notification once: a sender claims rows before delivering them,
--    so the every-minute job and an Escalate click can't both send the same one.
--    A claim lapses after 2 minutes, so a run that died mid-way is retried.
alter table public.notifications
  add column claimed_until timestamptz,
  -- Test notifications go out whatever the delivery rules say.
  add column always_send boolean not null default false;
alter table public.slack_channel_posts add column claimed_until timestamptz;

create or replace function public.claim_notifications(max_rows int)
returns setof public.notifications language sql security definer set search_path = '' as $$
  update public.notifications n
  set claimed_until = now() + interval '2 minutes'
  where n.id in (
    select id from public.notifications
    where (slack_status = 'pending' or email_status = 'pending')
      and (claimed_until is null or claimed_until < now())
    order by created_at
    limit max_rows
    for update skip locked
  )
  returning n.*;
$$;

create or replace function public.claim_channel_posts(max_rows int)
returns setof public.slack_channel_posts language sql security definer set search_path = '' as $$
  update public.slack_channel_posts p
  set claimed_until = now() + interval '2 minutes'
  where p.id in (
    select id from public.slack_channel_posts
    where status = 'pending'
      and (claimed_until is null or claimed_until < now())
    order by created_at
    limit max_rows
    for update skip locked
  )
  returning p.*;
$$;

revoke all on function public.claim_notifications(int) from public, anon, authenticated;
revoke all on function public.claim_channel_posts(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;
grant execute on function public.claim_channel_posts(int) to service_role;

-- 3. At most one open item per client, so parallel webhook/sync runs can't
--    create two and the client isn't counted twice.
create unique index contacts_one_open_per_client on public.contacts (client_id) where status = 'Open';

-- 4. Indexes for foreign keys the database advisor flagged.
create index if not exists clients_owner_idx on public.clients (owner_id);
create index if not exists ghl_messages_contact_idx on public.ghl_messages (contact_id);
create index if not exists notifications_client_idx on public.notifications (client_id);
create index if not exists notifications_contact_idx on public.notifications (contact_id);
create index if not exists team_notes_author_idx on public.team_notes (author_id);
create index if not exists team_notes_flagged_for_idx on public.team_notes (flagged_for);
