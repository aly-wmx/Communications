-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-07.

create table public.integration_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.integration_state enable row level security;
create policy "team read" on public.integration_state for select to authenticated using ((select public.is_team_member()));
alter publication supabase_realtime add table public.integration_state;

-- Server-only (service role): GHL message ids already processed, so sync + webhook never double-count.
create table public.ghl_messages (
  id text primary key,
  contact_id text references public.contacts(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  processed_at timestamptz not null default now()
);
alter table public.ghl_messages enable row level security;
create index ghl_messages_processed_idx on public.ghl_messages (processed_at);

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
