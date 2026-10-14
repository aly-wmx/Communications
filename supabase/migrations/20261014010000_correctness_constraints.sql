-- Correctness fixes from the October 2026 audit.
--
-- 1. Run locks belong to the run that took them: a run that overran its lock
--    can no longer release the lock a newer run now holds. The old one-argument
--    functions stay so code deployed before this keeps working.
-- 2. messages.sent_by_id: who sent a portal message, by team member id, so the
--    hourly send limit can't be reset by renaming yourself or shared by two
--    people with the same name.
-- 3. Database limits matching the app's validation (CLAUDE.md: validate at the
--    boundary, enforce again in the schema). Client phone/email get length
--    limits only: they arrive from GoHighLevel, and a format rule there would
--    make the sync fail on that client instead of storing what GHL has.

-- 1. Lock holders
alter table public.integration_locks add column holder uuid;

create or replace function public.take_integration_lock(lock_key text, ttl_seconds int, holder uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  got boolean;
begin
  insert into public.integration_locks as l (key, locked_until, holder)
  values (lock_key, now() + make_interval(secs => ttl_seconds), take_integration_lock.holder)
  on conflict (key) do update set locked_until = excluded.locked_until, holder = excluded.holder
    where l.locked_until < now()
  returning true into got;
  return coalesce(got, false);
end;
$$;

create or replace function public.release_integration_lock(lock_key text, holder uuid)
returns void language sql security definer set search_path = '' as $$
  update public.integration_locks l set locked_until = now() - interval '1 second'
  where l.key = lock_key and l.holder = release_integration_lock.holder;
$$;

revoke all on function public.take_integration_lock(text, int, uuid) from public, anon, authenticated;
revoke all on function public.release_integration_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.take_integration_lock(text, int, uuid) to service_role;
grant execute on function public.release_integration_lock(text, uuid) to service_role;

-- 2. Who sent it
alter table public.messages
  add column sent_by_id text references public.team_members(id) on delete set null;
create index messages_sent_by_time_idx on public.messages (sent_by_id, occurred_at desc) where sent_by_id is not null;

-- 3. Limits
alter table public.clients
  add constraint clients_project_len check (length(project) <= 120),
  add constraint clients_notes_len check (length(notes) <= 2000),
  add constraint clients_phone_len check (length(phone) <= 40),
  add constraint clients_email_len check (length(email) <= 320);

alter table public.contacts
  add constraint contacts_summary_len check (length(summary) <= 2000);

alter table public.messages
  add constraint messages_channel_check check (channel in ('Call','Missed call','Voicemail','Text','Email','Portal message')),
  add constraint messages_duration_nonneg check (duration_seconds is null or duration_seconds >= 0);

alter table public.team_members
  add constraint team_members_phone_len check (length(phone) <= 40),
  add constraint team_members_slack_id_format check (slack_user_id = '' or slack_user_id ~ '^[UW][A-Z0-9]{6,29}$');
