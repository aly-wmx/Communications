import type { BusinessHours, ClientContact, SlaSettings } from './types';

const MINUTE = 60_000;

/** Wall-clock parts of an instant in an IANA time zone (e.g. "America/Los_Angeles"). */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

/** How far the zone is ahead of UTC at that instant, in ms (handles daylight saving). */
function zoneOffset(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant when the clock in `timeZone` reads that date and time. */
function zonedTime(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - zoneOffset(new Date(guess), timeZone);
  // Re-check at the result in case a daylight-saving change sits between.
  return guess - zoneOffset(new Date(first), timeZone);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Minutes between two instants that fall inside business hours, read on the
 * clock of `timeZone` (the business's time zone, so the answer is the same on
 * the server and in every browser). Without a zone, the local clock is used.
 * With business hours disabled this is plain elapsed minutes.
 */
export function businessMinutesBetween(from: Date, to: Date, hours: BusinessHours, timeZone?: string): number {
  if (to <= from) return 0;
  if (!hours.enabled) return Math.floor((to.getTime() - from.getTime()) / MINUTE);

  const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [openH, openM] = hours.start.split(":").map(Number);
  const [closeH, closeM] = hours.end.split(":").map(Number);

  let total = 0;
  // Walk calendar days in the business's zone; cap the walk so a malformed date can't spin forever.
  const startDay = zonedParts(from, tz);
  let cursor = Date.UTC(startDay.year, startDay.month - 1, startDay.day);
  for (let i = 0; i < 3660; i++) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    const dayStart = zonedTime(y, m, dd, 0, 0, tz);
    if (dayStart > to.getTime()) break;
    if (hours.days.includes(d.getUTCDay())) {
      const open = zonedTime(y, m, dd, openH, openM, tz);
      const close = zonedTime(y, m, dd, closeH, closeM, tz);
      const s = Math.max(open, from.getTime());
      const e = Math.min(close, to.getTime());
      if (e > s) total += e - s;
    }
    cursor += 24 * 60 * MINUTE;
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
  const waitedMinutes = businessMinutesBetween(new Date(c.receivedAt), end, s.businessHours, s.timeZone);

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
