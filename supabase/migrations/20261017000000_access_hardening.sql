-- Access hardening and clean-up after the second audit (2026-10-17).
--
-- 1. Work given to someone who can't open its business goes back to
--    unassigned: open conversation items, open tickets, client owners. (The
--    clean-up in 20261016010000 ran before anyone had been given access, and
--    in production it changed nothing; this runs now that access exists. The
--    47 items in Manolo Roofing, Two Fold and Garrison House are the ones
--    affected.)
-- 2. Taking a business away from someone unassigns their open work there.
-- 3. A client's owner, and a ticket's client, must belong to the right business.
-- 4. From the browser, a new client can't carry a GoHighLevel contact id (only
--    the sync links clients to GHL), and ticket history other than comments is
--    written by the server only.
-- 5. member_has_business_access can't be used to look up other people's
--    access: browsers get can_assign_to(), which answers only for team members.

-- 4a. New clients from the browser: no GHL contact id, no archiving as someone else.
create or replace function public.guard_client_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_browser_session() or public.current_member_role() = 'admin' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.ghl_contact_id is not null then
      raise exception 'Only the GoHighLevel sync links a client to GoHighLevel.' using errcode = '42501';
    end if;
    if coalesce(new.archived_by, '') not in ('', coalesce(public.current_member_id(), '')) then
      raise exception 'You can only archive as yourself.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.ghl_contact_id is distinct from old.ghl_contact_id or new.business_id is distinct from old.business_id then
    raise exception 'Only an admin can change that.' using errcode = '42501';
  end if;
  if new.archived_by is distinct from old.archived_by
     and coalesce(new.archived_by, '') not in ('', coalesce(public.current_member_id(), '')) then
    raise exception 'You can only archive as yourself.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists clients_guard_fields on public.clients;
create trigger clients_guard_fields before insert or update on public.clients
  for each row execute function public.guard_client_fields();

-- 5. The assignment check runs as its owner, so browsers no longer need (or get) the raw access lookup.
create or replace function public.guard_assignee_access()
returns trigger language plpgsql security definer set search_path = '' as $$
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

-- For policies and the browser: "could this person be given work in this business?", team members only.
create or replace function public.can_assign_to(member text, business uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_team_member() and public.member_has_business_access(member, business);
$$;
revoke all on function public.can_assign_to(text, uuid) from public, anon;
grant execute on function public.can_assign_to(text, uuid) to authenticated;

drop policy "team create" on public.tickets;
create policy "team create" on public.tickets for insert to authenticated with check (
  public.has_business_access(business_id)
  and created_by = (select public.current_member_id())
  and (
    assignee_id is null
    or assignee_id = (select public.current_member_id())
    or (select public.current_member_role()) in ('admin', 'manager')
  )
  and (assignee_id is null or public.can_assign_to(assignee_id, business_id))
);

revoke execute on function public.member_has_business_access(text, uuid) from authenticated;

-- 3. A client's owner must be able to open the client's business.
create or replace function public.guard_owner_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and not public.member_has_business_access(new.owner_id, new.business_id) then
    raise exception 'That person doesn''t have access to this business.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger clients_owner_access before insert or update of owner_id, business_id on public.clients
  for each row execute function public.guard_owner_access();

-- 3. A ticket's client must be in the ticket's business.
create or replace function public.guard_ticket_client()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.client_id is not null
     and not exists (select 1 from public.clients c where c.id = new.client_id and c.business_id = new.business_id) then
    raise exception 'That client isn''t in this business.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tickets_client_business before insert or update of client_id, business_id on public.tickets
  for each row execute function public.guard_ticket_client();

-- 4b. From the browser, only comments; status/assignment/etc. history is written by the server.
drop policy "own entries" on public.ticket_events;
create policy "own comments" on public.ticket_events for insert to authenticated
  with check (kind = 'comment' and author_id = (select public.current_member_id()) and public.can_see_ticket(ticket_id));

-- 2. Taking a business away unassigns that person's open work there.
create or replace function public.release_work_on_revoke()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.team_members where id = old.member_id and role = 'admin') then
    return old; -- admins keep every business
  end if;
  update public.contacts ct set assignee_id = null
  from public.clients c
  where c.id = ct.client_id and c.business_id = old.business_id
    and ct.assignee_id = old.member_id and ct.status <> 'Resolved';
  update public.tickets set assignee_id = null
  where business_id = old.business_id and assignee_id = old.member_id and status <> 'done';
  update public.clients set owner_id = null
  where business_id = old.business_id and owner_id = old.member_id;
  return old;
end;
$$;
create trigger team_member_businesses_release after delete on public.team_member_businesses
  for each row execute function public.release_work_on_revoke();

-- 1. Clean-up, now that access has been given out.
update public.contacts ct set assignee_id = null
from public.clients c
where c.id = ct.client_id and ct.status <> 'Resolved' and coalesce(ct.assignee_id, '') <> ''
  and not public.member_has_business_access(ct.assignee_id, c.business_id);
update public.tickets set assignee_id = null
where status <> 'done' and assignee_id is not null and not public.member_has_business_access(assignee_id, business_id);
update public.clients set owner_id = null
where owner_id is not null and not public.member_has_business_access(owner_id, business_id);
