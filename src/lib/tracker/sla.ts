import type { BusinessHours, ClientContact, SlaSettings } from './types';

const MINUTE = 60_000;

function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Minutes between two instants that fall inside business hours.
 * With business hours disabled this is plain elapsed minutes.
 */
export function businessMinutesBetween(from: Date, to: Date, hours: BusinessHours): number {
  if (to <= from) return 0;
  if (!hours.enabled) return Math.floor((to.getTime() - from.getTime()) / MINUTE);

  let total = 0;
  const day = new Date(from);
  day.setHours(0, 0, 0, 0);
  // Walk day by day; cap the walk so a malformed date can't spin forever.
  for (let i = 0; day <= to && i < 3660; i++) {
    if (hours.days.includes(day.getDay())) {
      const open = atTime(day, hours.start);
      const close = atTime(day, hours.end);
      const s = Math.max(open.getTime(), from.getTime());
      const e = Math.min(close.getTime(), to.getTime());
      if (e > s) total += e - s;
    }
    day.setDate(day.getDate() + 1);
  }
  return Math.floor(total / MINUTE);
}

export type SlaStage = 'ok' | 'reminder' | 'breach' | 'responded' | 'paused';

export interface SlaState {
  stage: SlaStage;
  /** SLA minutes counted so far (to first response, or to now). */
  waitedMinutes: number;
  /** Minutes until the next threshold; null once breached or stopped. */
  minutesToNext: number | null;
  escalateAfter: number;
}

export function escalateThreshold(c: ClientContact, s: SlaSettings): number {
  return c.priority === 'Urgent' ? s.urgentEscalateMinutes : s.escalateMinutes;
}

export function slaState(c: ClientContact, s: SlaSettings, now: Date): SlaState {
  const escalateAfter = escalateThreshold(c, s);
  const end = c.firstResponseAt ? new Date(c.firstResponseAt) : now;
  const waitedMinutes = businessMinutesBetween(new Date(c.receivedAt), end, s.businessHours);

  if (c.firstResponseAt) return { stage: 'responded', waitedMinutes, minutesToNext: null, escalateAfter };
  if (c.status !== 'Open') return { stage: 'paused', waitedMinutes, minutesToNext: null, escalateAfter };

  if (waitedMinutes >= escalateAfter) {
    return { stage: 'breach', waitedMinutes, minutesToNext: null, escalateAfter };
  }
  // Urgent items skip the reminder stage when they escalate at or before it.
  const reminderAfter = Math.min(s.reminderMinutes, escalateAfter);
  if (waitedMinutes >= reminderAfter) {
    return { stage: 'reminder', waitedMinutes, minutesToNext: escalateAfter - waitedMinutes, escalateAfter };
  }
  return { stage: 'ok', waitedMinutes, minutesToNext: reminderAfter - waitedMinutes, escalateAfter };
}

/** True when the SLA says this contact should be escalated and nobody has yet. */
export function needsEscalation(c: ClientContact, s: SlaSettings, now: Date): boolean {
  return slaState(c, s, now).stage === 'breach' && c.escalations.length === 0;
}

export function formatMinutes(min: number): string {
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export const defaultSla: SlaSettings = {
  reminderMinutes: 60,
  escalateMinutes: 240,
  urgentEscalateMinutes: 0,
  businessHours: { enabled: true, start: '08:00', end: '17:00', days: [1, 2, 3, 4, 5] },
  defaultAssigneeId: '',
};
