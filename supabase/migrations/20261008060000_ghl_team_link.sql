-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-08.
alter table public.ghl_users add column phone text not null default '';
alter table public.team_members add column ghl_user_id text;
create unique index team_members_ghl_user_key on public.team_members (ghl_user_id) where ghl_user_id is not null;
-- Data (applied by hand): linked Reid Mason, Chris Cummings, Van Tampoa, Aly Willy and the shared
-- clients@ account to their GHL users; added reid@ and chris@ sign-in emails.
