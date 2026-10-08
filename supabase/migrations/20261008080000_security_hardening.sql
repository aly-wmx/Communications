-- Security hardening from the October 2026 audit.
--
-- 1. Team access now requires a verified sign-in. The email is read from
--    auth.users (only counted once confirmed) instead of the token's email claim.
-- 2. Signed-in browsers can no longer rewrite the audit trail: contact history
--    and escalations are append-only, new history entries must be by the person
--    signed in, and "who did it" columns can only name yourself.
--    The server (service role) is unaffected.
-- 3. Notifications: members can only change read_at on their own rows.

create or replace function public.verified_session_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null and coalesce(u.email, '') <> '';
$$;
revoke all on function public.verified_session_email() from public, anon;
grant execute on function public.verified_session_email() to authenticated;

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where email <> '' and lower(email) = public.verified_session_email()
  );
$$;

create or replace function public.current_member_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.team_members
  where email <> '' and lower(email) = public.verified_session_email()
  limit 1;
$$;

create or replace function public.current_member_id()
returns text language sql stable security definer set search_path = '' as $$
  select id from public.team_members
  where email <> '' and lower(email) = public.verified_session_email()
  limit 1;
$$;

-- True only for requests made with a signed-in user's token (not the server's key).
create or replace function public.is_browser_session()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'authenticated';
$$;

-- Does `next` start with every element of `prev`, in order?
create or replace function public.jsonb_array_extends(prev jsonb, next jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when coalesce(jsonb_array_length(prev), 0) = 0 then true
    when jsonb_array_length(next) < jsonb_array_length(prev) then false
    else (
      select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
      from jsonb_array_elements(next) with ordinality as t(e, i)
      where i <= jsonb_array_length(prev)
    ) = prev
  end;
$$;

create or replace function public.guard_contact_audit()
returns trigger language plpgsql set search_path = '' as $$
declare
  me text := public.current_member_id();
  added jsonb;
begin
  if not public.is_browser_session() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if jsonb_array_length(coalesce(new.escalations, '[]'::jsonb)) > 0 then
      raise exception 'Escalations are recorded by the server.' using errcode = '42501';
    end if;
    added := coalesce(new.history, '[]'::jsonb);
  else
    if new.escalations is distinct from old.escalations then
      raise exception 'Escalations are recorded by the server.' using errcode = '42501';
    end if;
    if not public.jsonb_array_extends(coalesce(old.history, '[]'::jsonb), coalesce(new.history, '[]'::jsonb)) then
      raise exception 'Contact history can only be added to.' using errcode = '42501';
    end if;
    if new.client_id is distinct from old.client_id or new.created_at is distinct from old.created_at then
      raise exception 'That field can''t be changed.' using errcode = '42501';
    end if;
    if new.responded_by_id is distinct from old.responded_by_id
       and coalesce(new.responded_by_id, '') not in ('', coalesce(me, '')) then
      raise exception 'You can only record a response as yourself.' using errcode = '42501';
    end if;
    added := coalesce(
      (select jsonb_agg(e) from jsonb_array_elements(new.history) with ordinality as t(e, i)
       where i > coalesce(jsonb_array_length(old.history), 0)),
      '[]'::jsonb);
  end if;

  if exists (select 1 from jsonb_array_elements(added) e where coalesce(e ->> 'byId', '') <> coalesce(me, '')) then
    raise exception 'History entries must be your own.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists contacts_guard_audit on public.contacts;
create trigger contacts_guard_audit before insert or update on public.contacts
  for each row execute function public.guard_contact_audit();

create or replace function public.guard_client_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.is_browser_session() or public.current_member_role() = 'admin' then
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
create trigger clients_guard_fields before update on public.clients
  for each row execute function public.guard_client_fields();

-- Stage changes are always credited to whoever made them.
create or replace function public.stamp_stage_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.is_browser_session() then
    new.changed_by := coalesce(public.current_member_id(), new.changed_by);
  end if;
  return new;
end;
$$;

drop trigger if exists client_stage_history_stamp on public.client_stage_history;
create trigger client_stage_history_stamp before insert on public.client_stage_history
  for each row execute function public.stamp_stage_change();

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
