import { parseGhlPayload, type GhlEvent } from "@/lib/comms/ghl";
import { businessIdFor, recordGhlEvent, serviceDb, webhookSecretOk } from "@/lib/comms/ghl-store";

/**
 * GoHighLevel → client queue (pushed by a GHL workflow, within seconds).
 * POST /api/ghl/webhook?secret=…[&business=<id>]  (or header x-webhook-secret)
 *
 * Inbound: adds to the client's open contact, or opens a new one.
 * Outbound: marks the client's open contacts as responded.
 * The once-a-minute sync (/api/ghl/sync) covers the same messages; duplicates are ignored.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function POST(req: Request): Promise<Response> {
  if (!webhookSecretOk(req)) return json(401, { error: "Unauthorized" });

  let event: GhlEvent;
  try {
    event = parseGhlPayload(await req.json());
  } catch (err) {
    return json(400, { error: (err as Error).message });
  }

  // Outbound events from a workflow don't say who sent them, so an auto-reply would look like a
  // person answering. The sync picks up real replies within a minute, credited to the right person.
  if (event.direction === "outbound") return json(200, { ok: true, action: "ignored", reason: "outbound is handled by the sync" });

  try {
    const sb = serviceDb();
    const businessId = await businessIdFor(sb, new URL(req.url).searchParams.get("business"));
    const result = await recordGhlEvent(sb, event, businessId);
    return json(200, { ok: true, ...result });
  } catch (err) {
    console.error("ghl webhook failed", err);
    return json(500, { error: "Could not record the event." });
  }
}

export function GET(req: Request): Response {
  // Lets you check the URL and secret are right without sending data.
  return webhookSecretOk(req) ? json(200, { ok: true }) : json(401, { error: "Unauthorized" });
}
