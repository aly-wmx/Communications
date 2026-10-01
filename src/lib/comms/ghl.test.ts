import { describe, expect, it } from 'vitest';
import { channelFrom, normalisePhone, parseGhlPayload } from './ghl';

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
