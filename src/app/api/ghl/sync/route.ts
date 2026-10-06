import { eventFromApiMessage, messageRecordFromApi, toMillis, type MessageRecord } from "@/lib/comms/ghl";
import { conversationMessages, ghlConfig, GhlError, searchConversations } from "@/lib/comms/ghl-api";
import { businessIdFor, ensureClient, recordGhlEvent, secretOk, serviceDb, storeMessages, type Db } from "@/lib/comms/ghl-store";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Pulls recent GoHighLevel activity into the portal. Called once a minute by a
 * Supabase pg_cron job (header x-sync-secret).
 *   ?check=1  — connection test: reports counts and field names only, writes nothing.
 *
 * Every message is stored on the client's conversation thread. Inbound client
 * messages open/extend queue items; replies a team member sent in GHL mark them
 * responded. Duplicates are ignored, so it is safe to re-scan overlapping windows
 * and to run alongside the webhook and the history copy.
 */

export const maxDuration = 60;

const STATE_KEY = "ghl_sync";
/** First run looks back this far, so a test text sent just before setup still shows up. */
const FIRST_RUN_LOOKBACK_MS = 15 * 60_000;
/** Re-scan a little before the last run to cover messages that arrived mid-run. */
const OVERLAP_MS = 2 * 60_000;
const MAX_CONVERSATIONS = 50;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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

  const { token, locationId, missing } = ghlConfig();
  const params = new URL(req.url).searchParams;
  const check = params.get("check") === "1";

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
  const counts = { conversations: 0, messages: 0, stored: 0, created: 0, appended: 0, responded: 0, duplicate: 0, skipped: 0 };

  try {
    const conversations = await searchConversations(token, locationId, MAX_CONVERSATIONS);
    const changed = conversations.filter((c) => c.id && toMillis(c.lastMessageDate) >= since);
    counts.conversations = changed.length;

    if (check) {
      // Connection test: shapes only, no client names, numbers or message text.
      const sample = changed[0] ?? conversations[0];
      const msgs = sample?.id ? (await conversationMessages(token, sample.id, 20)).messages : [];
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

    const businessId = await businessIdFor(sb, params.get("business"));
    for (const conv of changed) {
      const msgs = (await conversationMessages(token, conv.id!, 30)).messages
        .filter((m) => toMillis(m.dateAdded) >= since)
        .sort((a, b) => toMillis(a.dateAdded) - toMillis(b.dateAdded));
      if (!msgs.length) continue;

      // The full thread first, so the conversation view is complete even for messages the queue ignores.
      const records = msgs.map((m) => messageRecordFromApi(conv, m, startedAt)).filter((r): r is MessageRecord => r !== null);
      if (records.length && (conv.contactId || conv.phone || conv.email)) {
        const client = await ensureClient(
          sb,
          {
            ghlContactId: conv.contactId ?? "",
            name: (conv.fullName || conv.contactName || "").trim(),
            phone: conv.phone ?? "",
            email: conv.email ?? "",
          },
          businessId,
        );
        counts.stored += await storeMessages(sb, client.id, records);
      }

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
