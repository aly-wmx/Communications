import { parseGhlPayload, type GhlEvent } from "@/lib/comms/ghl";
import { businessIdFor, recordGhlEvent, secretOk, serviceDb } from "@/lib/comms/ghl-store";

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
  if (!secretOk(req, ["x-webhook-secret"])) return json(401, { error: "Unauthorized" });

  let event: GhlEvent;
  try {
    event = parseGhlPayload(await req.json());
  } catch (err) {
    return json(400, { error: (err as Error).message });
  }

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
  return secretOk(req, ["x-webhook-secret"]) ? json(200, { ok: true }) : json(401, { error: "Unauthorized" });
}
