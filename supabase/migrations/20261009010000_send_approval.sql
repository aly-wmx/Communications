-- Who may send texts and emails to clients from the portal.
-- People added by an admin can send (default true, so nothing changes for the
-- current team); people who join automatically through an allowed Google
-- domain start with sending off until an admin turns it on on the Team page.

alter table public.team_members add column can_send boolean not null default true;
