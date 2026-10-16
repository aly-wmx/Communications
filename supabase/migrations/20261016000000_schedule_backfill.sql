-- The history copy (/api/ghl/backfill) runs every minute again, now per business.
--
-- Its first schedule was removed once Watermark's copy finished, so businesses
-- connected later (Manolo Roofing, Two Fold Kitchen and Coffee, Garrison House)
-- never had their history copied. It stays scheduled from now on: once every
-- connected business is copied, a run returns at once, and a business connected
-- later is copied without anyone having to turn this back on.
--
-- Same call and secret (Supabase Vault: ghl_sync_secret) as the ghl-sync job.

select cron.unschedule(jobid) from cron.job where jobname = 'ghl-backfill';

select cron.schedule(
  'ghl-backfill',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://communications-wmx1.vercel.app/api/ghl/backfill',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ghl_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
