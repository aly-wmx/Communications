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
