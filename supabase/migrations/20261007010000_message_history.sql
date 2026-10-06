-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-07.

create table public.messages (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  conversation_id text not null default '',
  direction text not null check (direction in ('inbound','outbound')),
  channel text not null,
  body text not null default '',
  status text not null default '',
  sent_by_user boolean not null default false,
  source text not null default '',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index messages_client_time_idx on public.messages (client_id, occurred_at desc);
create index clients_ghl_contact_idx on public.clients (ghl_contact_id);
alter table public.messages enable row level security;
create policy "team read" on public.messages for select to authenticated using ((select public.is_team_member()));
alter publication supabase_realtime add table public.messages;

create view public.client_overview with (security_invoker = true) as
select
  c.id, c.business_id, c.name, c.project, c.phone, c.email, c.owner_id,
  lm.occurred_at as last_message_at, lm.direction as last_direction, lm.channel as last_channel, lm.body as last_body,
  (select count(*) from public.contacts ct where ct.client_id = c.id and ct.status = 'Open')::int as waiting
from public.clients c
left join lateral (
  select m.occurred_at, m.direction, m.channel, m.body
  from public.messages m where m.client_id = c.id
  order by m.occurred_at desc limit 1
) lm on true;
grant select on public.client_overview to authenticated;

-- Scheduled jobs (secret stored in Vault as 'ghl_sync_secret'):
--   ghl-sync      every minute → POST /api/ghl/sync
--   ghl-backfill  every minute → POST /api/ghl/backfill (returns immediately once done)
