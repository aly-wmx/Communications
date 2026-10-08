/**
 * Guardrails on sending to clients from the portal. Every text or email costs
 * money, goes out from the business number, and can't be taken back, so:
 * the sender must be allowed to send, and each person has hourly limits.
 */

export const SENDS_PER_HOUR = 60;
export const NEW_CONTACTS_PER_HOUR = 10;

export interface SendUsage {
  /** Can this person message clients at all (Team page → "Can send"). */
  canSend: boolean;
  /** Messages this person sent from the portal in the last hour. */
  sentLastHour: number;
  /** Of those, how many went to clients created in the last hour (new numbers or addresses). */
  newContactsLastHour: number;
}

/** null when the send may go ahead, otherwise the reason shown to the person. */
export function sendBlockedReason(usage: SendUsage, opts: { newContact: boolean }): string | null {
  if (!usage.canSend) return "You can't message clients yet. Ask an admin to turn on “Can send” for you on the Team page.";
  if (usage.sentLastHour >= SENDS_PER_HOUR) {
    return `You've sent ${SENDS_PER_HOUR} messages in the last hour, the most allowed. Wait a little, or send from GoHighLevel.`;
  }
  if (opts.newContact && usage.newContactsLastHour >= NEW_CONTACTS_PER_HOUR) {
    return `You've started ${NEW_CONTACTS_PER_HOUR} conversations with new numbers or addresses in the last hour, the most allowed. Wait a little and try again.`;
  }
  return null;
}
