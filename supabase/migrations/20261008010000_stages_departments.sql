-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-08.

alter table public.clients
  add column stage text check (stage in (
    'New Lead','Feasibility & Vision Mapping','Architectural & Design Studio','Pre-Production & Permitting',
    'Active Construction','Client Care & Warranty','Lost Lead','Archive','Legacy'
  )),
  add column stage_changed_at timestamptz;
create index clients_stage_idx on public.clients (business_id, stage);

create table public.client_stage_history (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  from_stage text,
  to_stage text,
  changed_by text not null default '',
  changed_at timestamptz not null default now()
);
create index client_stage_history_client_idx on public.client_stage_history (client_id, changed_at desc);
alter table public.client_stage_history enable row level security;
create policy "team read" on public.client_stage_history for select to authenticated using ((select public.is_team_member()));
create policy "team insert" on public.client_stage_history for insert to authenticated with check ((select public.is_team_member()));

alter table public.team_members
  add column department text not null default '' check (department in ('', 'sales', 'design', 'construction', 'client_care'));

create or replace view public.client_overview with (security_invoker = true) as
select
  c.id, c.business_id, c.name, c.project, c.phone, c.email, c.owner_id,
  lm.occurred_at as last_message_at, lm.direction as last_direction, lm.channel as last_channel, lm.body as last_body,
  (select count(*) from public.contacts ct where ct.client_id = c.id and ct.status = 'Open')::int as waiting,
  c.archived_at, c.archive_reason, c.stage
from public.clients c
left join lateral (
  select m.occurred_at, m.direction, m.channel, m.body
  from public.messages m where m.client_id = c.id
  order by m.occurred_at desc limit 1
) lm on true;
