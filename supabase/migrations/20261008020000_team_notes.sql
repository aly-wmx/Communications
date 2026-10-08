-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-08.
create table public.team_notes (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.clients(id) on delete cascade,
  author_id text references public.team_members(id) on delete set null,
  body text not null check (length(trim(body)) > 0 and length(body) <= 4000),
  mentions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index team_notes_client_idx on public.team_notes (client_id, created_at desc);
create index team_notes_channel_idx on public.team_notes (created_at desc) where client_id is null;
alter table public.team_notes enable row level security;
create policy "team read" on public.team_notes for select to authenticated using ((select public.is_team_member()));
create policy "post as self" on public.team_notes for insert to authenticated
  with check ((select public.is_team_member()) and author_id = (select public.current_member_id()));
create policy "delete own or admin" on public.team_notes for delete to authenticated
  using (author_id = (select public.current_member_id()) or (select public.current_member_role()) = 'admin');
alter publication supabase_realtime add table public.team_notes;
