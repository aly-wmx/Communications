-- Applied to Supabase project eloznbkkmkdfgjajambo on 2026-10-08.
alter table public.settings
  add column allowed_domains text[] not null default '{}'
  check (array_length(allowed_domains, 1) is null or array_length(allowed_domains, 1) <= 10);
update public.settings set allowed_domains = array['watermarkdesignbuild.com'] where id = 1;
alter table public.settings add column blocked_emails text[] not null default '{}';
