-- Each business keeps its own clients and its own GoHighLevel sub-account.
--
-- 1. Client names are unique within a business, not across all of them: two
--    businesses can each have a client called "John Smith". The index keeps its
--    name so the app's "name already taken" message still matches.
--    ghl_contact_id stays globally unique: a GHL contact id names one contact.
-- 2. businesses.ghl_location_id: the GHL sub-account (location) a business's
--    messages come from. Not a secret; the API token for it stays in Vercel
--    (GHL_API_KEY_<location id>). Empty means the business uses the original
--    GHL_LOCATION_ID connection if it's the first business, or none.

drop index public.clients_name_key;
create unique index clients_name_key on public.clients (business_id, lower(trim(name)));

alter table public.businesses
  add column ghl_location_id text unique
  check (ghl_location_id ~ '^[A-Za-z0-9]{8,64}$');
