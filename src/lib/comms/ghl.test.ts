import { describe, expect, it } from 'vitest';
import { channelFrom, eventFromApiMessage, normalisePhone, parseGhlPayload, toMillis } from './ghl';

const now = new Date('2026-10-02T15:00:00Z');

describe('parseGhlPayload', () => {
  it('reads a workflow "Customer Replied" payload', () => {
    const e = parseGhlPayload(
      {
        contact_id: 'abc123',
        first_name: 'Maria',
        last_name: 'Hernandez',
        phone: '+15550142000',
        email: 'maria@example.com',
        message: { type: 'SMS', body: 'Is the delivery still Thursday?' },
      },
      now,
    );
    expect(e).toMatchObject({
      direction: 'inbound',
      channel: 'Text',
      ghlContactId: 'abc123',
      name: 'Maria Hernandez',
      body: 'Is the delivery still Thursday?',
      at: now.toISOString(),
    });
  });

  it('lets Custom Data set the event, channel and message', () => {
    const e = parseGhlPayload(
      { contact_id: 'x', full_name: 'Patel', customData: { event: 'missed_call', message: 'Called twice' } },
      now,
    );
    expect(e).toMatchObject({ channel: 'Missed call', body: 'Called twice', direction: 'inbound' });
  });

  it('detects outbound replies', () => {
    expect(parseGhlPayload({ contact_id: 'x', customData: { event: 'outbound' } }, now).direction).toBe('outbound');
    expect(parseGhlPayload({ type: 'OutboundMessage', contactId: 'x', messageType: 'SMS' }, now).direction).toBe('outbound');
  });

  it('reads marketplace-style payloads', () => {
    const e = parseGhlPayload(
      { type: 'InboundMessage', contactId: 'c9', messageType: 'Email', body: 'Hi', messageId: 'm1', dateAdded: '2026-10-02T14:00:00Z' },
      now,
    );
    expect(e).toMatchObject({ channel: 'Email', messageId: 'm1', body: 'Hi', at: '2026-10-02T14:00:00.000Z' });
  });

  it('ignores future timestamps and requires something to match a client', () => {
    expect(parseGhlPayload({ phone: '555', dateAdded: '2030-01-01' }, now).at).toBe(now.toISOString());
    expect(() => parseGhlPayload({ message: { body: 'hi' } }, now)).toThrow(/contact id/);
    expect(() => parseGhlPayload('nope', now)).toThrow();
  });
});

describe('helpers', () => {
  it('maps channels', () => {
    expect(channelFrom('TYPE_CALL', '')).toBe('Call');
    expect(channelFrom('Voicemail', '')).toBe('Voicemail');
    expect(channelFrom('Facebook', '')).toBe('Portal message');
    expect(channelFrom('', 'voicemail')).toBe('Voicemail');
  });

  it('normalises phone numbers', () => {
    expect(normalisePhone('+1 (555) 014-2000')).toBe(normalisePhone('5550142000'));
  });
});

describe('eventFromApiMessage', () => {
  const conv = { id: 'cv1', contactId: 'c1', fullName: 'Maria Hernandez', phone: '+15550142000' };
  const at = '2026-10-02T14:00:00.000Z';

  it('turns an inbound SMS into an event', () => {
    expect(eventFromApiMessage(conv, { id: 'm1', direction: 'inbound', messageType: 'TYPE_SMS', body: 'Hi', dateAdded: at }, now)).toMatchObject({
      direction: 'inbound', channel: 'Text', ghlContactId: 'c1', name: 'Maria Hernandez', body: 'Hi', messageId: 'm1', at,
    });
  });

  it('keeps missed calls and voicemails, skips answered inbound calls', () => {
    const call = (status: string) => ({ id: 'm2', direction: 'inbound', messageType: 'TYPE_CALL', dateAdded: at, meta: { call: { status } } });
    expect(eventFromApiMessage(conv, call('no-answer'), now)?.channel).toBe('Missed call');
    expect(eventFromApiMessage(conv, call('voicemail'), now)?.channel).toBe('Voicemail');
    expect(eventFromApiMessage(conv, call('completed'), now)).toBeNull();
  });

  it('counts outbound only when a person sent it', () => {
    const out = { id: 'm3', direction: 'outbound', messageType: 'TYPE_SMS', body: 'On our way', dateAdded: at };
    expect(eventFromApiMessage(conv, out, now)).toBeNull();
    expect(eventFromApiMessage(conv, { ...out, userId: 'u1' }, now)?.direction).toBe('outbound');
  });

  it('ignores system notes and messages without an id', () => {
    expect(eventFromApiMessage(conv, { id: 'm4', direction: 'inbound', messageType: 'TYPE_ACTIVITY_CONTACT', dateAdded: at }, now)).toBeNull();
    expect(eventFromApiMessage(conv, { direction: 'inbound', messageType: 'TYPE_SMS', dateAdded: at }, now)).toBeNull();
  });

  it('reads epoch timestamps and clamps future ones', () => {
    expect(toMillis(1759413600000)).toBe(1759413600000);
    expect(toMillis('1759413600000')).toBe(1759413600000);
    expect(eventFromApiMessage(conv, { id: 'm5', direction: 'inbound', messageType: 'TYPE_EMAIL', dateAdded: '2030-01-01' }, now)?.at).toBe(now.toISOString());
  });
});
