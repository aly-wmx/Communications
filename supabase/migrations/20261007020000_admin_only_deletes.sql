-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-07.
-- Deleting clients, contacts and announcements is admin-only (existing policies tightened in place).
alter policy "team delete" on public.clients using ((select public.current_member_role()) = 'admin');
alter policy "team delete" on public.contacts using ((select public.current_member_role()) = 'admin');
alter policy "team delete" on public.announcements using ((select public.current_member_role()) = 'admin');
