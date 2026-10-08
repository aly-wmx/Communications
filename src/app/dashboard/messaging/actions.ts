"use server";

import { revalidatePath } from "next/cache";
import { changeContact } from "@/lib/comms/contact-write";
import { getSessionMember, type SessionMember } from "@/lib/auth";
import { canSendMessages } from "@/lib/roles";
import { getBusinessContext } from "@/lib/business";
import { markResponded } from "@/lib/comms/contacts";
import { ghlConfig, GhlError, sendGhlMessage, upsertGhlContact } from "@/lib/comms/ghl-api";
import { ensureClient, serviceDb, type Db } from "@/lib/comms/ghl-store";
import { textToHtml, toE164 } from "@/lib/comms/outbound";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { newConversationSchema, replySchema } from "@/lib/validation/messaging";
import { sendBlockedReason, type SendUsage } from "@/lib/comms/send-guard";

export type SendResult = { ok: true; clientId: string } | { ok: false; error: string };

interface ClientForSend {
  id: string;
  name: string;
  phone: string;
  email: string;
  ghl_contact_id: string | null;
}

/** Make sure the client exists as a GHL contact, creating it if needed, and remember the id. */
async function ghlContactFor(sb: Db, client: ClientForSend, token: string, locationId: string): Promise<string> {
  if (client.ghl_contact_id) return client.ghl_contact_id;
  const phone = toE164(client.phone);
  if (!phone && !client.email) throw new GhlError(400, "This client has no phone number or email to send to.");
  const { id } = await upsertGhlContact(token, locationId, { name: client.name, phone, email: client.email });
  await sb.from("clients").update({ ghl_contact_id: id }).eq("id", client.id);
  return id;
}

/**
 * Send through GHL, then record it straight away: on the thread (so it shows
 * instantly), as handled for the sync (so it isn't double-counted), and as a
 * response on any contact waiting on us.
 */
async function sendAndRecord(
  sb: Db,
  me: SessionMember,
  client: ClientForSend,
  input: { channel: "SMS" | "Email"; subject?: string; message: string },
): Promise<void> {
  const { token, locationId, missing } = ghlConfig();
  if (missing.length) throw new GhlError(500, `Sending needs ${missing.join(" and ")} in Vercel.`);

  if (input.channel === "SMS" && !toE164(client.phone) && !client.ghl_contact_id) {
    throw new GhlError(400, "This client has no valid phone number for texts.");
  }
  if (input.channel === "Email" && !client.email && !client.ghl_contact_id) {
    throw new GhlError(400, "This client has no email address.");
  }

  const contactId = await ghlContactFor(sb, client, token, locationId);
  const sent = await sendGhlMessage(token, {
    type: input.channel,
    contactId,
    message: input.message,
    subject: input.subject,
    html: input.channel === "Email" ? textToHtml(input.message) : undefined,
  });

  const now = new Date();
  const messageId = sent.messageId || `portal_${now.getTime()}_${client.id}`;
  const body = input.message;

  await Promise.all([
    sb.from("messages").upsert(
      {
        id: messageId,
        client_id: client.id,
        conversation_id: sent.conversationId,
        direction: "outbound",
        channel: input.channel === "SMS" ? "Text" : "Email",
        body: body.slice(0, 5000),
        status: "sent",
        sent_by_user: true,
        source: `portal:${me.name}`,
        occurred_at: now.toISOString(),
        email_meta:
          input.channel === "Email" ? ({ from: "", to: client.email ? [client.email] : [], cc: [], bcc: [], subject: input.subject ?? "" } as unknown as Json) : null,
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    sent.messageId
      ? sb.from("ghl_messages").upsert({ id: sent.messageId, direction: "outbound" }, { onConflict: "id", ignoreDuplicates: true })
      : Promise.resolve(),
  ]);

  // Replying answers whatever the client was waiting on.
  // The message has already gone, so a failure here is logged rather than reported as a failed send.
  const { data: open } = await sb.from("contacts").select("id").eq("client_id", client.id).eq("status", "Open");
  for (const row of open ?? []) {
    const saved = await changeContact(sb, row.id, (c) => (c.status === "Open" ? markResponded(c, me.memberId, now) : c));
    if (!saved.ok) console.error("sent, but couldn't mark the item answered", row.id, saved.error);
  }
}

/** What the send guardrails need: is this person allowed to send, and how much have they sent in the last hour. */
async function sendUsage(sb: Db, me: SessionMember): Promise<SendUsage> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ data: member }, { data: sent }] = await Promise.all([
    sb.from("team_members").select("can_send").eq("id", me.memberId).maybeSingle(),
    sb
      .from("messages")
      .select("client_id")
      .eq("source", `portal:${me.name}`)
      .eq("direction", "outbound")
      .in("channel", ["Text", "Email"]) // logged calls aren't sends
      .gte("occurred_at", hourAgo)
      .limit(500),
  ]);
  const clientIds = [...new Set((sent ?? []).map((m) => m.client_id))];
  const { count } = clientIds.length
    ? await sb.from("clients").select("id", { count: "exact", head: true }).in("id", clientIds).gte("created_at", hourAgo)
    : { count: 0 };
  return { canSend: member?.can_send ?? false, sentLastHour: sent?.length ?? 0, newContactsLastHour: count ?? 0 };
}

const SPAM_BLOCK = "This client is archived as spam. Restore them from Archived before messaging them.";

function failure(err: unknown): { ok: false; error: string } {
  if (err instanceof GhlError) return { ok: false, error: err.message };
  console.error("send failed", err);
  return { ok: false, error: "Couldn't send the message. Try again, or send it from GoHighLevel." };
}

export async function sendReply(input: unknown): Promise<SendResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  if (!canSendMessages(me.role)) return { ok: false, error: "Your role can't send messages." };
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid message." };
  const { clientId, ...msg } = parsed.data;

  // Read with the signed-in user's access (RLS), then write with the server's.
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, phone, email, ghl_contact_id, archive_reason")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "That client no longer exists." };
  if (client.archive_reason === "spam") return { ok: false, error: SPAM_BLOCK };

  const sb = serviceDb();
  const blocked = sendBlockedReason(await sendUsage(sb, me), { newContact: false });
  if (blocked) return { ok: false, error: blocked };

  try {
    await sendAndRecord(sb, me, client, msg);
  } catch (err) {
    return failure(err);
  }
  revalidatePath(`/dashboard/clients/${client.id}`);
  revalidatePath("/dashboard", "layout");
  return { ok: true, clientId: client.id };
}

export async function startConversation(input: unknown): Promise<SendResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  if (!canSendMessages(me.role)) return { ok: false, error: "Your role can't send messages." };
  const parsed = newConversationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  const sb = serviceDb();
  let client: ClientForSend | null;

  const blocked = sendBlockedReason(await sendUsage(sb, me), { newContact: v.mode === "new" });
  if (blocked) return { ok: false, error: blocked };

  try {
    if (v.mode === "existing") {
      const { data } = await supabase
        .from("clients")
        .select("id, name, phone, email, ghl_contact_id, archive_reason")
        .eq("id", v.clientId)
        .maybeSingle();
      if (!data) return { ok: false, error: "That client no longer exists." };
      if (data.archive_reason === "spam") return { ok: false, error: SPAM_BLOCK };
      client = data;
    } else {
      const phone = v.phone ? toE164(v.phone) : "";
      if (v.phone && !phone) return { ok: false, error: "That phone number doesn't look right. Include the area code." };
      const { current } = await getBusinessContext();
      if (!current) return { ok: false, error: "Add a business first." };

      const { token, locationId, missing } = ghlConfig();
      if (missing.length) return { ok: false, error: `Sending needs ${missing.join(" and ")} in Vercel.` };
      // GHL finds an existing contact with this phone/email instead of duplicating it.
      const { id: ghlContactId } = await upsertGhlContact(token, locationId, { name: v.name, phone, email: v.email });
      const row = await ensureClient(sb, { ghlContactId, name: v.name, phone, email: v.email }, current.id);
      if (v.project) await sb.from("clients").update({ project: v.project }).eq("id", row.id).eq("project", "");
      client = { id: row.id, name: row.name, phone: row.phone || phone, email: row.email || v.email, ghl_contact_id: ghlContactId };
    }

    await sendAndRecord(sb, me, client, v);
  } catch (err) {
    return failure(err);
  }
  revalidatePath("/dashboard/clients");
  return { ok: true, clientId: client.id };
}

export interface ClientPick {
  id: string;
  name: string;
  detail: string;
  hasPhone: boolean;
  hasEmail: boolean;
}

/** Type-ahead for "New conversation": clients in the current business matching a name, phone or email. */
export async function searchClients(query: string): Promise<ClientPick[]> {
  const me = await getSessionMember();
  // Quotes, commas and brackets would break the filter syntax; they never matter for a name/phone search.
  const q = typeof query === "string" ? query.replace(/[",()]/g, " ").trim().slice(0, 80) : "";
  if (!me || !canSendMessages(me.role) || q.length < 2) return [];
  const { current } = await getBusinessContext();
  if (!current) return [];

  const term = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name, phone, email, project")
    .eq("business_id", current.id)
    .or(`name.ilike."${term}",phone.ilike."${term}",email.ilike."${term}"`)
    .order("name")
    .limit(8);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    detail: [c.project, c.phone, c.email].filter(Boolean).join(" · "),
    hasPhone: Boolean(c.phone),
    hasEmail: Boolean(c.email),
  }));
}
