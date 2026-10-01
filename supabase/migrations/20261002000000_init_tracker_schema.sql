-- Applied to Supabase project eloznbkkmkdfgjajambo (WMX Client Communications) on 2026-10-02.

-- Team members double as the login allowlist: only people listed here (by email) can read or write anything.
create table public.team_members (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  email text not null default '',
  phone text not null default '',
  escalation boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index team_members_email_key on public.team_members (lower(email)) where email <> '';

create table public.clients (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  project text not null default '',
  phone text not null default '',
  email text not null default '',
  owner_id text references public.team_members(id) on delete set null,
  notes text not null default '',
  ghl_contact_id text unique,
  created_at timestamptz not null default now()
);
create unique index clients_name_key on public.clients (lower(trim(name)));
create index clients_phone_idx on public.clients (phone) where phone <> '';

create table public.contacts (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  channel text not null check (channel in ('Call','Missed call','Voicemail','Text','Email','Portal message')),
  priority text not null default 'Normal' check (priority in ('Normal','Urgent')),
  received_at timestamptz not null,
  summary text not null default '',
  assignee_id text references public.team_members(id) on delete set null,
  status text not null default 'Open' check (status in ('Open','Waiting on client','Resolved')),
  first_response_at timestamptz,
  responded_by_id text not null default '',
  resolved_at timestamptz,
  escalations jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  source text not null default 'manual' check (source in ('manual','ghl')),
  ghl_message_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_client_idx on public.contacts (client_id);
create index contacts_assignee_idx on public.contacts (assignee_id);
create index contacts_open_idx on public.contacts (status) where status <> 'Resolved';

-- Single-row settings (the escalation matrix).
create table public.settings (
  id int primary key default 1 check (id = 1),
  sla jsonb not null,
  updated_at timestamptz not null default now()
);

-- Outgoing announcements; the record shape lives in the app, stored whole.
create table public.announcements (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where email <> '' and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['team_members','clients','contacts','settings','announcements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "team read" on public.%I for select to authenticated using ((select public.is_team_member()))', t);
    execute format('create policy "team insert" on public.%I for insert to authenticated with check ((select public.is_team_member()))', t);
    execute format('create policy "team update" on public.%I for update to authenticated using ((select public.is_team_member())) with check ((select public.is_team_member()))', t);
    execute format('create policy "team delete" on public.%I for delete to authenticated using ((select public.is_team_member()))', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

insert into public.team_members (id, name, email, escalation) values
  ('tm_van', 'Van', '', false),
  ('tm_reid', 'Reid', '', true),
  ('tm_chris', 'Chris', '', true),
  ('tm_aly', 'Aly', 'aly@wmx.group', false);

insert into public.settings (id, sla) values (1, '{
  "reminderMinutes": 60,
  "escalateMinutes": 240,
  "urgentEscalateMinutes": 0,
  "businessHours": {"enabled": true, "start": "08:00", "end": "17:00", "days": [1,2,3,4,5]},
  "defaultAssigneeId": "tm_van"
}'::jsonb);
