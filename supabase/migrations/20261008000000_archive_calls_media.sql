-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-08.

alter table public.clients
  add column archived_at timestamptz,
  add column archive_reason text check (archive_reason in ('spam','archived')),
  add column archived_by text not null default '';
create index clients_archived_idx on public.clients (archived_at) where archived_at is not null;

alter table public.messages
  add column call_status text not null default '',
  add column duration_seconds int,
  add column attachments jsonb not null default '[]'::jsonb;
create index messages_calls_idx on public.messages (occurred_at desc) where channel in ('Call','Missed call','Voicemail');

create or replace view public.client_overview with (security_invoker = true) as
select
  c.id, c.business_id, c.name, c.project, c.phone, c.email, c.owner_id,
  lm.occurred_at as last_message_at, lm.direction as last_direction, lm.channel as last_channel, lm.body as last_body,
  (select count(*) from public.contacts ct where ct.client_id = c.id and ct.status = 'Open')::int as waiting,
  c.archived_at, c.archive_reason
from public.clients c
left join lateral (
  select m.occurred_at, m.direction, m.channel, m.body
  from public.messages m where m.client_id = c.id
  order by m.occurred_at desc limit 1
) lm on true;
