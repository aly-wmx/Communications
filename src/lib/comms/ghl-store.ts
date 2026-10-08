import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { closeInTime, normalisePhone, sameMessage, type GhlEvent, type MessageRecord } from "./ghl";
import { planNewMessage } from "./notify-plan";
import { loadTeam, planTeam, saveNotifications } from "./notify-store";

/**
 * Writes GoHighLevel activity into the queue. Shared by the webhook (GHL pushes)
 * and the once-a-minute sync (we pull), so both behave identically and never
 * double-count a message.
 */

export type Db = ReturnType<typeof serviceDb>;

/** Bypasses RLS — only for these server routes, which check their own secret first. */
export function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function matches(given: string, expected: string): boolean {
  if (expected.length < 16) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** GHL webhook: ?secret= (GHL's basic webhook action can't add headers) or x-webhook-secret, against GHL_WEBHOOK_SECRET. */
export function webhookSecretOk(req: Request): boolean {
  const given = req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("secret") ?? "";
  return matches(given, process.env.GHL_WEBHOOK_SECRET ?? "");
}

/**
 * Scheduled jobs and server checks: header x-sync-secret against CRON_SECRET only.
 * The GHL webhook secret travels in a URL, so it never opens these routes; with no CRON_SECRET set, they stay shut.
 */
export function cronSecretOk(req: Request): boolean {
  return matches(req.headers.get("x-sync-secret") ?? "", process.env.CRON_SECRET ?? "");
}

/** The business new clients go to: the one asked for if it exists, otherwise the oldest (Watermark). */
export async function businessIdFor(sb: Db, wanted?: string | null): Promise<string> {
  const { data } = await sb.from("businesses").select("id").order("created_at");
  const ids = (data ?? []).map((b) => b.id);
  const id = wanted && ids.includes(wanted) ? wanted : ids[0];
  if (!id) throw new Error("No businesses exist yet.");
  return id;
}

interface ClientRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  owner_id: string | null;
  ghl_contact_id: string | null;
  archived_at: string | null;
}

/** Escape LIKE wildcards so an exact match stays exact. */
const likeExact = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ClientIdentity {
  ghlContactId: string;
  name: string;
  phone: string;
  email: string;
}

/**
 * Find the client for a GHL contact (by GHL id, then phone, then email) or create one.
 * Uses indexed lookups so it stays fast with thousands of clients.
 */
export async function ensureClient(sb: Db, who: ClientIdentity, businessId: string): Promise<ClientRow> {
  const cols = "id,name,phone,email,owner_id,ghl_contact_id,archived_at";
  if (who.ghlContactId) {
    const { data } = await sb.from("clients").select(cols).eq("ghl_contact_id", who.ghlContactId).maybeSingle();
    if (data) return data as ClientRow;
  }

  const digits = normalisePhone(who.phone);
  const [byPhone, byEmail] = await Promise.all([
    digits.length >= 7 ? sb.from("clients").select(cols).like("phone", `%${digits.slice(-4)}`).limit(50) : null,
    who.email ? sb.from("clients").select(cols).ilike("email", likeExact(who.email)).limit(5) : null,
  ]);
  const candidates = [...(byPhone?.data ?? []), ...(byEmail?.data ?? [])];
  if (candidates.length) {
    const match = (candidates as ClientRow[]).find(
      (c) =>
        (digits.length >= 7 && normalisePhone(c.phone) === digits) ||
        (who.email && c.email.toLowerCase() === who.email.toLowerCase()),
    );
    if (match) {
      // Remember the GHL id so future events match directly.
      if (who.ghlContactId && !match.ghl_contact_id) {
        await sb.from("clients").update({ ghl_contact_id: who.ghlContactId }).eq("id", match.id);
      }
      return match;
    }
  }

  // Client names are unique; disambiguate a clash with the phone/email, then a short id.
  const base = who.name || who.phone || who.email || "Unknown client";
  const candidatesNames = [base, `${base} (${who.phone || who.email || who.ghlContactId.slice(0, 8)})`, `${base} (${randomUUID().slice(0, 6)})`];
  for (const name of candidatesNames) {
    const { data, error } = await sb
      .from("clients")
      .insert({
        id: `cl_${randomUUID()}`,
        business_id: businessId,
        name,
        phone: who.phone,
        email: who.email,
        ghl_contact_id: who.ghlContactId || null,
      })
      .select(cols)
      .single();
    if (!error) return data as ClientRow;
    if (error.message.includes("clients_ghl_contact_id_key") && who.ghlContactId) {
      // Created by a parallel run a moment ago.
      const { data: existing } = await sb.from("clients").select(cols).eq("ghl_contact_id", who.ghlContactId).single();
      if (existing) return existing as ClientRow;
    }
    if (!error.message.includes("clients_name_key")) throw error;
  }
  throw new Error("Could not create a client record.");
}

const findOrCreateClient = (sb: Db, e: GhlEvent, businessId: string) => ensureClient(sb, e, businessId);

/** Store thread messages for a client; already-stored ones are left alone. */
export async function storeMessages(sb: Db, clientId: string, records: MessageRecord[]): Promise<number> {
  if (!records.length) return 0;
  const { data, error } = await sb
    .from("messages")
    .upsert(
      records.map((r) => ({
        id: r.id,
        client_id: clientId,
        conversation_id: r.conversationId,
        direction: r.direction,
        channel: r.channel,
        body: r.body,
        status: r.status,
        sent_by_user: r.sentByUser,
        source: r.source,
        occurred_at: r.occurredAt,
        call_status: r.callStatus,
        duration_seconds: r.durationSeconds,
        attachments: r.attachments,
        ghl_user_id: r.ghlUserId,
        email_meta: (r.emailMeta ?? null) as unknown as Json,
      })),
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;

  // Messages copied before call details and photos were kept: fill those in (body is left alone).
  const inserted = new Set((data ?? []).map((d) => d.id));
  for (const r of records) {
    if (inserted.has(r.id) || (!r.callStatus && !r.attachments.length && !r.ghlUserId && !r.emailMeta)) continue;
    await sb
      .from("messages")
      .update({
        ...(r.callStatus ? { call_status: r.callStatus, duration_seconds: r.durationSeconds } : {}),
        ...(r.attachments.length ? { attachments: r.attachments } : {}),
        ...(r.ghlUserId ? { ghl_user_id: r.ghlUserId } : {}),
        ...(r.emailMeta ? { email_meta: r.emailMeta as unknown as Json } : {}),
      })
      .eq("id", r.id);
  }
  return data?.length ?? 0;
}

export function describe(e: GhlEvent): string {
  const text = e.body ? `: “${e.body.slice(0, 140)}${e.body.length > 140 ? "…" : ""}”` : "";
  return `${e.channel} via GoHighLevel${text}`;
}


type HistoryEntry = { at: string; byId: string; message: string; /** GHL message id, when known. */ ghlId?: string };
type History = HistoryEntry[];
type ContactForUpdate = { id: string; history: History; updated_at: string };

/**
 * Change a contact based on what it holds now, only if nobody else changed it
 * since it was read (retrying a few times), so two writers never overwrite each
 * other's history. Throws if it can't be saved, which releases the message's
 * claim so the next sync tries again.
 */
async function updateContact<T extends ContactForUpdate>(
  sb: Db,
  id: string,
  columns: string,
  change: (c: T) => Database["public"]["Tables"]["contacts"]["Update"] | null,
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: readError } = await sb.from("contacts").select(columns).eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!row) return false;
    const current = row as unknown as T;
    const patch = change(current);
    if (!patch) return false;
    const { data: saved, error } = await sb
      .from("contacts")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("updated_at", current.updated_at)
      .select("id");
    if (error) throw error;
    if (saved?.length) return true;
  }
  throw new Error(`Contact ${id} kept changing while saving; will retry on the next sync.`);
}

async function handleInbound(sb: Db, e: GhlEvent, client: ClientRow, retried = false): Promise<{ action: "duplicate" | "appended" | "created"; contactId: string }> {
  const entry: HistoryEntry = { at: e.at, byId: "", message: describe(e), ...(e.messageId ? { ghlId: e.messageId } : {}) };

  const { data: open } = await sb.from("contacts").select("id").eq("client_id", client.id).eq("status", "Open").limit(1);

  if (open && open.length) {
    // Client is already waiting on us: keep one row and the original clock.
    const id = open[0].id;
    let duplicate = false;
    await updateContact<ContactForUpdate & { summary: string; status: string }>(sb, id, "id,history,summary,status,updated_at", (c) => {
      if (c.status !== "Open") return null;
      if ((c.history ?? []).some((h) => sameMessage(e, h, entry.message))) {
        duplicate = true;
        return null;
      }
      return { history: [...(c.history ?? []), entry] as unknown as Json, summary: c.summary || e.body };
    });
    return { action: duplicate ? "duplicate" : "appended", contactId: id };
  }

  // Not waiting: was this exact message (seen once without an id) already turned into a contact, then answered?
  const { data: recent } = await sb
    .from("contacts")
    .select("id,summary,received_at,channel,ghl_message_id")
    .eq("client_id", client.id)
    .order("received_at", { ascending: false })
    .limit(5);
  const same = (recent ?? []).find(
    (c) => c.summary === e.body && c.channel === e.channel && closeInTime(c.received_at, e.at) && (!e.messageId || !c.ghl_message_id),
  );
  if (same) return { action: "duplicate", contactId: same.id };

  const { data: settings } = await sb.from("settings").select("sla").eq("id", 1).maybeSingle();
  const defaultAssignee = (settings?.sla as { defaultAssigneeId?: string } | undefined)?.defaultAssigneeId || null;
  const id = `ct_${randomUUID()}`;
  const { error } = await sb.from("contacts").insert({
    id,
    client_id: client.id,
    channel: e.channel,
    priority: "Normal",
    received_at: e.at,
    summary: e.body,
    assignee_id: client.owner_id || defaultAssignee,
    status: "Open",
    history: [entry] as unknown as Json,
    source: "ghl",
    ghl_message_id: e.messageId || null,
  });
  // Another run opened one for this client a moment ago (one open item per client): add to that instead.
  if (error?.code === "23505" && !retried) return handleInbound(sb, e, client, true);
  if (error) throw error;
  return { action: "created", contactId: id };
}

/** The teammate behind a GHL user (matched by email), so replies sent in GHL are credited to them. */
async function teammateForGhlUser(sb: Db, ghlUserId: string): Promise<{ id: string; name: string } | null> {
  if (!ghlUserId) return null;
  const { data: linked } = await sb.from("team_members").select("id, name").eq("ghl_user_id", ghlUserId).maybeSingle();
  if (linked) return linked;
  const { data: user } = await sb.from("ghl_users").select("email, name").eq("id", ghlUserId).maybeSingle();
  if (!user?.email) return null;
  const { data: members } = await sb.from("team_members").select("id, name, email");
  return (members ?? []).find((m) => m.email && m.email.toLowerCase() === user.email.toLowerCase()) ?? null;
}

async function handleOutbound(sb: Db, e: GhlEvent, client: ClientRow) {
  const teammate = await teammateForGhlUser(sb, e.ghlUserId ?? "");
  // Only contacts that came in before this reply.
  const { data: open } = await sb.from("contacts").select("id").eq("client_id", client.id).eq("status", "Open").lte("received_at", e.at);
  const by = teammate ? ` by ${teammate.name}` : "";
  const message = e.answeredCall ? `Answered a call from the client${by}` : `Replied in GoHighLevel (${e.channel.toLowerCase()})${by}`;
  for (const { id } of open ?? []) {
    await updateContact<ContactForUpdate & { first_response_at: string | null; status: string }>(
      sb,
      id,
      "id,history,first_response_at,status,updated_at",
      (c) =>
        c.status !== "Open"
          ? null
          : {
              first_response_at: c.first_response_at ?? e.at,
              ...(c.first_response_at ? {} : { responded_by_id: teammate?.id ?? "" }),
              status: "Waiting on client",
              history: [...(c.history ?? []), { at: e.at, byId: teammate?.id ?? "", message, ...(e.messageId ? { ghlId: e.messageId } : {}) }] as unknown as Json,
            },
    );
  }
  return { action: "responded" as const, updated: open?.length ?? 0, contactId: open?.[0]?.id };
}

async function notifyNewMessage(sb: Db, contactId: string, clientId: string, clientName: string, e: GhlEvent) {
  const [{ data: contact }, { data: settings }, team] = await Promise.all([
    sb.from("contacts").select("assignee_id, priority").eq("id", contactId).maybeSingle(),
    sb.from("settings").select("sla").eq("id", 1).maybeSingle(),
    loadTeam(sb),
  ]);
  const planned = planNewMessage(
    {
      clientName,
      channel: e.channel,
      summary: e.body,
      waitedMinutes: 0,
      urgent: contact?.priority === "Urgent",
      assigneeId: contact?.assignee_id ?? "",
      defaultAssigneeId: (settings?.sla as { defaultAssigneeId?: string } | null)?.defaultAssigneeId ?? "",
    },
    planTeam(team),
  );
  await saveNotifications(sb, planned, { contactId, clientId });
}

export type RecordResult = {
  action: "created" | "appended" | "responded" | "duplicate" | "archived";
  contactId?: string;
  clientId?: string;
  updated?: number;
};

/** Record one GHL message. Safe to call more than once for the same message. */
export async function recordGhlEvent(sb: Db, e: GhlEvent, businessId: string): Promise<RecordResult> {
  // Teammates are GHL contacts too (for notification emails); their messages aren't client contact.
  if (e.ghlContactId) {
    const { data: teammate } = await sb.from("team_members").select("id").eq("ghl_contact_id", e.ghlContactId).maybeSingle();
    if (teammate) return { action: "duplicate" };
  }
  if (e.messageId) {
    // Claim the message id; if it was already claimed, someone else handled it.
    const { data: claimed, error } = await sb
      .from("ghl_messages")
      .upsert({ id: e.messageId, direction: e.direction }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    if (!claimed?.length) return { action: "duplicate" };
  }

  try {
    const client = await findOrCreateClient(sb, e, businessId);
    // Archived or spam: the message is kept on their thread by the sync, but it never reopens the queue or alerts anyone.
    if (client.archived_at && e.direction === "inbound") return { action: "archived", clientId: client.id };
    const result = e.direction === "outbound" ? await handleOutbound(sb, e, client) : await handleInbound(sb, e, client);
    if (e.messageId && result.contactId) {
      await sb.from("ghl_messages").update({ contact_id: result.contactId }).eq("id", e.messageId);
    }
    // A fresh client message that opened a queue item: tell whoever is responsible.
    // (History copied from the past never alerts.)
    if (result.action === "created" && result.contactId && Date.now() - new Date(e.at).getTime() < 30 * 60_000) {
      await notifyNewMessage(sb, result.contactId, client.id, client.name, e).catch((err) =>
        console.error("new-message notification failed", err),
      );
    }
    return { ...result, clientId: client.id };
  } catch (err) {
    // Release the claim so the next sync retries this message.
    if (e.messageId) await sb.from("ghl_messages").delete().eq("id", e.messageId);
    throw err;
  }
}
