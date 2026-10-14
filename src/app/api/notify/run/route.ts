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
  const sb = serviceDb();
  // Separately, so a failure in one step never holds up the other.
  let engine: Awaited<ReturnType<typeof runEngine>> | { error: string };
  try {
    engine = await runEngine(sb);
  } catch (err) {
    console.error("notify run: reminders/escalations failed", err);
    engine = { error: err instanceof Error ? err.message : "Reminders and escalations failed." };
  }
  try {
    const delivered = await dispatchPending(sb);
    return json("error" in engine ? 500 : 200, { ok: !("error" in engine), ...engine, ...delivered });
  } catch (err) {
    console.error("notify run: delivery failed", err);
    return json(500, { ok: false, ...engine, error: err instanceof Error ? err.message : "Notification delivery failed." });
  }
}

export const GET = handler;
export const POST = handler;
