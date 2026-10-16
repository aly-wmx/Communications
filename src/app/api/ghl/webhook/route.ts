import { parseGhlPayload, type GhlEvent } from "@/lib/comms/ghl";
import { ghlAccounts, recordGhlEvent, serviceDb, webhookSecretKnown, webhookSecretOk, type Db } from "@/lib/comms/ghl-store";

/**
 * GoHighLevel → client queue (pushed by a GHL workflow, within seconds).
 * POST /api/ghl/webhook?secret=…  (or header x-webhook-secret)
 *
 * The business is the one connected to the GHL sub-account (location) that
 * sent it. A sub-account that isn't connected to a business is ignored, never
 * filed under another business. A payload that names no location belongs to
 * the original connection (GHL_LOCATION_ID). The secret is checked per
 * sub-account (see webhookSecretOk).
 *
 * Inbound: adds to the client's open contact, or opens a new one.
 * The once-a-minute sync (/api/ghl/sync) covers the same messages; duplicates are ignored.
 */

/** GHL workflow payloads name their sub-account as location.id (older ones: locationId). */
function locationIdIn(payload: unknown): string {
  const p = payload as { location?: { id?: unknown }; locationId?: unknown } | null;
  const id = p?.location?.id ?? p?.locationId;
  return typeof id === "string" ? id : "";
}

/** The business for this sub-account, or null when it isn't connected to one. */
async function businessFor(sb: Db, location: string): Promise<string | null> {
  const accounts = await ghlAccounts(sb);
  const account = location ? accounts.find((a) => a.locationId === location) : accounts.find((a) => a.isOriginal);
  return account?.businessId ?? null;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(req: Request): Promise<Response> {
  let event: GhlEvent;
  let location: string;
  try {
    const payload = await req.json();
    location = locationIdIn(payload);
    // Checked before anything is parsed further or written.
    if (!webhookSecretOk(req, location)) return json(401, { error: "Unauthorized" });
    event = parseGhlPayload(payload);
  } catch (err) {
    return json(400, { error: (err as Error).message });
  }

  // Outbound events from a workflow don't say who sent them, so an auto-reply would look like a
  // person answering. The sync picks up real replies within a minute, credited to the right person.
  if (event.direction === "outbound") return json(200, { ok: true, action: "ignored", reason: "outbound is handled by the sync" });

  try {
    const sb = serviceDb();
    const businessId = await businessFor(sb, location);
    if (!businessId) return json(200, { ok: true, action: "ignored", reason: "that GoHighLevel sub-account isn't connected to a business" });
    const result = await recordGhlEvent(sb, event, businessId);
    return json(200, { ok: true, ...result });
  } catch (err) {
    console.error("ghl webhook failed", err);
    return json(500, { error: "Could not record the event." });
  }
}

export function GET(req: Request): Response {
  // Lets you check the URL and secret are right without sending data.
  return webhookSecretKnown(req) ? json(200, { ok: true }) : json(401, { error: "Unauthorized" });
}
