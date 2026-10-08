import { describe, expect, it } from 'vitest';
import { channelFrom, eventFromApiMessage, messageRecordFromApi, normalisePhone, parseGhlPayload, toMillis, unansweredTail } from './ghl';

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

describe('messageRecordFromApi', () => {
  const conv = { id: 'cv1', contactId: 'c1', fullName: 'Maria' };
  const at = '2026-10-02T14:00:00.000Z';

  it('keeps every real message, including automated outbound', () => {
    const r = messageRecordFromApi(conv, { id: 'm1', direction: 'outbound', messageType: 'TYPE_SMS', body: 'Thanks!', dateAdded: at, source: 'workflow' }, now);
    expect(r).toMatchObject({ id: 'm1', conversationId: 'cv1', direction: 'outbound', channel: 'Text', body: 'Thanks!', sentByUser: false, source: 'workflow', occurredAt: at });
  });

  it('writes readable call lines', () => {
    const call = (direction: string, status: string, type = 'TYPE_CALL') =>
      messageRecordFromApi(conv, { id: 'm2', direction, messageType: type, dateAdded: at, meta: { call: { status } } }, now);
    expect(call('inbound', 'no-answer')).toMatchObject({ channel: 'Missed call', body: 'Incoming call · no answer' });
    expect(call('inbound', 'completed', 'TYPE_IVR_CALL')).toMatchObject({ channel: 'Call', body: 'Incoming call · completed' });
    expect(call('outbound', 'completed')).toMatchObject({ channel: 'Call', body: 'Outgoing call · completed' });
    expect(call('inbound', 'voicemail')).toMatchObject({ channel: 'Voicemail', body: 'Voicemail' });
  });

  it('drops system notes', () => {
    expect(messageRecordFromApi(conv, { id: 'm3', direction: 'inbound', messageType: 'TYPE_ACTIVITY_OPPORTUNITY', dateAdded: at }, now)).toBeNull();
  });
});

describe('unansweredTail', () => {
  const m = (direction: string, sentByUser: boolean, occurredAt: string) => ({ direction, sentByUser, occurredAt });

  it('returns client messages after the last human reply', () => {
    const thread = [
      m('inbound', false, '2026-10-01T10:00:00Z'),
      m('outbound', true, '2026-10-01T11:00:00Z'),
      m('inbound', false, '2026-10-02T09:00:00Z'),
      m('outbound', false, '2026-10-02T09:01:00Z'), // auto-reply doesn't count
      m('inbound', false, '2026-10-02T09:30:00Z'),
    ];
    expect(unansweredTail(thread).map((x) => x.occurredAt)).toEqual(['2026-10-02T09:00:00Z', '2026-10-02T09:30:00Z']);
  });

  it('treats an answered incoming call as the team engaging', () => {
    const thread = [
      { ...m('inbound', false, '2026-10-01T10:00:00Z'), channel: 'Text' },
      { ...m('inbound', false, '2026-10-01T10:05:00Z'), channel: 'Call' },
    ];
    expect(unansweredTail(thread)).toEqual([]);
  });

  it('is empty when the team replied last', () => {
    expect(unansweredTail([m('inbound', false, '2026-10-01T10:00:00Z'), m('outbound', true, '2026-10-01T11:00:00Z')])).toEqual([]);
  });
});

describe('messageRecordFromApi call details and attachments', () => {
  it('keeps call status, length and photos', () => {
    const conv = { id: 'cv', contactId: 'c' };
    const call = messageRecordFromApi(conv, { id: 'm', direction: 'inbound', messageType: 'TYPE_CALL', dateAdded: '2026-10-02T14:00:00Z', meta: { call: { status: 'completed', duration: 95 } } }, now);
    expect(call).toMatchObject({ callStatus: 'completed', durationSeconds: 95, attachments: [] });
    const mms = messageRecordFromApi(conv, { id: 'n', direction: 'inbound', messageType: 'TYPE_SMS', body: 'Look', dateAdded: '2026-10-02T14:00:00Z', attachments: ['https://storage.googleapis.com/msgsndr/a.jpg', 'ftp://x'] }, now);
    expect(mms).toMatchObject({ callStatus: '', durationSeconds: null, attachments: ['https://storage.googleapis.com/msgsndr/a.jpg'] });
  });
});
