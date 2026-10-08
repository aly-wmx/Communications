-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-08.

alter table public.messages add column ghl_user_id text not null default '';

create table public.ghl_users (
  id text primary key,
  name text not null default '',
  email text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.ghl_users enable row level security;
create policy "team read" on public.ghl_users for select to authenticated using ((select public.is_team_member()));

create or replace view public.client_overview with (security_invoker = true) as
select
  c.id, c.business_id, c.name, c.project, c.phone, c.email, c.owner_id,
  lm.occurred_at as last_message_at, lm.direction as last_direction, lm.channel as last_channel, lm.body as last_body,
  (select count(*) from public.contacts ct where ct.client_id = c.id and ct.status = 'Open')::int as waiting,
  c.archived_at, c.archive_reason, c.stage,
  li.occurred_at as last_in_at, li.channel as last_in_channel, li.body as last_in_body, li.source as last_in_source,
  li.attachment_count as last_in_attachments
from public.clients c
left join lateral (
  select m.occurred_at, m.direction, m.channel, m.body
  from public.messages m where m.client_id = c.id
  order by m.occurred_at desc limit 1
) lm on true
left join lateral (
  select m.occurred_at, m.channel, m.body, m.source, jsonb_array_length(m.attachments) as attachment_count
  from public.messages m where m.client_id = c.id and m.direction = 'inbound'
  order by m.occurred_at desc limit 1
) li on true;
create index messages_client_inbound_idx on public.messages (client_id, occurred_at desc) where direction = 'inbound';

alter table public.team_notes add column flagged_for text references public.team_members(id) on delete set null;
