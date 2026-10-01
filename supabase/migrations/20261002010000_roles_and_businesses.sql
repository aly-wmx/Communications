-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-02.
-- Note: the existing "team insert/update/delete" policies on team_members and settings
-- were tightened in place to admin-only (names kept).

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  color text not null default '#1C2B47' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);
create unique index businesses_name_key on public.businesses (lower(trim(name)));
insert into public.businesses (name, color) values ('Watermark Design Build', '#1C2B47');

alter table public.team_members
  add column role text not null default 'coordinator' check (role in ('admin','manager','coordinator')),
  add column slack_user_id text not null default '';
update public.team_members set role = 'admin' where id = 'tm_aly';
update public.team_members set role = 'manager' where id in ('tm_reid','tm_chris');

alter table public.clients add column business_id uuid not null references public.businesses(id) on delete restrict;
alter table public.announcements add column business_id uuid not null references public.businesses(id) on delete restrict;
create index clients_business_idx on public.clients (business_id);
create index announcements_business_idx on public.announcements (business_id);

create or replace function public.current_member_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.team_members
  where email <> '' and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;
revoke all on function public.current_member_role() from public, anon;
grant execute on function public.current_member_role() to authenticated;

create or replace function public.keep_an_admin()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.team_members where role = 'admin' and email <> '') then
    raise exception 'The portal needs at least one admin with an email.';
  end if;
  return null;
end;
$$;
create constraint trigger team_members_keep_admin
  after update or delete on public.team_members
  deferrable initially deferred
  for each row execute function public.keep_an_admin();

alter policy "team insert" on public.team_members with check ((select public.current_member_role()) = 'admin');
alter policy "team update" on public.team_members using ((select public.current_member_role()) = 'admin') with check ((select public.current_member_role()) = 'admin');
alter policy "team delete" on public.team_members using ((select public.current_member_role()) = 'admin');
alter policy "team insert" on public.settings with check ((select public.current_member_role()) = 'admin');
alter policy "team update" on public.settings using ((select public.current_member_role()) = 'admin') with check ((select public.current_member_role()) = 'admin');
alter policy "team delete" on public.settings using ((select public.current_member_role()) = 'admin');

alter table public.businesses enable row level security;
create policy "team read" on public.businesses for select to authenticated using ((select public.is_team_member()));
create policy "admin insert" on public.businesses for insert to authenticated with check ((select public.current_member_role()) = 'admin');
create policy "admin update" on public.businesses for update to authenticated using ((select public.current_member_role()) = 'admin') with check ((select public.current_member_role()) = 'admin');
alter publication supabase_realtime add table public.businesses;
