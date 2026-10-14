import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { accountStateKey, resolveGhlAccounts } from "./ghl-accounts";
import { formatStamp } from "@/lib/format-time";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One business's GoHighLevel connection, as admins see it. Never includes a token. */
export interface GhlHealth {
  businessId: string;
  businessName: string;
  /** Set on the Businesses page; empty when unset (even if it uses GHL_LOCATION_ID). */
  locationId: string;
  connected: boolean;
  /** Uses GHL_LOCATION_ID from Vercel rather than a location set on the Businesses page. */
  inherited: boolean;
  missing: string[];
  lastOkAt?: string;
  lastError?: string;
}

/** Every business with how its GHL sub-account is doing, oldest business first. Read with the admin's own access. */
export async function loadGhlHealth(supabase: Supabase): Promise<GhlHealth[]> {
  const [{ data: businesses }, { data: syncs }] = await Promise.all([
    supabase.from("businesses").select("id, name, ghl_location_id").order("created_at"),
    supabase.from("integration_state").select("key, value").like("key", "ghl_sync%"),
  ]);
  const accounts = resolveGhlAccounts(businesses ?? []);
  return (businesses ?? []).map((b) => {
    const a = accounts.find((x) => x.businessId === b.id);
    const sync = (a && (syncs ?? []).find((s) => s.key === accountStateKey("ghl_sync", a))?.value) as
      | { lastOkAt?: string; lastError?: string }
      | undefined;
    return {
      businessId: b.id,
      businessName: b.name,
      locationId: b.ghl_location_id ?? "",
      connected: Boolean(a),
      inherited: Boolean(a && !b.ghl_location_id),
      missing: a?.missing ?? [],
      lastOkAt: sync?.lastOkAt,
      lastError: sync?.lastError,
    };
  });
}

/** A one-line status: "Connected · last synced …", or what's wrong. */
export function ghlStatusLine(h: GhlHealth, timeZone: string): { text: string; ok: boolean } {
  if (!h.connected) return { text: "Not connected", ok: false };
  if (h.missing.length) return { text: `Add ${h.missing.join(" and ")} in Vercel`, ok: false };
  if (h.lastError) return { text: `Sync problem: ${h.lastError}`, ok: false };
  if (h.lastOkAt) return { text: `Connected · last synced ${formatStamp(h.lastOkAt, timeZone)}`, ok: true };
  return { text: "Connected · waiting for the first sync", ok: true };
}
