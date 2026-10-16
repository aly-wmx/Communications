-- Per-business access. The team list stays shared, but each manager and
-- coordinator only sees the businesses an admin has given them. Admins see all.
--
-- 1. team_member_businesses: who can open which business (admins edit it).
-- 2. ghl_user_locations: which GoHighLevel sub-accounts (businesses) each GHL
--    user belongs to, kept up to date by the sync. The Team page uses it to
--    *suggest* access; it never grants access by itself.
-- 3. has_business_access() / can_see_client() / can_see_ticket(), and every
--    policy on business data rewritten to use them: clients, conversation items,
--    messages, stage history, client notes, tickets, ticket comments,
--    announcements, and the businesses list itself. The team channel (notes
--    with no client), settings and the team list stay shared.
-- 4. Work can only be assigned to someone who can open that business.
-- 5. Starting access: every current non-admin gets the business whose GHL
--    sub-account they're a user in. Until now only Watermark's GHL users were
--    synced, so that is Watermark; other sub-accounts' users appear as
--    suggestions once the sync records them.

-- 1. Access list
create table public.team_member_businesses (
  member_id text not null references public.team_members(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  granted_by text references public.team_members(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (member_id, business_id)
);
create index team_member_businesses_business_idx on public.team_member_businesses (business_id);
alter table public.team_member_businesses enable row level security;
create policy "team read" on public.team_member_businesses for select to authenticated using ((select public.is_team_member()));
create policy "admin grant" on public.team_member_businesses for insert to authenticated
  with check ((select public.current_member_role()) = 'admin' and granted_by = (select public.current_member_id()));
create policy "admin revoke" on public.team_member_businesses for delete to authenticated using ((select public.current_member_role()) = 'admin');
alter publication supabase_realtime add table public.team_member_businesses;

-- 2. GHL users per sub-account (written by the sync with the server key only)
create table public.ghl_user_locations (
  ghl_user_id text not null references public.ghl_users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (ghl_user_id, business_id)
);
create index ghl_user_locations_business_idx on public.ghl_user_locations (business_id);
alter table public.ghl_user_locations enable row level security;
create policy "team read" on public.ghl_user_locations for select to authenticated using ((select public.is_team_member()));

-- 3. Access checks (security definer: they read the access list without
--    recursing through its own policies; search_path pinned).
create or replace function public.member_has_business_access(member text, business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where id = member and role = 'admin')
      or exists (select 1 from public.team_member_businesses where member_id = member and business_id = business);
$$;

create or replace function public.has_business_access(business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_team_member() and public.member_has_business_access(public.current_member_id(), business);
$$;

create or replace function public.can_see_client(client text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clients c where c.id = client and public.has_business_access(c.business_id));
$$;

create or replace function public.can_see_ticket(ticket uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tickets t where t.id = ticket and public.has_business_access(t.business_id));
$$;

revoke all on function public.member_has_business_access(text, uuid) from public, anon;
revoke all on function public.has_business_access(uuid) from public, anon;
revoke all on function public.can_see_client(text) from public, anon;
revoke all on function public.can_see_ticket(uuid) from public, anon;
grant execute on function public.member_has_business_access(text, uuid) to authenticated;
grant execute on function public.has_business_access(uuid) to authenticated;
grant execute on function public.can_see_client(text) to authenticated;
grant execute on function public.can_see_ticket(uuid) to authenticated;
-- The sync (server key) checks access before giving a new item to someone.
grant execute on function public.member_has_business_access(text, uuid) to service_role;

-- Businesses: only the ones you can open (admins still add and rename).
drop policy "team read" on public.businesses;
create policy "team read" on public.businesses for select to authenticated using ((select public.has_business_access(id)));

-- Clients
drop policy "team read" on public.clients;
drop policy "team insert" on public.clients;
drop policy "team update" on public.clients;
create policy "team read" on public.clients for select to authenticated using (public.has_business_access(business_id));
create policy "team insert" on public.clients for insert to authenticated with check (public.has_business_access(business_id));
create policy "team update" on public.clients for update to authenticated
  using (public.has_business_access(business_id)) with check (public.has_business_access(business_id));

-- Conversation items
drop policy "team read" on public.contacts;
drop policy "team insert" on public.contacts;
drop policy "team update" on public.contacts;
create policy "team read" on public.contacts for select to authenticated using (public.can_see_client(client_id));
create policy "team insert" on public.contacts for insert to authenticated with check (public.can_see_client(client_id));
create policy "team update" on public.contacts for update to authenticated
  using (public.can_see_client(client_id)) with check (public.can_see_client(client_id));

-- Messages (read only from the browser)
drop policy "team read" on public.messages;
create policy "team read" on public.messages for select to authenticated using (public.can_see_client(client_id));

-- Stage history
drop policy "team read" on public.client_stage_history;
drop policy "team insert" on public.client_stage_history;
create policy "team read" on public.client_stage_history for select to authenticated using (public.can_see_client(client_id));
create policy "team insert" on public.client_stage_history for insert to authenticated with check (public.can_see_client(client_id));

-- Team notes: the shared channel (no client) for everyone; notes on a client for those who can see the client.
drop policy "team read" on public.team_notes;
drop policy "post as self" on public.team_notes;
create policy "team read" on public.team_notes for select to authenticated
  using ((select public.is_team_member()) and (client_id is null or public.can_see_client(client_id)));
create policy "post as self" on public.team_notes for insert to authenticated
  with check (
    (select public.is_team_member()) and author_id = (select public.current_member_id())
    and (client_id is null or public.can_see_client(client_id))
  );

-- Tickets
drop policy "team read" on public.tickets;
drop policy "team create" on public.tickets;
drop policy "team update" on public.tickets;
create policy "team read" on public.tickets for select to authenticated using (public.has_business_access(business_id));
create policy "team create" on public.tickets for insert to authenticated with check (
  public.has_business_access(business_id)
  and created_by = (select public.current_member_id())
  and (
    assignee_id is null
    or assignee_id = (select public.current_member_id())
    or (select public.current_member_role()) in ('admin', 'manager')
  )
  and (assignee_id is null or public.member_has_business_access(assignee_id, business_id))
);
create policy "team update" on public.tickets for update to authenticated
  using (public.has_business_access(business_id)) with check (public.has_business_access(business_id));

drop policy "team read" on public.ticket_events;
drop policy "own entries" on public.ticket_events;
create policy "team read" on public.ticket_events for select to authenticated using (public.can_see_ticket(ticket_id));
create policy "own entries" on public.ticket_events for insert to authenticated
  with check (author_id = (select public.current_member_id()) and public.can_see_ticket(ticket_id));

-- Announcements
drop policy "team read" on public.announcements;
drop policy "team insert" on public.announcements;
drop policy "team update" on public.announcements;
create policy "team read" on public.announcements for select to authenticated using (public.has_business_access(business_id));
create policy "team insert" on public.announcements for insert to authenticated with check (public.has_business_access(business_id));
create policy "team update" on public.announcements for update to authenticated
  using (public.has_business_access(business_id)) with check (public.has_business_access(business_id));

-- 4. Assign only to someone who can open the business (any writer, browser or server).
create or replace function public.guard_assignee_access()
returns trigger language plpgsql set search_path = '' as $$
declare
  business uuid;
begin
  if new.assignee_id is null or new.assignee_id = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;
  if tg_table_name = 'tickets' then
    business := new.business_id;
  else
    select c.business_id into business from public.clients c where c.id = new.client_id;
  end if;
  if business is not null and not public.member_has_business_access(new.assignee_id, business) then
    raise exception 'That person doesn''t have access to this business.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tickets_assignee_access before insert or update of assignee_id on public.tickets
  for each row execute function public.guard_assignee_access();
create trigger contacts_assignee_access before insert or update of assignee_id on public.contacts
  for each row execute function public.guard_assignee_access();

-- Items and clients already given to someone who can't open that business go
-- back to unassigned (e.g. the default assignee on the businesses whose history
-- was just copied). New items from the sync check access before assigning.
update public.contacts ct set assignee_id = null
from public.clients c
where c.id = ct.client_id and coalesce(ct.assignee_id, '') <> ''
  and not public.member_has_business_access(ct.assignee_id, c.business_id);
update public.clients c set owner_id = null
where c.owner_id is not null and not public.member_has_business_access(c.owner_id, c.business_id);

-- 5. Starting access. Every GHL user synced so far came from the original
--    sub-account (the first business, Watermark), so they're recorded there,
--    and each linked non-admin gets that business.
insert into public.ghl_user_locations (ghl_user_id, business_id)
select g.id, (select id from public.businesses order by created_at limit 1)
from public.ghl_users g
on conflict do nothing;

insert into public.team_member_businesses (member_id, business_id)
select t.id, l.business_id
from public.team_members t
join public.ghl_user_locations l on l.ghl_user_id = t.ghl_user_id
where t.role <> 'admin'
on conflict do nothing;

-- Re-read every sub-account's GHL users on the next sync, so the Team page can
-- suggest access for Manolo Roofing, Two Fold and Garrison House straight away.
update public.integration_state set value = value - 'refreshedAt' where key like 'ghl_users%';
