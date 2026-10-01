import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalisePhone, parseGhlPayload, type GhlEvent } from '../../src/lib/ghl.js';

/**
 * GoHighLevel → client queue.
 * POST /api/ghl/webhook?secret=…  (or header x-webhook-secret)
 *
 * Inbound: adds to the client's open contact, or opens a new one.
 * Outbound: marks the client's open contacts as responded.
 */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function secretOk(req: Request): boolean {
  const expected = process.env.GHL_WEBHOOK_SECRET ?? '';
  if (expected.length < 16) return false;
  const given = new URL(req.url).searchParams.get('secret') ?? req.headers.get('x-webhook-secret') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof db>;

interface ClientRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  owner_id: string | null;
  ghl_contact_id: string | null;
}

async function findOrCreateClient(sb: Db, e: GhlEvent): Promise<ClientRow> {
  const cols = 'id,name,phone,email,owner_id,ghl_contact_id';
  if (e.ghlContactId) {
    const { data } = await sb.from('clients').select(cols).eq('ghl_contact_id', e.ghlContactId).maybeSingle();
    if (data) return data as ClientRow;
  }
  const { data: all, error } = await sb.from('clients').select(cols);
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
      await sb.from('clients').update({ ghl_contact_id: e.ghlContactId }).eq('id', match.id);
    }
    return match;
  }

  // Client names are unique; disambiguate a clash with the phone number.
  const taken = new Set((all as ClientRow[]).map((c) => c.name.trim().toLowerCase()));
  let name = e.name || 'Unknown client';
  if (taken.has(name.toLowerCase())) name = `${name} (${e.phone || e.email || e.ghlContactId})`;

  const row = {
    id: `cl_${randomUUID()}`,
    name,
    phone: e.phone,
    email: e.email,
    ghl_contact_id: e.ghlContactId || null,
  };
  const { data, error: insErr } = await sb.from('clients').insert(row).select(cols).single();
  if (insErr) throw insErr;
  return data as ClientRow;
}

function describe(e: GhlEvent): string {
  const text = e.body ? `: “${e.body.slice(0, 140)}${e.body.length > 140 ? '…' : ''}”` : '';
  return `${e.channel} via GoHighLevel${text}`;
}

async function handleInbound(sb: Db, e: GhlEvent, client: ClientRow) {
  const { data: open } = await sb
    .from('contacts')
    .select('id,history,summary')
    .eq('client_id', client.id)
    .eq('status', 'Open')
    .order('received_at', { ascending: true })
    .limit(1);

  const event = { at: new Date().toISOString(), byId: '', message: describe(e) };
  if (open && open.length) {
    // Client is already waiting on us: keep one row, keep the original clock.
    const c = open[0] as { id: string; history: unknown[]; summary: string };
    await sb
      .from('contacts')
      .update({ history: [...(c.history ?? []), event], summary: c.summary || e.body, updated_at: event.at })
      .eq('id', c.id);
    return { action: 'appended', contactId: c.id };
  }

  const { data: settings } = await sb.from('settings').select('sla').eq('id', 1).maybeSingle();
  const defaultAssignee = (settings?.sla as { defaultAssigneeId?: string } | undefined)?.defaultAssigneeId || null;
  const id = `ct_${randomUUID()}`;
  const { error } = await sb.from('contacts').insert({
    id,
    client_id: client.id,
    channel: e.channel,
    priority: 'Normal',
    received_at: e.at,
    summary: e.body,
    assignee_id: client.owner_id || defaultAssignee,
    status: 'Open',
    history: [{ ...event, at: e.at }],
    source: 'ghl',
    ghl_message_id: e.messageId || null,
  });
  if (error) throw error;
  return { action: 'created', contactId: id };
}

async function handleOutbound(sb: Db, e: GhlEvent, client: ClientRow) {
  const { data: open } = await sb
    .from('contacts')
    .select('id,history,first_response_at')
    .eq('client_id', client.id)
    .eq('status', 'Open');
  const at = e.at;
  for (const c of (open ?? []) as Array<{ id: string; history: unknown[]; first_response_at: string | null }>) {
    await sb
      .from('contacts')
      .update({
        first_response_at: c.first_response_at ?? at,
        status: 'Waiting on client',
        history: [...(c.history ?? []), { at, byId: '', message: `Replied in GoHighLevel (${e.channel.toLowerCase()})` }],
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id);
  }
  return { action: 'responded', updated: open?.length ?? 0 };
}

export async function POST(req: Request): Promise<Response> {
  if (!secretOk(req)) return json(401, { error: 'Unauthorized' });

  let event: GhlEvent;
  try {
    event = parseGhlPayload(await req.json());
  } catch (err) {
    return json(400, { error: (err as Error).message });
  }

  try {
    const sb = db();
    if (event.messageId) {
      const { data: dup } = await sb.from('contacts').select('id').eq('ghl_message_id', event.messageId).maybeSingle();
      if (dup) return json(200, { action: 'duplicate', contactId: dup.id });
    }
    const client = await findOrCreateClient(sb, event);
    const result = event.direction === 'outbound' ? await handleOutbound(sb, event, client) : await handleInbound(sb, event, client);
    return json(200, { ok: true, clientId: client.id, ...result });
  } catch (err) {
    console.error('ghl webhook failed', err);
    return json(500, { error: 'Could not record the event.' });
  }
}

export function GET(req: Request): Response {
  // Lets you check the URL and secret are right without sending data.
  return secretOk(req) ? json(200, { ok: true }) : json(401, { error: 'Unauthorized' });
}
