-- Releasing a lock marks it expired a moment ago, so it can be taken again
-- straight away (even within the same transaction, where now() doesn't move).
create or replace function public.release_integration_lock(lock_key text)
returns void language sql security definer set search_path = '' as $$
  update public.integration_locks set locked_until = now() - interval '1 second' where key = lock_key;
$$;
