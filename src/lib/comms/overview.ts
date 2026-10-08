import { awaitingPickup } from "./contacts";
import { median } from "./reports";
import { needsEscalation, slaState } from "./sla";
import type { ClientContact, SlaSettings } from "./types";

/** Numbers for the Overview: what needs me, team health vs last week, today, workload and a 14-day trend. Pure and tested. */

const DAY = 24 * 60 * 60_000;

/** YYYY-MM-DD of an instant on the business's calendar. */
export function dayKey(iso: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(
    typeof iso === "string" ? new Date(iso) : iso,
  );
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export interface Comparison {
  current: number | null;
  previous: number | null;
}

export interface OverviewData {
  mine: { waiting: number; overdue: number; escalatedToMe: number };
  team: { waiting: number; overdue: number; needsEscalation: number; awaitingPickup: number; unassigned: number };
  week: { contacts: Comparison; medianFirstResponse: Comparison; withinTargetPct: Comparison };
  today: { newContacts: number; answered: number; resolved: number };
  attention: Array<{ contactId: string; clientId: string; waitedMinutes: number; overdue: boolean; escalated: boolean; urgent: boolean; assigneeId: string; channel: string; summary: string }>;
  workload: Array<{ memberId: string; open: number; overdue: number }>;
  trend: Array<{ day: string; contacts: number }>;
}

export function buildOverview(contacts: ClientContact[], sla: SlaSettings, now: Date, meId: string): OverviewData {
  const tz = sla.timeZone || "UTC";
  const open = contacts.filter((c) => c.status === "Open");
  const unresolved = contacts.filter((c) => c.status !== "Resolved");
  const overdue = (c: ClientContact) => slaState(c, sla, now).stage === "breach";

  const inWindow = (c: ClientContact, fromDaysAgo: number, toDaysAgo: number) => {
    const t = new Date(c.receivedAt).getTime();
    return t >= now.getTime() - fromDaysAgo * DAY && t < now.getTime() - toDaysAgo * DAY;
  };
  const weekStats = (list: ClientContact[]) => {
    const answered = list.filter((c) => c.firstResponseAt);
    const times = answered.map((c) => slaState(c, sla, now).waitedMinutes);
    const onTime = answered.filter((c) => {
      const st = slaState(c, sla, now);
      return st.waitedMinutes < Math.max(1, st.escalateAfter);
    }).length;
    return {
      contacts: list.length,
      median: median(times),
      within: answered.length ? Math.round((onTime / answered.length) * 100) : null,
    };
  };
  const thisWeek = weekStats(contacts.filter((c) => inWindow(c, 7, 0)));
  const lastWeek = weekStats(contacts.filter((c) => inWindow(c, 14, 7)));

  const todayKey = dayKey(now, tz);
  const isToday = (iso: string) => Boolean(iso) && dayKey(iso, tz) === todayKey;

  const workload = new Map<string, { open: number; overdue: number }>();
  for (const c of open) {
    if (!c.assigneeId) continue;
    const w = workload.get(c.assigneeId) ?? { open: 0, overdue: 0 };
    w.open++;
    if (overdue(c)) w.overdue++;
    workload.set(c.assigneeId, w);
  }

  const trend: OverviewData["trend"] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(new Date(now.getTime() - i * DAY), tz);
    trend.push({ day: key, contacts: contacts.filter((c) => dayKey(c.receivedAt, tz) === key).length });
  }

  const attention = unresolved
    .filter((c) => c.status === "Open" || awaitingPickup(c))
    .map((c) => {
      const st = slaState(c, sla, now);
      return {
        contactId: c.id,
        clientId: c.clientId,
        waitedMinutes: st.waitedMinutes,
        overdue: st.stage === "breach",
        escalated: awaitingPickup(c),
        urgent: c.priority === "Urgent",
        assigneeId: c.assigneeId,
        channel: c.channel,
        summary: c.summary,
      };
    })
    // Escalations nobody has picked up first, then overdue, then longest wait.
    .sort((a, b) => Number(b.escalated) - Number(a.escalated) || Number(b.overdue) - Number(a.overdue) || b.waitedMinutes - a.waitedMinutes)
    .slice(0, 5);

  return {
    mine: {
      waiting: open.filter((c) => c.assigneeId === meId).length,
      overdue: open.filter((c) => c.assigneeId === meId && overdue(c)).length,
      escalatedToMe: unresolved.filter((c) => awaitingPickup(c) && c.escalations.at(-1)?.notifiedIds.includes(meId)).length,
    },
    team: {
      waiting: open.length,
      overdue: open.filter(overdue).length,
      needsEscalation: open.filter((c) => needsEscalation(c, sla, now)).length,
      awaitingPickup: unresolved.filter(awaitingPickup).length,
      unassigned: open.filter((c) => !c.assigneeId).length,
    },
    week: {
      contacts: { current: thisWeek.contacts, previous: lastWeek.contacts },
      medianFirstResponse: { current: thisWeek.median, previous: lastWeek.median },
      withinTargetPct: { current: thisWeek.within, previous: lastWeek.within },
    },
    today: {
      newContacts: contacts.filter((c) => isToday(c.receivedAt)).length,
      answered: contacts.filter((c) => isToday(c.firstResponseAt)).length,
      resolved: contacts.filter((c) => isToday(c.resolvedAt)).length,
    },
    attention,
    workload: [...workload.entries()].map(([memberId, w]) => ({ memberId, ...w })).sort((a, b) => b.overdue - a.overdue || b.open - a.open),
    trend,
  };
}

/** "18% faster than last week" / "5 more than last week" — words, not just a colour. */
export function describeChange(c: Comparison, kind: "count" | "minutes" | "percent"): { text: string; good: boolean | null } {
  if (c.current == null || c.previous == null) return { text: "No comparison yet", good: null };
  if (c.current === c.previous) return { text: "Same as last week", good: null };
  if (kind === "minutes") {
    if (c.previous === 0) return { text: "Slower than last week", good: false };
    const pct = Math.round((Math.abs(c.current - c.previous) / c.previous) * 100);
    return c.current < c.previous ? { text: `${pct}% faster than last week`, good: true } : { text: `${pct}% slower than last week`, good: false };
  }
  if (kind === "percent") {
    const pts = Math.abs(c.current - c.previous);
    return c.current > c.previous ? { text: `Up ${pts} points on last week`, good: true } : { text: `Down ${pts} points on last week`, good: false };
  }
  const diff = Math.abs(c.current - c.previous);
  return { text: `${diff} ${c.current > c.previous ? "more" : "fewer"} than last week`, good: null };
}
