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
