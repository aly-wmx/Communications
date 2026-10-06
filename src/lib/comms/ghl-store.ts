import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { normalisePhone, type GhlEvent } from "./ghl";

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

/** Constant-time check of ?secret= or one of the given headers against GHL_WEBHOOK_SECRET. */
export function secretOk(req: Request, headerNames: string[]): boolean {
  const expected = process.env.GHL_WEBHOOK_SECRET ?? "";
  if (expected.length < 16) return false;
  const fromHeader = headerNames.map((h) => req.headers.get(h)).find(Boolean);
  const given = new URL(req.url).searchParams.get("secret") ?? fromHeader ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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

async function findOrCreateClient(sb: Db, e: GhlEvent, businessId: string): Promise<ClientRow> {
  const cols = "id,name,phone,email,owner_id,ghl_contact_id";
  if (e.ghlContactId) {
    const { data } = await sb.from("clients").select(cols).eq("ghl_contact_id", e.ghlContactId).maybeSingle();
    if (data) return data as ClientRow;
  }
  const { data: all, error } = await sb.from("clients").select(cols);
  if (error) throw error;
  const phone = normalisePhone(e.phone);
  const match = (all as ClientRow[]).find(
    (c) =>
      (phone.length >= 7 && normalisePhone(c.phone) === phone) ||
      (e.email && c.email.toLowerCase() === e.email.toLowerCase()),
  );
  if (match) {
    // Remember the GHL id so future events match directly.
    if (e.ghlContactId && !match.ghl_contact_id) {
      await sb.from("clients").update({ ghl_contact_id: e.ghlContactId }).eq("id", match.id);
    }
    return match;
  }

  // Client names are unique; disambiguate a clash with the phone number.
  const taken = new Set((all as ClientRow[]).map((c) => c.name.trim().toLowerCase()));
  let name = e.name || "Unknown client";
  if (taken.has(name.toLowerCase())) name = `${name} (${e.phone || e.email || e.ghlContactId})`;

  const { data, error: insErr } = await sb
    .from("clients")
    .insert({
      id: `cl_${randomUUID()}`,
      business_id: businessId,
      name,
      phone: e.phone,
      email: e.email,
      ghl_contact_id: e.ghlContactId || null,
    })
    .select(cols)
    .single();
  if (insErr) throw insErr;
  return data as ClientRow;
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

export type RecordResult = { action: "created" | "appended" | "responded" | "duplicate"; contactId?: string; clientId?: string; updated?: number };

/** Record one GHL message. Safe to call more than once for the same message. */
export async function recordGhlEvent(sb: Db, e: GhlEvent, businessId: string): Promise<RecordResult> {
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
    return { ...result, clientId: client.id };
  } catch (err) {
    // Release the claim so the next sync retries this message.
    if (e.messageId) await sb.from("ghl_messages").delete().eq("id", e.messageId);
    throw err;
  }
}
