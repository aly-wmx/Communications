import { slaState } from "./sla";
import type { ClientContact, SlaSettings } from "./types";

/** Response metrics for the Reports page and its export. Pure, so the numbers are tested. */

export const REPORT_RANGES = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", all: "All time" } as const;
export type ReportRange = keyof typeof REPORT_RANGES;

const DAY = 24 * 60 * 60_000;

export function rangeStart(range: ReportRange, now: Date): Date | null {
  if (range === "all") return null;
  return new Date(now.getTime() - { "7d": 7, "30d": 30, "90d": 90 }[range] * DAY);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Monday (YYYY-MM-DD) of the week an instant falls in, on the business's calendar. */
export function weekStart(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const day = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))) - Math.max(0, weekday) * DAY;
  return new Date(day).toISOString().slice(0, 10);
}

export interface ResponseFacts {
  /** Business minutes to the first response; null if never answered. */
  firstResponseMinutes: number | null;
  withinTarget: boolean | null;
  escalated: boolean;
  autoEscalated: boolean;
}

export function facts(c: ClientContact, sla: SlaSettings, now: Date): ResponseFacts {
  const st = slaState(c, sla, now);
  const responded = Boolean(c.firstResponseAt);
  return {
    firstResponseMinutes: responded ? st.waitedMinutes : null,
    // Urgent contacts with an "immediately" target count as on time when answered within the first minute.
    withinTarget: responded ? st.waitedMinutes < Math.max(1, st.escalateAfter) : null,
    escalated: c.escalations.length > 0,
    autoEscalated: c.escalations.some((e) => e.reason === "sla"),
  };
}

export interface ReportData {
  totals: {
    contacts: number;
    answered: number;
    resolvedWithoutReply: number;
    waitingNow: number;
    medianFirstResponse: number | null;
    averageFirstResponse: number | null;
    withinTargetPct: number | null;
    escalated: number;
    autoEscalated: number;
  };
  weeks: Array<{ week: string; contacts: number; withinTargetPct: number | null; escalated: number }>;
  channels: Array<{ channel: string; contacts: number; medianFirstResponse: number | null }>;
  people: Array<{ id: string; answered: number; medianFirstResponse: number | null; withinTargetPct: number | null; pickedUp: number }>;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export function buildReport(all: ClientContact[], sla: SlaSettings, now: Date, range: ReportRange): ReportData {
  const from = rangeStart(range, now);
  const contacts = all.filter((c) => !from || new Date(c.receivedAt) >= from);
  const tz = sla.timeZone || "UTC";
  const f = new Map(contacts.map((c) => [c.id, facts(c, sla, now)]));
  const frt = (list: ClientContact[]) => list.map((c) => f.get(c.id)!.firstResponseMinutes).filter((m): m is number => m !== null);
  const within = (list: ClientContact[]) => {
    const answered = list.filter((c) => f.get(c.id)!.withinTarget !== null);
    return pct(answered.filter((c) => f.get(c.id)!.withinTarget).length, answered.length);
  };

  const answered = contacts.filter((c) => c.firstResponseAt);
  const times = frt(contacts);

  const weekMap = new Map<string, ClientContact[]>();
  for (const c of contacts) {
    const w = weekStart(c.receivedAt, tz);
    weekMap.set(w, [...(weekMap.get(w) ?? []), c]);
  }
  const channelMap = new Map<string, ClientContact[]>();
  for (const c of contacts) channelMap.set(c.channel, [...(channelMap.get(c.channel) ?? []), c]);
  const personMap = new Map<string, ClientContact[]>();
  for (const c of answered) if (c.respondedById) personMap.set(c.respondedById, [...(personMap.get(c.respondedById) ?? []), c]);
  const pickedUp = new Map<string, number>();
  for (const c of contacts) for (const e of c.escalations) if (e.acknowledgedById) pickedUp.set(e.acknowledgedById, (pickedUp.get(e.acknowledgedById) ?? 0) + 1);

  return {
    totals: {
      contacts: contacts.length,
      answered: answered.length,
      resolvedWithoutReply: contacts.filter((c) => c.status === "Resolved" && !c.firstResponseAt).length,
      waitingNow: contacts.filter((c) => c.status === "Open").length,
      medianFirstResponse: median(times),
      averageFirstResponse: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      withinTargetPct: within(contacts),
      escalated: contacts.filter((c) => f.get(c.id)!.escalated).length,
      autoEscalated: contacts.filter((c) => f.get(c.id)!.autoEscalated).length,
    },
    weeks: [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, list]) => ({ week, contacts: list.length, withinTargetPct: within(list), escalated: list.filter((c) => f.get(c.id)!.escalated).length })),
    channels: [...channelMap.entries()]
      .map(([channel, list]) => ({ channel, contacts: list.length, medianFirstResponse: median(frt(list)) }))
      .sort((a, b) => b.contacts - a.contacts),
    people: [...new Set([...personMap.keys(), ...pickedUp.keys()])]
      .map((id) => {
        const list = personMap.get(id) ?? [];
        return { id, answered: list.length, medianFirstResponse: median(frt(list)), withinTargetPct: within(list), pickedUp: pickedUp.get(id) ?? 0 };
      })
      .sort((a, b) => b.answered - a.answered),
  };
}
