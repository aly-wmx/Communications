/**
 * Which GoHighLevel sub-account (location) each business uses.
 *
 * A business names its location on the Businesses page; the API token for it
 * lives only in Vercel, as GHL_API_KEY_<location id>. The original connection
 * (GHL_LOCATION_ID + GHL_API_KEY) keeps working: it belongs to the business that
 * names that location, or else the first business, so Watermark needs no change.
 */

export interface GhlAccount {
  businessId: string;
  locationId: string;
  token: string;
  /** What has to be added in Vercel before this account works; empty when ready. */
  missing: string[];
  /** The original GHL_LOCATION_ID connection, whose saved sync state predates per-business accounts. */
  isOriginal: boolean;
}

export interface BusinessForGhl {
  id: string;
  ghl_location_id: string | null;
}

type Env = Record<string, string | undefined>;

export const tokenEnvName = (locationId: string, env: Env = process.env) =>
  locationId === env.GHL_LOCATION_ID && !env[`GHL_API_KEY_${locationId}`] ? "GHL_API_KEY" : `GHL_API_KEY_${locationId}`;

function account(businessId: string, locationId: string, env: Env): GhlAccount {
  const isOriginal = locationId === (env.GHL_LOCATION_ID ?? "");
  const token = env[`GHL_API_KEY_${locationId}`] || (isOriginal ? (env.GHL_API_KEY ?? "") : "");
  return { businessId, locationId, token, missing: token ? [] : [tokenEnvName(locationId, env)], isOriginal };
}

/** Every business's GHL account. `businesses` must be oldest first. */
export function resolveGhlAccounts(businesses: BusinessForGhl[], env: Env = process.env): GhlAccount[] {
  const accounts = businesses.filter((b) => b.ghl_location_id).map((b) => account(b.id, b.ghl_location_id!, env));
  const original = env.GHL_LOCATION_ID ?? "";
  if (original && !accounts.some((a) => a.locationId === original)) {
    const first = businesses[0];
    if (first && !first.ghl_location_id) accounts.push(account(first.id, original, env));
  }
  return accounts;
}

/** Key for a per-account row in integration_state (sync cursor, backfill progress, run lock). */
export const accountStateKey = (base: string, a: Pick<GhlAccount, "locationId" | "isOriginal">) =>
  a.isOriginal ? base : `${base}:${a.locationId}`;

export const NOT_CONNECTED = "This business isn't connected to GoHighLevel yet (Businesses page).";
