import "server-only";
import type { GhlApiConversation, GhlApiMessage } from "./ghl";

/** Minimal GoHighLevel API client for the sync and history copy. Server only: uses GHL_API_KEY. */

const GHL = "https://services.leadconnectorhq.com";

export function ghlConfig(): { token: string; locationId: string; missing: string[] } {
  const token = process.env.GHL_API_KEY ?? "";
  const locationId = process.env.GHL_LOCATION_ID ?? "";
  const missing = [!token && "GHL_API_KEY", !locationId && "GHL_LOCATION_ID"].filter((x): x is string => Boolean(x));
  return { token, locationId, missing };
}

export class GhlError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function ghlGet(path: string, token: string): Promise<unknown> {
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

export function conversationsFrom(body: unknown): GhlApiConversation[] {
  const list = (body as { conversations?: unknown })?.conversations;
  return Array.isArray(list) ? (list as GhlApiConversation[]) : [];
}

export function messagesFrom(body: unknown): GhlApiMessage[] {
  // GHL nests them: { messages: { messages: [...] } }; accept a flat array too.
  const outer = (body as { messages?: unknown })?.messages;
  const inner = Array.isArray(outer) ? outer : (outer as { messages?: unknown })?.messages;
  return Array.isArray(inner) ? (inner as GhlApiMessage[]) : [];
}

/** Newest-first page of conversations; pass the previous page's last `sort` value to get the next. */
export async function searchConversations(token: string, locationId: string, limit: number, startAfter?: number) {
  const after = startAfter ? `&startAfterDate=${startAfter}` : "";
  return conversationsFrom(
    await ghlGet(
      `/conversations/search?locationId=${encodeURIComponent(locationId)}&limit=${limit}&sortBy=last_message_date&sort=desc${after}`,
      token,
    ),
  );
}

/** One page of a conversation's messages (newest first); `lastMessageId` continues to older ones. */
export async function conversationMessages(token: string, conversationId: string, limit: number, lastMessageId?: string) {
  const body = (await ghlGet(
    `/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}${lastMessageId ? `&lastMessageId=${encodeURIComponent(lastMessageId)}` : ""}`,
    token,
  )) as { messages?: { nextPage?: boolean; lastMessageId?: string } };
  const meta = body?.messages && !Array.isArray(body.messages) ? body.messages : {};
  return { messages: messagesFrom(body), nextPage: Boolean(meta.nextPage), lastMessageId: meta.lastMessageId };
}

export type { GhlApiConversation, GhlApiMessage };

// ---------- Sending (replies and new conversations) ----------

async function ghlPost(path: string, token: string, body: unknown, version: string, scopeHint: string): Promise<unknown> {
  const res = await fetch(`${GHL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: version,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    // GHL's own message is usually specific ("Invalid phone number", "Contact is DND for SMS").
    let detail = "";
    try {
      const j = (await res.json()) as { message?: unknown };
      detail = Array.isArray(j.message) ? j.message.join("; ") : typeof j.message === "string" ? j.message : "";
    } catch {
      // Not JSON; fall back to the status hint.
    }
    const hint =
      res.status === 401
        ? "GoHighLevel rejected the API key."
        : res.status === 403
          ? `The GoHighLevel Private Integration needs the ${scopeHint} scope.`
          : res.status === 429
            ? "GoHighLevel is rate-limiting; try again in a moment."
            : `GoHighLevel couldn't send it${detail ? `: ${detail}` : ` (error ${res.status})`}.`;
    throw new GhlError(res.status, res.status === 400 || res.status === 422 ? hint : detail && res.status !== 403 ? `${hint} ${detail}` : hint);
  }
  return res.json();
}

export interface SendInput {
  type: "SMS" | "Email";
  contactId: string;
  message: string;
  subject?: string;
  html?: string;
}

/** Send a text or email to a GHL contact; GHL starts a conversation if there isn't one. */
export async function sendGhlMessage(token: string, input: SendInput): Promise<{ messageId: string; conversationId: string }> {
  const body =
    input.type === "SMS"
      ? { type: "SMS", contactId: input.contactId, message: input.message }
      : { type: "Email", contactId: input.contactId, subject: input.subject, html: input.html, message: input.message };
  const res = (await ghlPost("/conversations/messages", token, body, "2021-04-15", "conversations/message.write")) as {
    messageId?: string;
    conversationId?: string;
    emailMessageId?: string;
  };
  return { messageId: res.messageId ?? res.emailMessageId ?? "", conversationId: res.conversationId ?? "" };
}

/** Create the contact in GHL, or return the existing one with the same phone/email. */
export async function upsertGhlContact(
  token: string,
  locationId: string,
  who: { name: string; phone: string; email: string },
  tags?: string[],
): Promise<{ id: string }> {
  const [firstName, ...rest] = who.name.trim().split(/\s+/);
  const res = (await ghlPost(
    "/contacts/upsert",
    token,
    {
      locationId,
      name: who.name.trim() || undefined,
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      phone: who.phone || undefined,
      email: who.email || undefined,
      tags: tags?.length ? tags : undefined,
      source: "WMX Client Communications portal",
    },
    "2021-07-28",
    "contacts.write",
  )) as { contact?: { id?: string } };
  const id = res.contact?.id;
  if (!id) throw new GhlError(500, "GoHighLevel didn't return a contact.");
  return { id };
}

/** Update a GHL contact's name, phone and email to match the portal. */
export async function updateGhlContact(
  token: string,
  contactId: string,
  who: { name: string; phone: string; email: string },
): Promise<void> {
  const [firstName, ...rest] = who.name.trim().split(/\s+/);
  const res = await fetch(`${GHL}/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: who.name.trim(),
      firstName: firstName ?? "",
      lastName: rest.join(" "),
      // GHL rejects empty strings for these; leave a cleared field unchanged there.
      ...(who.phone ? { phone: who.phone } : {}),
      ...(who.email ? { email: who.email } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { message?: unknown };
      detail = Array.isArray(j.message) ? j.message.join("; ") : typeof j.message === "string" ? j.message : "";
    } catch {
      // Not JSON.
    }
    throw new GhlError(
      res.status,
      res.status === 403
        ? "The GoHighLevel Private Integration needs the contacts.write scope."
        : `GoHighLevel didn't accept the change${detail ? `: ${detail}` : ` (error ${res.status})`}.`,
    );
  }
}

/**
 * The text of an email message. GHL lists emails without their body; it lives
 * behind the email endpoint, keyed by the email id(s) in the message's meta.
 */
export async function fetchEmailText(token: string, messageId: string, htmlToText: (h: string) => string): Promise<string> {
  const detail = (await ghlGet(`/conversations/messages/${encodeURIComponent(messageId)}`, token)) as {
    message?: { meta?: { email?: { messageIds?: string[] } } };
    meta?: { email?: { messageIds?: string[] } };
  };
  const meta = detail.message?.meta ?? detail.meta;
  const emailIds = meta?.email?.messageIds?.length ? meta.email.messageIds : [messageId];
  for (const id of emailIds.slice(-1)) {
    const res = (await ghlGet(`/conversations/messages/email/${encodeURIComponent(id)}`, token)) as {
      emailMessage?: { body?: string; subject?: string };
      body?: string;
      subject?: string;
    };
    const email = res.emailMessage ?? res;
    const text = htmlToText(email.body ?? "");
    const subject = (email.subject ?? "").trim();
    if (text || subject) return [subject, text].filter(Boolean).join("\n\n").slice(0, 5000);
  }
  return "";
}
