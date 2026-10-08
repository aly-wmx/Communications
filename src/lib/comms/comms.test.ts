import { describe, expect, it } from 'vitest';
import {
  assign,
  clientSummaries,
  createContact,
  escalate,
  markResponded,
  queueStats,
  resolve,
  sortQueue,
} from './contacts';
import { businessMinutesBetween, defaultSla, formatMinutes, needsEscalation, slaState } from './sla';
import type { Client, SlaSettings, TeamMember } from './types';

// 2026-10-05 is a Monday.
const at = (s: string) => new Date(`2026-10-${s}`);
const hours = defaultSla.businessHours;
const allHours: SlaSettings = { ...defaultSla, businessHours: { ...hours, enabled: false } };

const team: TeamMember[] = [
  { id: 'van', name: 'Van', email: '', phone: '', escalation: false },
  { id: 'reid', name: 'Reid', email: '', phone: '', escalation: true },
  { id: 'chris', name: 'Chris', email: '', phone: '', escalation: true },
];

const contact = (receivedAt: string, over: Partial<Parameters<typeof createContact>[0]> = {}) =>
  createContact(
    { clientId: 'cl1', channel: 'Text', priority: 'Normal', receivedAt, summary: 'Question', assigneeId: 'van', ...over },
    'van',
    new Date(receivedAt),
  );

describe('businessMinutesBetween', () => {
  it('counts plain minutes when business hours are off', () => {
    expect(businessMinutesBetween(at('05T20:00'), at('06T08:00'), { ...hours, enabled: false })).toBe(720);
  });

  it('does not count evenings', () => {
    // 4pm Mon → 9am Tue = 1h Monday + 1h Tuesday
    expect(businessMinutesBetween(at('05T16:00'), at('06T09:00'), hours)).toBe(120);
  });

  it('does not count weekends', () => {
    // Fri 4pm → Mon 9am = 1h Friday + 1h Monday
    expect(businessMinutesBetween(at('09T16:00'), at('12T09:00'), hours)).toBe(120);
  });

  it('starts the clock at opening for after-hours messages', () => {
    expect(businessMinutesBetween(at('05T21:00'), at('06T08:30'), hours)).toBe(30);
  });
});

describe('slaState', () => {
  it('moves ok → reminder → breach at the thresholds', () => {
    const c = contact('2026-10-05T09:00');
    expect(slaState(c, defaultSla, at('05T09:59')).stage).toBe('ok');
    expect(slaState(c, defaultSla, at('05T10:00')).stage).toBe('reminder');
    expect(slaState(c, defaultSla, at('05T13:00')).stage).toBe('breach');
  });

  it('does not breach overnight with business hours on', () => {
    const c = contact('2026-10-05T16:30');
    // 30m Monday + 30m Tuesday
    expect(slaState(c, defaultSla, at('06T08:30'))).toMatchObject({ stage: 'reminder', waitedMinutes: 60 });
    expect(slaState(c, allHours, at('06T08:30')).stage).toBe('breach');
  });

  it('escalates urgent contacts immediately by default', () => {
    const c = contact('2026-10-05T09:00', { priority: 'Urgent' });
    expect(slaState(c, defaultSla, at('05T09:00')).stage).toBe('breach');
    expect(needsEscalation(c, defaultSla, at('05T09:00'))).toBe(true);
  });

  it('stops the clock at the first response', () => {
    const c = markResponded(contact('2026-10-05T09:00'), 'van', at('05T09:20'));
    const st = slaState(c, defaultSla, at('05T17:00'));
    expect(st).toMatchObject({ stage: 'responded', waitedMinutes: 20 });
    expect(c.status).toBe('Waiting on client');
  });

  it('keeps the first response time on follow-up replies', () => {
    const once = markResponded(contact('2026-10-05T09:00'), 'van', at('05T09:20'));
    const twice = markResponded(once, 'reid', at('05T11:00'));
    expect(twice.firstResponseAt).toBe(once.firstResponseAt);
    expect(twice.respondedById).toBe('van');
    expect(twice.history.at(-1)?.message).toBe('Responded again');
  });
});

describe('escalation', () => {
  it('no longer needs escalation once escalated, but stays overdue', () => {
    const c = contact('2026-10-05T09:00');
    const now = at('05T14:00');
    expect(needsEscalation(c, defaultSla, now)).toBe(true);
    const e = escalate(c, 'van', ['reid', 'chris'], 'Client upset', team, now);
    expect(needsEscalation(e, defaultSla, now)).toBe(false);
    expect(slaState(e, defaultSla, now).stage).toBe('breach');
    expect(e.history.at(-1)?.message).toBe('Escalated to Reid & Chris — Client upset');
  });
});

describe('queue', () => {
  it('sorts needs-escalation first and resolved last', () => {
    const now = at('05T14:00');
    const fresh = contact('2026-10-05T13:50');
    const old = contact('2026-10-05T09:00');
    const escalated = escalate(contact('2026-10-05T08:00'), 'van', ['reid'], '', team, now);
    const done = resolve(contact('2026-10-05T08:00'), 'van', now);
    const order = sortQueue([done, fresh, escalated, old], defaultSla, now);
    expect(order).toEqual([old, escalated, fresh, done]);
  });

  it('computes stats', () => {
    const now = at('05T14:00');
    const list = [
      contact('2026-10-05T09:00'), // breached, needs escalation
      markResponded(contact('2026-10-05T10:00'), 'van', at('05T10:30')),
      markResponded(contact('2026-10-05T08:00'), 'van', at('05T13:00')), // responded late
      resolve(contact('2026-10-05T11:00'), 'van', at('05T12:00')),
    ];
    const s = queueStats(list, defaultSla, now);
    expect(s.waiting).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.needsEscalation).toBe(1);
    expect(s.waitingOnClient).toBe(2);
    expect(s.resolvedToday).toBe(1);
    expect(s.medianResponse7d).toBe(165); // 30 and 300
    expect(s.withinSla7d).toBe(0.5);
  });

  it('records assignment changes', () => {
    const c = assign(contact('2026-10-05T09:00'), 'reid', 'van', team);
    expect(c.assigneeId).toBe('reid');
    expect(c.history.at(-1)?.message).toBe('Assigned to Reid');
  });
});

describe('clientSummaries', () => {
  it('reports who is waiting on us and for how long', () => {
    const client: Client = {
      id: 'cl1', name: 'Smith', project: '', phone: '', email: '', ownerId: '', notes: '', createdAt: '',
    };
    const [s] = clientSummaries([client], [contact('2026-10-05T09:00')], defaultSla, at('05T14:00'));
    expect(s).toMatchObject({ open: 1, waitingOnUs: 1, longestWaitMinutes: 300, breached: true });
  });
});

describe('formatMinutes', () => {
  it('formats durations compactly', () => {
    expect(formatMinutes(0)).toBe('<1m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(125)).toBe('2h 5m');
    expect(formatMinutes(60 * 26)).toBe('1d 2h');
  });
});

describe('business hours in a time zone', () => {
  const hoursLA = { enabled: true, start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] };

  it('counts on the business clock, not the computer clock', () => {
    // Mon 5 Oct 2026, 9:00–10:00 in Los Angeles = 16:00–17:00 UTC.
    const from = new Date('2026-10-05T16:00:00Z');
    const to = new Date('2026-10-05T17:00:00Z');
    expect(businessMinutesBetween(from, to, hoursLA, 'America/Los_Angeles')).toBe(60);
    // The same hour is 1–2am in Manila: outside business hours there.
    expect(businessMinutesBetween(from, to, hoursLA, 'Asia/Manila')).toBe(0);
  });

  it('skips evenings and weekends in that zone', () => {
    // Fri 9 Oct 4pm LA → Mon 12 Oct 9am LA = 1h Friday + 1h Monday.
    expect(
      businessMinutesBetween(new Date('2026-10-09T23:00:00Z'), new Date('2026-10-12T16:00:00Z'), hoursLA, 'America/Los_Angeles'),
    ).toBe(120);
  });

  it('handles the daylight-saving change', () => {
    // Mon 2 Nov 2026 (after clocks go back): 8am LA = 16:00 UTC.
    expect(
      businessMinutesBetween(new Date('2026-11-02T16:00:00Z'), new Date('2026-11-02T17:00:00Z'), hoursLA, 'America/Los_Angeles'),
    ).toBe(60);
  });

  it('flows through slaState', () => {
    const s = { ...defaultSla, timeZone: 'America/Los_Angeles' };
    const c = contact('2026-10-05T16:00:00.000Z'); // 9am LA Monday
    expect(slaState(c, s, new Date('2026-10-05T17:00:00Z')).waitedMinutes).toBe(60);
  });
});

describe('resolve with a reason', () => {
  it('records the reason in the history', () => {
    const c = resolve(contact('2026-10-05T09:00'), 'van', new Date('2026-10-05T10:00:00Z'), 'Handled by phone');
    expect(c.status).toBe('Resolved');
    expect(c.history.at(-1)?.message).toBe('Resolved — Handled by phone');
  });
});

describe("startOfZonedDay", () => {
  it("is midnight on the business's clock, not the server's", async () => {
    const { startOfZonedDay } = await import("./sla");
    // 02:30 UTC on Oct 9 is still Oct 8 in New York (22:30 EDT): midnight there is 04:00 UTC on Oct 8.
    expect(startOfZonedDay(new Date("2026-10-09T02:30:00Z"), "America/New_York").toISOString()).toBe("2026-10-08T04:00:00.000Z");
    expect(startOfZonedDay(new Date("2026-10-09T15:00:00Z"), "America/New_York").toISOString()).toBe("2026-10-09T04:00:00.000Z");
  });
});
