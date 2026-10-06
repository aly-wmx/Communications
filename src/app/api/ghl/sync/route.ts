import { eventFromApiMessage, toMillis, type GhlApiConversation, type GhlApiMessage } from "@/lib/comms/ghl";
import { businessIdFor, recordGhlEvent, secretOk, serviceDb, type Db } from "@/lib/comms/ghl-store";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Pulls recent GoHighLevel conversations into the client queue.
 * Called once a minute by a Supabase pg_cron job (header x-sync-secret).
 *   ?check=1  — connection test: reports counts and field names only, writes nothing.
 *
 * Uses GHL_API_KEY (Private Integration token) and GHL_LOCATION_ID from the
 * server environment. Inbound client messages open/extend queue items; replies a
 * team member sent in GHL mark them responded. Duplicates are ignored, so it is
 * safe to run alongside the webhook and to re-scan overlapping time windows.
 */

export const maxDuration = 60;

const GHL = "https://services.leadconnectorhq.com";
const STATE_KEY = "ghl_sync";
/** First run looks back this far, so a test text sent just before setup still shows up. */
const FIRST_RUN_LOOKBACK_MS = 15 * 60_000;
/** Re-scan a little before the last run to cover messages that arrived mid-run. */
const OVERLAP_MS = 2 * 60_000;
const MAX_CONVERSATIONS = 50;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

class GhlError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function ghlGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`${GHL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Version: "2021-04-15", Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const hint =
      res.status === 401
        ? "GHL rejected the API key (check GHL_API_KEY is the Private Integration token)."
        : res.status === 403
          ? "The API key is missing a scope (needs conversations.readonly and conversations/message.readonly) or the location ID is wrong."
          : res.status === 429
            ? "GHL rate limit hit; the next run will catch up."
            : `GHL returned ${res.status}.`;
    throw new GhlError(res.status, hint);
  }
  return res.json();
}

function conversationsFrom(body: unknown): GhlApiConversation[] {
  const list = (body as { conversations?: unknown })?.conversations;
  return Array.isArray(list) ? (list as GhlApiConversation[]) : [];
}

function messagesFrom(body: unknown): GhlApiMessage[] {
  // GHL nests them: { messages: { messages: [...] } }; accept a flat array too.
  const outer = (body as { messages?: unknown })?.messages;
  const inner = Array.isArray(outer) ? outer : (outer as { messages?: unknown })?.messages;
  return Array.isArray(inner) ? (inner as GhlApiMessage[]) : [];
}

interface SyncState {
  cursor?: string;
  lastRunAt?: string;
  lastOkAt?: string;
  lastError?: string;
  lastCounts?: Record<string, number>;
}

async function saveState(sb: Db, state: SyncState) {
  await sb
    .from("integration_state")
    .upsert({ key: STATE_KEY, value: state as unknown as Json, updated_at: new Date().toISOString() });
}

async function run(req: Request): Promise<Response> {
  if (!secretOk(req, ["x-sync-secret", "x-webhook-secret"])) return json(401, { error: "Unauthorized" });

  const token = process.env.GHL_API_KEY ?? "";
  const locationId = process.env.GHL_LOCATION_ID ?? "";
  const check = new URL(req.url).searchParams.get("check") === "1";
  const missing = [!token && "GHL_API_KEY", !locationId && "GHL_LOCATION_ID"].filter(Boolean);

  const sb = serviceDb();
  const { data: stateRow } = await sb.from("integration_state").select("value").eq("key", STATE_KEY).maybeSingle();
  const prev = (stateRow?.value ?? {}) as SyncState;
  const startedAt = new Date();

  if (missing.length) {
    const error = `Missing in Vercel: ${missing.join(", ")}`;
    if (!check) await saveState(sb, { ...prev, lastRunAt: startedAt.toISOString(), lastError: error });
    return json(500, { ok: false, error });
  }

  const since = prev.cursor ? toMillis(prev.cursor) - OVERLAP_MS : startedAt.getTime() - FIRST_RUN_LOOKBACK_MS;
  const counts = { conversations: 0, messages: 0, created: 0, appended: 0, responded: 0, duplicate: 0, skipped: 0 };

  try {
    const search = await ghlGet(
      `/conversations/search?locationId=${encodeURIComponent(locationId)}&limit=${MAX_CONVERSATIONS}&sortBy=last_message_date&sort=desc`,
      token,
    );
    const conversations = conversationsFrom(search);
    const changed = conversations.filter((c) => c.id && toMillis(c.lastMessageDate) >= since);
    counts.conversations = changed.length;

    if (check) {
      // Connection test: shapes only, no client names, numbers or message text.
      const sample = changed[0] ?? conversations[0];
      const msgs = sample?.id ? messagesFrom(await ghlGet(`/conversations/${sample.id}/messages?limit=20`, token)) : [];
      return json(200, {
        ok: true,
        check: true,
        conversationsReturned: conversations.length,
        changedSinceLastSync: changed.length,
        conversationFields: sample ? Object.keys(sample).sort() : [],
        messageFields: msgs[0] ? Object.keys(msgs[0]).sort() : [],
        messageTypes: [...new Set(msgs.map((m) => String(m.messageType ?? "")))],
        directions: [...new Set(msgs.map((m) => String(m.direction ?? "")))],
        humanSentOutbound: msgs.filter((m) => m.direction === "outbound" && m.userId).length,
        lastSync: prev,
      });
    }

    const businessId = await businessIdFor(sb, new URL(req.url).searchParams.get("business"));
    for (const conv of changed) {
      const msgs = messagesFrom(await ghlGet(`/conversations/${conv.id}/messages?limit=30`, token))
        .filter((m) => toMillis(m.dateAdded) >= since)
        .sort((a, b) => toMillis(a.dateAdded) - toMillis(b.dateAdded));
      for (const msg of msgs) {
        counts.messages++;
        const event = eventFromApiMessage(conv, msg, startedAt);
        if (!event || (!event.ghlContactId && !event.phone && !event.email)) {
          counts.skipped++;
          continue;
        }
        const result = await recordGhlEvent(sb, event, businessId);
        counts[result.action]++;
      }
    }

    await saveState(sb, {
      cursor: startedAt.toISOString(),
      lastRunAt: startedAt.toISOString(),
      lastOkAt: new Date().toISOString(),
      lastCounts: counts,
    });
    return json(200, { ok: true, ...counts });
  } catch (err) {
    const message = err instanceof GhlError ? err.message : "Sync failed; see Vercel logs.";
    console.error("ghl sync failed", err);
    // Keep the old cursor so the next run retries this window.
    if (!check) await saveState(sb, { ...prev, lastRunAt: startedAt.toISOString(), lastError: message, lastCounts: counts });
    return json(err instanceof GhlError ? 502 : 500, { ok: false, error: message, ...counts });
  }
}

async function handler(req: Request): Promise<Response> {
  try {
    return await run(req);
  } catch (err) {
    console.error("ghl sync crashed", err);
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Sync failed." });
  }
}

export const GET = handler;
export const POST = handler;
