-- The Board: internal tickets beside client conversation items, and
-- "assigned to you" notifications.
--
-- 1. tickets: a piece of team work (optionally about a client), per business.
--    Whether one is due soon or overdue is worked out from due_at when it's read;
--    the *_notified_at columns only record that the reminder went out (like
--    contacts.reminded_at), so it's sent once.
-- 2. ticket_events: comments and history in one append-only list. Nobody edits
--    or deletes an entry from the browser.
-- 3. Access: every team member can see, create, move and comment on tickets.
--    Only managers and admins can assign a ticket to someone else; a coordinator
--    can only take it themselves (insert policy + trigger, since a policy can't
--    see the old row). Only admins delete.
-- 4. Notifications: new kinds assigned, due_soon, overdue and ticket_done, a link
--    from a notification to its ticket, and the delivery defaults chosen for the
--    Board: "assigned" goes by Slack DM and email too (admins can change it).

-- 1. Tickets
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  client_id text references public.clients(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  details text not null default '' check (length(details) <= 5000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'waiting', 'done')),
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  assignee_id text references public.team_members(id) on delete set null,
  created_by text references public.team_members(id) on delete set null,
  due_at timestamptz,
  done_at timestamptz,
  due_soon_notified_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_done_at_matches_status check ((status = 'done') = (done_at is not null))
);
create index tickets_business_status_idx on public.tickets (business_id, status);
create index tickets_assignee_open_idx on public.tickets (assignee_id) where status <> 'done';
create index tickets_client_idx on public.tickets (client_id) where client_id is not null;
create index tickets_due_open_idx on public.tickets (due_at) where status <> 'done' and due_at is not null;

alter table public.tickets enable row level security;
create policy "team read" on public.tickets for select to authenticated using ((select public.is_team_member()));
create policy "team create" on public.tickets for insert to authenticated with check (
  (select public.is_team_member())
  and created_by = (select public.current_member_id())
  and (
    assignee_id is null
    or assignee_id = (select public.current_member_id())
    or (select public.current_member_role()) in ('admin', 'manager')
  )
);
create policy "team update" on public.tickets for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "admin delete" on public.tickets for delete to authenticated using ((select public.current_member_role()) = 'admin');

-- What a policy can't check: changes compared with the old row.
create or replace function public.guard_ticket_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  me text := public.current_member_id();
begin
  new.updated_at := now();
  if not public.is_browser_session() then
    return new;
  end if;
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'That field can''t be changed.' using errcode = '42501';
  end if;
  if new.business_id is distinct from old.business_id and public.current_member_role() <> 'admin' then
    raise exception 'Only an admin can move a ticket to another business.' using errcode = '42501';
  end if;
  -- Coordinators can take a ticket, or let go of one they hold; only managers and admins assign others.
  if new.assignee_id is distinct from old.assignee_id
     and public.current_member_role() not in ('admin', 'manager')
     and not (new.assignee_id = me or (new.assignee_id is null and old.assignee_id = me)) then
    raise exception 'Only a manager or admin can assign a ticket to someone else.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tickets_guard_update before update on public.tickets
  for each row execute function public.guard_ticket_update();

alter publication supabase_realtime add table public.tickets;

-- 2. Comments and history
create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id text references public.team_members(id) on delete set null,
  kind text not null check (kind in ('comment', 'created', 'status', 'assigned', 'priority', 'due', 'edited', 'client')),
  body text not null default '' check (length(body) <= 5000),
  mentions text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint ticket_events_comment_has_text check (kind <> 'comment' or length(trim(body)) > 0)
);
create index ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);
alter publication supabase_realtime add table public.ticket_events;

alter table public.ticket_events enable row level security;
create policy "team read" on public.ticket_events for select to authenticated using ((select public.is_team_member()));
-- Entries are always your own; there is no update or delete policy (append-only).
create policy "own entries" on public.ticket_events for insert to authenticated
  with check ((select public.is_team_member()) and author_id = (select public.current_member_id()));

-- 3. Notifications
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('escalation', 'reminder', 'new_message', 'picked_up', 'mention', 'assigned', 'due_soon', 'overdue', 'ticket_done'));
alter table public.notifications add column ticket_id uuid references public.tickets(id) on delete cascade;
create index notifications_ticket_idx on public.notifications (ticket_id) where ticket_id is not null;

alter table public.settings drop constraint settings_email_kinds_valid;
alter table public.settings drop constraint settings_dm_kinds_valid;
alter table public.settings drop constraint settings_channel_events_valid;
alter table public.settings
  add constraint settings_email_kinds_valid check (email_kinds <@ array['escalation', 'picked_up', 'mention', 'reminder', 'new_message', 'assigned', 'due_soon', 'overdue', 'ticket_done']),
  add constraint settings_dm_kinds_valid check (dm_kinds <@ array['escalation', 'picked_up', 'mention', 'reminder', 'new_message', 'assigned', 'due_soon', 'overdue', 'ticket_done']),
  add constraint settings_channel_events_valid check (slack_channel_events <@ array['escalation', 'picked_up', 'mention', 'reminder', 'new_message', 'assigned', 'due_soon', 'overdue', 'ticket_done']);

-- Defaults chosen for the Board: "assigned to you" by email and Slack DM; due-soon and overdue by Slack DM.
update public.settings set
  email_kinds = (select array_agg(distinct k) from unnest(email_kinds || array['assigned']) k),
  dm_kinds = (select array_agg(distinct k) from unnest(dm_kinds || array['assigned', 'due_soon', 'overdue']) k)
where id = 1;
