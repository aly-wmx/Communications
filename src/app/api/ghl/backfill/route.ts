import { eventFromApiMessage, messageRecordFromApi, toMillis, unansweredTail, type GhlApiConversation, type MessageRecord } from "@/lib/comms/ghl";
import { conversationMessages, ghlConfig, GhlError, searchConversations } from "@/lib/comms/ghl-api";
import { businessIdFor, cronSecretOk, ensureClient, recordGhlEvent, serviceDb, storeMessages, type Db } from "@/lib/comms/ghl-store";
import type { Json } from "@/lib/supabase/database.types";

/**
 * One-time copy of every GoHighLevel conversation into client threads.
 * Called once a minute by pg_cron; each call works for ~45s, saves its place,
 * and the next call continues. Once everything is copied it just returns "done".
 *
 * Unanswered clients from the last 14 days also go into the queue (the rest is
 * history only). Safe alongside the live sync: duplicates are ignored.
 */

export const maxDuration = 60;

const STATE_KEY = "ghl_backfill";
const BUDGET_MS = 45_000;
const QUEUE_WINDOW_MS = 14 * 24 * 60 * 60_000;
const PAGE = 100;
/** Safety cap: at most this many pages (×100 messages) per conversation. */
const MAX_PAGES_PER_CONVERSATION = 100;

type Conv = Pick<GhlApiConversation, "id" | "contactId" | "fullName" | "contactName" | "phone" | "email" | "lastMessageDate">;

interface BackfillState {
  done?: boolean;
  startedAt?: string;
  finishedAt?: string;
  /** lastMessageDate (ms) of the last conversation listed; the next page starts after it. */
  searchAfter?: number;
  pending?: Conv[];
  current?: { conv: Conv; page: number; lastMessageId?: string };
  lockUntil?: string;
  lastRunAt?: string;
  lastError?: string;
  totals?: { conversations: number; messages: number; queued: number };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const slim = (c: GhlApiConversation): Conv => ({
  id: c.id,
  contactId: c.contactId,
  fullName: c.fullName,
  contactName: c.contactName,
  phone: c.phone,
  email: c.email,
  lastMessageDate: c.lastMessageDate,
});

async function save(sb: Db, state: BackfillState) {
  await sb.from("integration_state").upsert({ key: STATE_KEY, value: state as unknown as Json, updated_at: new Date().toISOString() });
}

async function run(req: Request): Promise<Response> {
  if (!cronSecretOk(req)) return json(401, { error: "Unauthorized" });
  const { token, locationId, missing } = ghlConfig();
  if (missing.length) return json(500, { ok: false, error: `Missing in Vercel: ${missing.join(", ")}` });

  const sb = serviceDb();
  const { data: row } = await sb.from("integration_state").select("value").eq("key", STATE_KEY).maybeSingle();
  const state = (row?.value ?? {}) as BackfillState;
  const started = Date.now();
  const now = new Date();

  if (state.done) return json(200, { ok: true, done: true, totals: state.totals });
  if (state.lockUntil && new Date(state.lockUntil).getTime() > started) return json(200, { ok: true, busy: true });

  state.startedAt ??= now.toISOString();
  state.pending ??= [];
  state.totals ??= { conversations: 0, messages: 0, queued: 0 };
  state.lockUntil = new Date(started + 58_000).toISOString();
  state.lastError = undefined;
  await save(sb, state);

  const businessId = await businessIdFor(sb, new URL(req.url).searchParams.get("business"));
  const batch = { conversations: 0, messages: 0, queued: 0 };

  try {
    while (Date.now() - started < BUDGET_MS) {
      if (!state.current) {
        if (!state.pending.length) {
          const page = await searchConversations(token, locationId, PAGE, state.searchAfter);
          const fresh = page.filter((c) => c.id && toMillis(c.lastMessageDate) > 0);
          const nextAfter = fresh.length ? toMillis(fresh[fresh.length - 1].lastMessageDate) : undefined;
          if (!fresh.length || nextAfter === state.searchAfter) {
            state.done = true;
            state.finishedAt = new Date().toISOString();
            break;
          }
          state.pending = fresh.map(slim);
          state.searchAfter = nextAfter;
        }
        state.current = { conv: state.pending.shift()!, page: 0 };
      }

      const { conv, page, lastMessageId } = state.current;
      const res = await conversationMessages(token, conv.id!, PAGE, lastMessageId);
      const records = res.messages
        .map((m) => ({ api: m, rec: messageRecordFromApi(conv, m, now) }))
        .filter((x): x is { api: typeof x.api; rec: MessageRecord } => x.rec !== null);

      if (records.length && (conv.contactId || conv.phone || conv.email)) {
        const client = await ensureClient(
          sb,
          { ghlContactId: conv.contactId ?? "", name: (conv.fullName || conv.contactName || "").trim(), phone: conv.phone ?? "", email: conv.email ?? "" },
          businessId,
        );
        const stored = await storeMessages(sb, client.id, records.map((x) => x.rec));
        batch.messages += stored;

        // The newest page shows whether the client is still waiting on a reply.
        if (page === 0) {
          const tail = unansweredTail(records.map((x) => ({ ...x.rec, api: x.api })));
          for (const m of tail) {
            if (now.getTime() - new Date(m.occurredAt).getTime() > QUEUE_WINDOW_MS) continue;
            const event = eventFromApiMessage(conv, m.api, now);
            if (!event) continue;
            const result = await recordGhlEvent(sb, event, businessId);
            if (result.action === "created") batch.queued++;
          }
        }
      }

      if (res.nextPage && res.lastMessageId && page + 1 < MAX_PAGES_PER_CONVERSATION) {
        state.current = { conv, page: page + 1, lastMessageId: res.lastMessageId };
      } else {
        state.current = undefined;
        batch.conversations++;
      }
    }

    state.totals = {
      conversations: state.totals.conversations + batch.conversations,
      messages: state.totals.messages + batch.messages,
      queued: state.totals.queued + batch.queued,
    };
    state.lastRunAt = now.toISOString();
    state.lockUntil = undefined;
    await save(sb, state);
    return json(200, { ok: true, done: Boolean(state.done), thisRun: batch, totals: state.totals });
  } catch (err) {
    console.error("ghl backfill failed", err);
    state.totals = {
      conversations: state.totals.conversations + batch.conversations,
      messages: state.totals.messages + batch.messages,
      queued: state.totals.queued + batch.queued,
    };
    state.lastRunAt = now.toISOString();
    state.lastError = err instanceof GhlError ? err.message : "Copy paused on an error; it retries next minute.";
    state.lockUntil = undefined;
    await save(sb, state);
    return json(err instanceof GhlError ? 502 : 500, { ok: false, error: state.lastError, thisRun: batch });
  }
}

async function handler(req: Request): Promise<Response> {
  try {
    return await run(req);
  } catch (err) {
    console.error("ghl backfill crashed", err);
    return json(500, { ok: false, error: err instanceof Error ? err.message : "Backfill failed." });
  }
}

export const GET = handler;
export const POST = handler;
