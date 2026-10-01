/**
 * Turns a GoHighLevel workflow webhook into a tracker event.
 *
 * GHL's payload shape varies by trigger, so this reads the standard contact fields
 * plus anything set under the webhook action's "Custom Data":
 *   event:   inbound | outbound | call | missed_call | voicemail   (default: inbound)
 *   channel: SMS | Email | Call | …                                (optional override)
 *   message: the message text                                       (optional override)
 *
 * Kept free of runtime imports so the Vercel function can load it directly.
 */

export type GhlChannel = 'Call' | 'Missed call' | 'Voicemail' | 'Text' | 'Email' | 'Portal message';

export interface GhlEvent {
  direction: 'inbound' | 'outbound';
  channel: GhlChannel;
  ghlContactId: string;
  name: string;
  phone: string;
  email: string;
  body: string;
  messageId: string;
  /** ISO time the message happened; falls back to now. */
  at: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** First non-empty string among the given paths, e.g. "message.body". */
function pick(o: Obj, ...paths: string[]): string {
  for (const p of paths) {
    let cur: unknown = o;
    for (const k of p.split('.')) cur = isObj(cur) ? cur[k] : undefined;
    const s = str(cur);
    if (s) return s;
  }
  return '';
}

export function channelFrom(raw: string, event: string): GhlChannel {
  const e = event.toLowerCase();
  if (e.includes('missed')) return 'Missed call';
  if (e.includes('voicemail')) return 'Voicemail';
  if (e === 'call') return 'Call';
  const c = raw.toLowerCase();
  if (c.includes('missed')) return 'Missed call';
  if (c.includes('voicemail')) return 'Voicemail';
  if (c.includes('call') || c === 'phone') return 'Call';
  if (c.includes('email')) return 'Email';
  if (/(chat|facebook|fb|instagram|ig|whatsapp|gmb|web)/.test(c)) return 'Portal message';
  return 'Text';
}

/** Last 10 digits, so "+1 (555) 014-2000" and "5550142000" match. */
export function normalisePhone(p: string): string {
  return p.replace(/\D/g, '').slice(-10);
}

export function parseGhlPayload(body: unknown, now = new Date()): GhlEvent {
  if (!isObj(body)) throw new Error('Payload must be a JSON object.');
  const custom = isObj(body.customData) ? body.customData : {};
  const all: Obj = { ...body, ...custom };

  const event = pick(all, 'event', 'event_type', 'type').toLowerCase();
  const direction: GhlEvent['direction'] =
    event.includes('outbound') || pick(all, 'message.direction', 'direction').toLowerCase() === 'outbound'
      ? 'outbound'
      : 'inbound';

  const rawChannel = pick(all, 'channel', 'message.type', 'message.messageType', 'messageType');
  const name =
    pick(all, 'full_name', 'contact.name', 'name') ||
    [pick(all, 'first_name', 'contact.firstName'), pick(all, 'last_name', 'contact.lastName')].filter(Boolean).join(' ');
  const phone = pick(all, 'phone', 'contact.phone', 'from');
  const email = pick(all, 'email', 'contact.email');
  const ghlContactId = pick(all, 'contact_id', 'contactId', 'contact.id');

  if (!ghlContactId && !phone && !email) {
    throw new Error('Payload has no contact id, phone or email to match a client.');
  }

  const when = pick(all, 'message.dateAdded', 'dateAdded', 'date_created', 'timestamp');
  const parsed = when ? new Date(when) : null;

  return {
    direction,
    channel: channelFrom(rawChannel, event),
    ghlContactId,
    name: name || phone || email,
    phone,
    email,
    body: pick(all, 'message', 'message.body', 'body', 'messageBody').slice(0, 2000),
    messageId: pick(all, 'message_id', 'messageId', 'message.id'),
    at: parsed && !Number.isNaN(parsed.getTime()) && parsed <= now ? parsed.toISOString() : now.toISOString(),
  };
}
