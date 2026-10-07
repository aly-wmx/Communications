import { cronSecretOk, serviceDb } from "@/lib/comms/ghl-store";
import { dispatchPending, runEngine } from "@/lib/comms/notify-store";

/**
 * Every minute (Supabase pg_cron, header x-sync-secret):
 *  1. reminders and automatic escalations for contacts waiting too long,
 *  2. Slack DMs and GoHighLevel emails for notifications not yet delivered.
 */
export const maxDuration = 60;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function handler(req: Request): Promise<Response> {
  if (!cronSecretOk(req)) return json(401, { error: "Unauthorized" });
  try {
    const sb = serviceDb();
    const engine = await runEngine(sb);
    const delivered = await dispatchPending(sb);
    return json(200, { ok: true, ...engine, ...delivered });
  } catch (err) {
    console.error("notify run failed", err);
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Notification run failed." });
  }
}

export const GET = handler;
export const POST = handler;
