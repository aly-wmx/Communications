-- Admin-chosen delivery rules: which notification kinds go out by email and by
-- Slack DM. Everything always shows in the portal (bell and pop-ups).
-- Defaults match the current behaviour: only escalations leave the portal.

alter table public.settings
  add column email_kinds text[] not null default array['escalation'],
  add column dm_kinds text[] not null default array['escalation'];

alter table public.settings
  add constraint settings_email_kinds_valid
    check (email_kinds <@ array['escalation', 'picked_up', 'mention', 'reminder', 'new_message']),
  add constraint settings_dm_kinds_valid
    check (dm_kinds <@ array['escalation', 'picked_up', 'mention', 'reminder', 'new_message']),
  add constraint settings_channel_events_valid
    check (slack_channel_events <@ array['escalation', 'picked_up', 'mention', 'reminder', 'new_message']);
