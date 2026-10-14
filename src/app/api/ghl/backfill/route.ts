import { eventFromApiMessage, messageRecordFromApi, toMillis, unansweredTail, type GhlApiConversation, type MessageRecord } from "@/lib/comms/ghl";
import { conversationMessages, GhlError, searchConversations } from "@/lib/comms/ghl-api";
import { accountStateKey, type GhlAccount } from "@/lib/comms/ghl-accounts";
import { teamGhlContactIds } from "@/lib/comms/notify-store";
import { cronSecretOk, ensureClient, ghlAccounts, recordGhlEvent, serviceDb, storeMessages, type Db } from "@/lib/comms/ghl-store";
import type { Json } from "@/lib/supabase/database.types";
import { randomUUID } from "node:crypto";

/**
 * One-time copy of every GoHighLevel conversation into client threads.
 * Called once a minute by pg_cron; each call works for ~45s, saves its place,
 * and the next call continues. Once everything is copied it just returns "done".
 * Each business connected to a GHL sub-account has its own copy and progress,
 * so connecting a new business copies its history without touching the others.
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
/** A conversation that fails this many runs in a row is skipped, so it can't stop the copy for good. */
const MAX_FAILURES = 3;
/** A run holds the lock this long; a crashed run frees it on its own. */
const LOCK_SECONDS = 58;

type Conv = Pick<GhlApiConversation, "id" | "contactId" | "fullName" | "contactName" | "phone" | "email" | "lastMessageDate">;

interface BackfillState {
  done?: boolean;
  startedAt?: string;
  finishedAt?: string;
  /** lastMessageDate (ms) of the last conversation listed; the next page starts after it. */
  searchAfter?: number;
  pending?: Conv[];
  current?: { conv: Conv; page: number; lastMessageId?: string; failures?: number };
  /** Conversations given up on after MAX_FAILURES (id → last error). */
  skipped?: Record<string, string>;
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

async function save(sb: Db, key: string, state: BackfillState) {
  await sb.from("integration_state").upsert({ key, value: state as unknown as Json, updated_at: new Date().toISOString() });
}

type AccountResult = { status: number; body: Record<string, unknown> };

async function loadState(sb: Db, key: string): Promise<BackfillState> {
  const { data } = await sb.from("integration_state").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? {}) as BackfillState;
}

/** Continue one business's copy until `deadline`, holding its lock so two runs never copy the same page. */
async function backfillAccount(sb: Db, account: GhlAccount, deadline: number): Promise<AccountResult> {
  const { missing } = account;
  const key = accountStateKey(STATE_KEY, account);
  if (missing.length) return { status: 500, body: { ok: false, error: `Missing in Vercel: ${missing.join(", ")}` } };

  const holder = randomUUID();
  const { data: locked, error: lockError } = await sb.rpc("take_integration_lock", { lock_key: key, ttl_seconds: LOCK_SECONDS, holder });
  if (!lockError && locked !== true) return { status: 200, body: { ok: true, busy: true } };
  try {
    // Read progress only once the lock is held: a run that just finished may have moved it on.
    return await copy(sb, account, key, await loadState(sb, key), deadline);
  } finally {
    await sb.rpc("release_integration_lock", { lock_key: key, holder });
  }
}

async function copy(sb: Db, account: GhlAccount, key: string, state: BackfillState, deadline: number): Promise<AccountResult> {
  const { token, locationId, businessId } = account;
  if (state.done) return { status: 200, body: { ok: true, done: true, totals: state.totals } };
  const now = new Date();

  state.startedAt ??= now.toISOString();
  state.pending ??= [];
  state.totals ??= { conversations: 0, messages: 0, queued: 0 };
  state.lastError = undefined;

  const teamContacts = await teamGhlContactIds(sb);
  const batch = { conversations: 0, messages: 0, queued: 0 };

  try {
    while (Date.now() < deadline) {
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
      if (conv.contactId && teamContacts.has(conv.contactId)) {
        state.current = undefined;
        continue;
      }
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
    await save(sb, key, state);
    return { status: 200, body: { ok: true, done: Boolean(state.done), thisRun: batch, totals: state.totals } };
  } catch (err) {
    console.error("ghl backfill failed", err);
    // The conversation being copied is retried next run; after MAX_FAILURES it's skipped (a rate limit never counts).
    const rateLimited = err instanceof GhlError && err.status === 429;
    if (state.current && !rateLimited) {
      const failures = (state.current.failures ?? 0) + 1;
      if (failures >= MAX_FAILURES) {
        state.skipped = { ...state.skipped, [state.current.conv.id ?? "?"]: err instanceof Error ? err.message.slice(0, 200) : "failed" };
        state.current = undefined;
      } else state.current = { ...state.current, failures };
    }
    state.totals = {
      conversations: state.totals.conversations + batch.conversations,
      messages: state.totals.messages + batch.messages,
      queued: state.totals.queued + batch.queued,
    };
    state.lastRunAt = now.toISOString();
    state.lastError = err instanceof GhlError ? err.message : "Copy paused on an error; it retries next minute.";
    await save(sb, key, state);
    return { status: err instanceof GhlError ? 502 : 500, body: { ok: false, error: state.lastError, thisRun: batch } };
  }
}

async function run(req: Request): Promise<Response> {
  if (!cronSecretOk(req)) return json(401, { error: "Unauthorized" });
  const sb = serviceDb();
  const accounts = await ghlAccounts(sb);
  if (!accounts.length) return json(500, { ok: false, error: "No business is connected to GoHighLevel." });

  const states = await Promise.all(accounts.map((a) => loadState(sb, accountStateKey(STATE_KEY, a))));
  const todo = accounts.map((a, i) => ({ account: a, state: states[i] })).filter((x) => !x.state.done);
  if (!todo.length) return json(200, { ok: true, done: true, totals: states.map((s) => s.totals) });

  // Businesses still copying share the run equally.
  const end = Date.now() + BUDGET_MS;
  const results: Array<{ businessId: string } & Record<string, unknown>> = [];
  let status = 200;
  for (let i = 0; i < todo.length; i++) {
    const deadline = Date.now() + (end - Date.now()) / (todo.length - i);
    const r = await backfillAccount(sb, todo[i].account, deadline);
    results.push({ businessId: todo[i].account.businessId, ...r.body });
    status = Math.max(status, r.status);
  }
  return json(status, { ok: status === 200, done: false, accounts: results });
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
