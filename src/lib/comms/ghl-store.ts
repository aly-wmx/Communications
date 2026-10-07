import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { normalisePhone, type GhlEvent, type MessageRecord } from "./ghl";
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
 * Scheduled jobs and server checks: header x-sync-secret against CRON_SECRET.
 * Until CRON_SECRET is set in Vercel, GHL_WEBHOOK_SECRET is still accepted so the jobs keep running.
 */
export function cronSecretOk(req: Request): boolean {
  const given = req.headers.get("x-sync-secret") ?? "";
  const cron = process.env.CRON_SECRET ?? "";
  return cron ? matches(given, cron) : matches(given, process.env.GHL_WEBHOOK_SECRET ?? "");
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
  const cols = "id,name,phone,email,owner_id,ghl_contact_id";
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
      })),
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export function describe(e: GhlEvent): string {
  const text = e.body ? `: “${e.body.slice(0, 140)}${e.body.length > 140 ? "…" : ""}”` : "";
  return `${e.channel} via GoHighLevel${text}`;
}

/** Same message seen twice (webhook without an id, then the sync with one) lands within minutes with the same text. */
const SAME_MESSAGE_WINDOW_MS = 10 * 60_000;
const close = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < SAME_MESSAGE_WINDOW_MS;

type History = Array<{ at: string; byId: string; message: string }>;

async function handleInbound(sb: Db, e: GhlEvent, client: ClientRow) {
  const entry = { at: e.at, byId: "", message: describe(e) };

  const { data: open } = await sb
    .from("contacts")
    .select("id,history,summary")
    .eq("client_id", client.id)
    .eq("status", "Open")
    .order("received_at", { ascending: true })
    .limit(1);

  if (open && open.length) {
    // Client is already waiting on us: keep one row and the original clock.
    const c = open[0] as { id: string; history: History; summary: string };
    const history = c.history ?? [];
    if (history.some((h) => h.byId === "" && h.message === entry.message && close(h.at, e.at))) {
      return { action: "duplicate" as const, contactId: c.id };
    }
    await sb
      .from("contacts")
      .update({
        history: [...history, entry] as unknown as Json,
        summary: c.summary || e.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    return { action: "appended" as const, contactId: c.id };
  }

  // Not waiting: was this exact message already turned into a contact (then answered)?
  const { data: recent } = await sb
    .from("contacts")
    .select("id,summary,received_at,channel")
    .eq("client_id", client.id)
    .order("received_at", { ascending: false })
    .limit(5);
  const same = (recent ?? []).find((c) => c.summary === e.body && c.channel === e.channel && close(c.received_at, e.at));
  if (same) return { action: "duplicate" as const, contactId: same.id };

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
  if (error) throw error;
  return { action: "created" as const, contactId: id };
}

async function handleOutbound(sb: Db, e: GhlEvent, client: ClientRow) {
  // Only contacts that came in before this reply.
  const { data: open } = await sb
    .from("contacts")
    .select("id,history,first_response_at")
    .eq("client_id", client.id)
    .eq("status", "Open")
    .lte("received_at", e.at);
  for (const c of (open ?? []) as Array<{ id: string; history: History; first_response_at: string | null }>) {
    await sb
      .from("contacts")
      .update({
        first_response_at: c.first_response_at ?? e.at,
        status: "Waiting on client",
        history: [...(c.history ?? []), { at: e.at, byId: "", message: `Replied in GoHighLevel (${e.channel.toLowerCase()})` }] as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id);
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

export type RecordResult = { action: "created" | "appended" | "responded" | "duplicate"; contactId?: string; clientId?: string; updated?: number };

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
