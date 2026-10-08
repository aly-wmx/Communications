import { eventFromApiMessage, messageRecordFromApi, toMillis, type MessageRecord } from "@/lib/comms/ghl";
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
/** Re-scan a little before the last run to cover messages that arrived mid-run. */
const OVERLAP_MS = 2 * 60_000;
const MAX_CONVERSATIONS = 50;
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
  const counts = { conversations: 0, messages: 0, stored: 0, created: 0, appended: 0, responded: 0, duplicate: 0, archived: 0, skipped: 0, emailsFilled: 0 };

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

    // GHL user names (for "who replied" labels), refreshed at most hourly; a missing scope never stops the sync.
    const { data: usersState } = await sb.from("integration_state").select("value").eq("key", "ghl_users").maybeSingle();
    const usersAt = (usersState?.value as { refreshedAt?: string } | null)?.refreshedAt;
    if (!usersAt || startedAt.getTime() - new Date(usersAt).getTime() > 60 * 60_000) {
      try {
        const users = await listGhlUsers(token, locationId);
        if (users.length) await sb.from("ghl_users").upsert(users.map((u) => ({ ...u, updated_at: startedAt.toISOString() })));
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
    for (const conv of changed) {
      if (conv.contactId && teamContacts.has(conv.contactId)) continue;
      const msgs = (await conversationMessages(token, conv.id!, 30)).messages
        .filter((m) => toMillis(m.dateAdded) >= since)
        .sort((a, b) => toMillis(a.dateAdded) - toMillis(b.dateAdded));
      if (!msgs.length) continue;

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

    // Fill in text and pictures for emails copied before this was possible, a few per run.
    const { data: unchecked } = await sb
      .from("messages")
      .select("id, body, attachments")
      .eq("channel", "Email")
      .neq("status", EMAIL_CHECKED)
      .not("id", "like", "portal_%")
      .order("occurred_at", { ascending: false })
      .limit(EMAIL_REPAIRS_PER_RUN);
    for (const m of unchecked ?? []) {
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
