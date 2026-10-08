import { eventFromApiMessage, messageRecordFromApi, toMillis, type GhlApiConversation, type GhlApiMessage, type MessageRecord } from "@/lib/comms/ghl";
import { conversationMessages, fetchEmailContent, ghlConfig, GhlError, listGhlUsers, searchConversations } from "@/lib/comms/ghl-api";
import { htmlToText } from "@/lib/comms/outbound";
import { teamGhlContactIds } from "@/lib/comms/notify-store";
import { businessIdFor, cronSecretOk, ensureClient, recordGhlEvent, serviceDb, storeMessages, type Db } from "@/lib/comms/ghl-store";
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
/** Re-scan before the last run: GHL sometimes lists a message (often email) a few minutes after its time. Safe: duplicates are ignored. */
const OVERLAP_MS = 15 * 60_000;
const PAGE = 50;
/** Hard stops so one run can't spin forever, even after a long outage; the next run continues. */
const MAX_CONVERSATION_PAGES = 20;
const MAX_MESSAGE_PAGES = 10;
/** Stop starting new work after this, leaving time to save progress before Vercel's 60s limit. */
const BUDGET_MS = 45_000;
/** A run holds the lock this long; a crashed run frees it on its own. */
const LOCK_SECONDS = 58;
/** A conversation that keeps failing is skipped after this many runs, so it can't hold the sync back. */
const MAX_FAILURES = 3;
/** Older emails copied without their text get filled in a few at a time. */
const EMAIL_REPAIRS_PER_RUN = 15;

/** Marks an email whose text, pictures and From/To/Cc have been fetched, so it isn't fetched again. */
const EMAIL_CHECKED = "email-v3";

/** Best effort: an email we can't open still shows in the thread, just without text or pictures. */
async function emailContent(token: string, messageId: string): Promise<Awaited<ReturnType<typeof fetchEmailContent>> | null> {
  try {
    return await fetchEmailContent(token, messageId, htmlToText);
  } catch (err) {
    console.warn("couldn't fetch email content", messageId, err instanceof Error ? err.message : err);
    return null;
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

interface SyncState {
  cursor?: string;
  lastRunAt?: string;
  lastOkAt?: string;
  lastError?: string;
  lastCounts?: Record<string, number>;
  /** Conversation id → runs in a row it failed. */
  failures?: Record<string, number>;
}

/**
 * Take the run lock so two runs never process the same window at once (a
 * crashed run's lock expires on its own). If the lock itself errors, run anyway:
 * a missed sync is worse than a rare overlap, which the claims already make safe.
 */
async function takeLock(sb: Db): Promise<boolean> {
  const { data, error } = await sb.rpc("take_integration_lock", { lock_key: STATE_KEY, ttl_seconds: LOCK_SECONDS });
  if (error) {
    console.warn("ghl sync: lock unavailable, running without it", error.message);
    return true;
  }
  return data === true;
}

async function releaseLock(sb: Db) {
  await sb.rpc("release_integration_lock", { lock_key: STATE_KEY });
}

/** Every conversation changed since `since`, oldest first, paging GHL's newest-first list. */
async function changedConversations(token: string, locationId: string, since: number) {
  const found = new Map<string, GhlApiConversation>();
  let after: number | undefined;
  for (let page = 0; page < MAX_CONVERSATION_PAGES; page++) {
    const batch = await searchConversations(token, locationId, PAGE, after);
    for (const c of batch) if (c.id && toMillis(c.lastMessageDate) >= since) found.set(c.id, c);
    const oldest = batch.length ? toMillis(batch[batch.length - 1].lastMessageDate) : 0;
    if (batch.length < PAGE || oldest < since || oldest === after) break;
    after = oldest;
  }
  return [...found.values()].sort((a, b) => toMillis(a.lastMessageDate) - toMillis(b.lastMessageDate));
}

/** A conversation's messages since `since`, oldest first, paging back as far as needed. */
async function messagesSince(token: string, conversationId: string, since: number) {
  const out: GhlApiMessage[] = [];
  let lastMessageId: string | undefined;
  for (let page = 0; page < MAX_MESSAGE_PAGES; page++) {
    const res = await conversationMessages(token, conversationId, PAGE, lastMessageId);
    out.push(...res.messages.filter((m) => toMillis(m.dateAdded) >= since));
    const reachedOlder = res.messages.some((m) => toMillis(m.dateAdded) < since);
    if (reachedOlder || !res.nextPage || !res.lastMessageId || res.lastMessageId === lastMessageId) break;
    lastMessageId = res.lastMessageId;
  }
  return out.sort((a, b) => toMillis(a.dateAdded) - toMillis(b.dateAdded));
}

async function saveState(sb: Db, state: SyncState) {
  await sb
    .from("integration_state")
    .upsert({ key: STATE_KEY, value: state as unknown as Json, updated_at: new Date().toISOString() });
}

async function run(req: Request): Promise<Response> {
  if (!cronSecretOk(req)) return json(401, { error: "Unauthorized" });

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
  const counts = {
    conversations: 0,
    messages: 0,
    stored: 0,
    created: 0,
    appended: 0,
    responded: 0,
    duplicate: 0,
    archived: 0,
    skipped: 0,
    emailsFilled: 0,
    failed: 0,
    gaveUp: 0,
    remaining: 0,
  };

  if (check) {
    try {
      // Connection test: shapes only, no client names, numbers or message text.
      const conversations = await searchConversations(token, locationId, PAGE);
      const changed = conversations.filter((c) => c.id && toMillis(c.lastMessageDate) >= since);
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
    } catch (err) {
      return json(502, { ok: false, error: err instanceof GhlError ? err.message : "Check failed." });
    }
  }

  if (!(await takeLock(sb))) {
    return json(200, { ok: true, skipped: "Another sync run is still going." });
  }
  const outOfTime = () => Date.now() - startedAt.getTime() > BUDGET_MS;
  const failures: Record<string, number> = { ...(prev.failures ?? {}) };
  const problems: string[] = [];

  try {
    const changed = await changedConversations(token, locationId, since);
    counts.conversations = changed.length;

    // GHL user names (for "who replied" labels), refreshed at most hourly; a missing scope never stops the sync.
    const { data: usersState } = await sb.from("integration_state").select("value").eq("key", "ghl_users").maybeSingle();
    const usersAt = (usersState?.value as { refreshedAt?: string } | null)?.refreshedAt;
    if (!usersAt || startedAt.getTime() - new Date(usersAt).getTime() > 60 * 60_000) {
      try {
        const users = await listGhlUsers(token, locationId);
        if (users.length) await sb.from("ghl_users").upsert(users.map((u) => ({ ...u, updated_at: startedAt.toISOString() })));
        // Linked teammates: fill in a missing phone or email from GHL (never overwrite what's set — emails are sign-ins).
        const { data: linked } = await sb.from("team_members").select("id, email, phone, ghl_user_id").not("ghl_user_id", "is", null);
        for (const t of linked ?? []) {
          const u = users.find((x) => x.id === t.ghl_user_id);
          if (!u) continue;
          const patch = { ...(!t.phone && u.phone ? { phone: u.phone } : {}), ...(!t.email && u.email ? { email: u.email } : {}) };
          if (Object.keys(patch).length) await sb.from("team_members").update(patch).eq("id", t.id);
        }
        await sb.from("integration_state").upsert({ key: "ghl_users", value: { refreshedAt: startedAt.toISOString(), count: users.length } as unknown as Json });
      } catch (err) {
        await sb.from("integration_state").upsert({
          key: "ghl_users",
          value: { refreshedAt: startedAt.toISOString(), error: err instanceof Error ? err.message : "failed" } as unknown as Json,
        });
      }
    }

    const businessId = await businessIdFor(sb, params.get("business"));
    const teamContacts = await teamGhlContactIds(sb);
    const syncConversation = async (conv: GhlApiConversation) => {
      const msgs = await messagesSince(token, conv.id!, since);
      if (!msgs.length) return;

      // The full thread first, so the conversation view is complete even for messages the queue ignores.
      const records = msgs.map((m) => messageRecordFromApi(conv, m, startedAt)).filter((r): r is MessageRecord => r !== null);
      for (const r of records) {
        if (r.channel !== "Email") continue;
        const content = await emailContent(token, r.id);
        if (content) {
          r.body = r.body || content.text;
          r.attachments = [...new Set([...r.attachments, ...content.attachments])];
          r.emailMeta = content.meta;
          r.status = EMAIL_CHECKED;
        }
      }
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

    // The cursor only moves past conversations that were fully handled (they're processed oldest first),
    // and never backwards because of the overlap, so a slow run can't make the window keep growing.
    let cursor = startedAt.getTime();
    let doneUpTo = prev.cursor ? toMillis(prev.cursor) : since;
    const advance = (at: number) => {
      doneUpTo = Math.max(doneUpTo, at);
    };

    for (let i = 0; i < changed.length; i++) {
      const conv = changed[i];
      const convAt = toMillis(conv.lastMessageDate);
      if (outOfTime()) {
        counts.remaining = changed.length - i;
        cursor = Math.min(cursor, doneUpTo);
        break;
      }
      if ((conv.contactId && teamContacts.has(conv.contactId)) || (failures[conv.id!] ?? 0) >= MAX_FAILURES) {
        // Teammates aren't clients; a conversation we gave up on stays skipped while it's in the re-check window.
        advance(convAt);
        continue;
      }
      try {
        await syncConversation(conv);
        delete failures[conv.id!];
        advance(convAt);
      } catch (err) {
        const tries = (failures[conv.id!] ?? 0) + 1;
        failures[conv.id!] = tries;
        const why = err instanceof Error ? err.message : "failed";
        console.error("ghl sync: conversation failed", conv.id, tries, err);
        if (tries >= MAX_FAILURES) {
          // Give up on this one so it can't hold every later conversation back; it's reported in Settings.
          counts.gaveUp++;
          problems.push(`Skipped a conversation after ${tries} failed tries (${why})`);
          advance(convAt);
        } else {
          counts.failed++;
          // Next run starts from here again, so this conversation is retried.
          cursor = Math.min(cursor, convAt - 1);
        }
      }
    }

    // Fill in text and pictures for emails copied before this was possible, a few per run (only with time to spare).
    const { data: unchecked } = outOfTime() ? { data: [] } : await sb
      .from("messages")
      .select("id, body, attachments")
      .eq("channel", "Email")
      .neq("status", EMAIL_CHECKED)
      .not("id", "like", "portal_%")
      .order("occurred_at", { ascending: false })
      .limit(EMAIL_REPAIRS_PER_RUN);
    for (const m of unchecked ?? []) {
      if (outOfTime()) break;
      const content = await emailContent(token, m.id);
      const existing = Array.isArray(m.attachments) ? (m.attachments as string[]) : [];
      await sb
        .from("messages")
        .update(
          content
            ? {
                body: m.body || content.text,
                attachments: [...new Set([...existing, ...content.attachments])],
                email_meta: content.meta as unknown as Json,
                status: EMAIL_CHECKED,
              }
            : { status: EMAIL_CHECKED },
        )
        .eq("id", m.id);
      if (content && (content.text || content.attachments.length)) counts.emailsFilled++;
    }

    // Forget conversations no longer in the window (a new message later gets a fresh try).
    const seen = new Set(changed.map((c) => c.id));
    for (const id of Object.keys(failures)) if (!seen.has(id)) delete failures[id];

    await saveState(sb, {
      cursor: new Date(cursor).toISOString(),
      lastRunAt: startedAt.toISOString(),
      lastOkAt: new Date().toISOString(),
      lastCounts: counts,
      failures,
      ...(problems.length ? { lastError: problems.join(" · ") } : {}),
    });
    return json(200, { ok: true, ...counts });
  } catch (err) {
    const message = err instanceof GhlError ? err.message : "Sync failed; see Vercel logs.";
    console.error("ghl sync failed", err);
    // Keep the old cursor so the next run retries this window.
    await saveState(sb, { ...prev, lastRunAt: startedAt.toISOString(), lastError: message, lastCounts: counts });
    return json(err instanceof GhlError ? 502 : 500, { ok: false, error: message, ...counts });
  } finally {
    await releaseLock(sb);
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
