/** The one address for a client's conversation: the Inbox with that client open (any view, any department). */
export function conversationHref(clientId: string): string {
  return `/dashboard/inbox?view=all&dept=all&c=${encodeURIComponent(clientId)}`;
}
