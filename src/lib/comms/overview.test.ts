import { describe, expect, it } from "vitest";
import { createContact, escalate, markResponded, resolve } from "./contacts";
import { buildOverview, dayKey, describeChange } from "./overview";
import { defaultSla } from "./sla";

const sla = { ...defaultSla, timeZone: "America/New_York", businessHours: { ...defaultSla.businessHours, enabled: false } };
const now = new Date("2026-10-08T17:00:00Z"); // Thu 1pm New York
const team = [
  { id: "van", name: "Van", email: "", phone: "", escalation: false },
  { id: "reid", name: "Reid", email: "", phone: "", escalation: true },
];
const make = (receivedAt: string, assigneeId = "van") =>
  createContact({ clientId: `cl_${receivedAt}`, channel: "Text", priority: "Normal", receivedAt, summary: "Hi", assigneeId }, "van", new Date(receivedAt));

describe("dayKey", () => {
  it("uses the business calendar", () => {
    expect(dayKey("2026-10-08T03:00:00Z", "America/New_York")).toBe("2026-10-07");
    expect(dayKey("2026-10-08T03:00:00Z", "UTC")).toBe("2026-10-08");
  });
});

describe("buildOverview", () => {
  const fresh = make("2026-10-08T16:30:00Z"); // 30m, on time
  const late = make("2026-10-08T10:00:00Z"); // 7h, overdue
  const unassigned = make("2026-10-08T16:50:00Z", "");
  const esc = escalate(make("2026-10-07T12:00:00Z", "reid"), "", ["reid", "van"], "", team, new Date("2026-10-07T16:00:00Z"), "sla");
  const answeredToday = markResponded(make("2026-10-08T13:00:00Z"), "van", new Date("2026-10-08T13:20:00Z"));
  const lastWeek = markResponded(make("2026-09-30T13:00:00Z"), "van", new Date("2026-09-30T14:00:00Z"));
  const resolvedToday = resolve(make("2026-10-06T13:00:00Z"), "van", new Date("2026-10-08T14:00:00Z"));
  const all = [fresh, late, unassigned, esc, answeredToday, lastWeek, resolvedToday];

  it("splits mine from the team", () => {
    const o = buildOverview(all, sla, now, "van");
    expect(o.mine).toEqual({ waiting: 2, overdue: 1, escalatedToMe: 1 });
    expect(o.team).toMatchObject({ waiting: 4, unassigned: 1, awaitingPickup: 1 });
    expect(o.team.overdue).toBe(2); // late + escalated one
  });

  it("puts escalations, then overdue, then longest wait at the top of the list", () => {
    const o = buildOverview(all, sla, now, "van");
    expect(o.attention.map((a) => a.contactId)).toEqual([esc.id, late.id, fresh.id, unassigned.id]);
    expect(o.attention[0]).toMatchObject({ escalated: true, overdue: true });
  });

  it("counts today and compares the week with the one before", () => {
    const o = buildOverview(all, sla, now, "van");
    expect(o.today).toEqual({ newContacts: 4, answered: 1, resolved: 1 });
    expect(o.week.contacts).toEqual({ current: 6, previous: 1 });
    expect(o.week.medianFirstResponse).toEqual({ current: 20, previous: 60 });
    expect(o.trend).toHaveLength(14);
    expect(o.trend.at(-1)).toEqual({ day: "2026-10-08", contacts: 4 });
  });

  it("lists workload by person, overdue first", () => {
    const o = buildOverview(all, sla, now, "van");
    expect(o.workload).toEqual([
      { memberId: "van", open: 2, overdue: 1 },
      { memberId: "reid", open: 1, overdue: 1 },
    ]);
  });
});

describe("describeChange", () => {
  it("says it in words", () => {
    expect(describeChange({ current: 20, previous: 60 }, "minutes")).toEqual({ text: "67% faster than last week", good: true });
    expect(describeChange({ current: 90, previous: 60 }, "minutes")).toEqual({ text: "50% slower than last week", good: false });
    expect(describeChange({ current: 80, previous: 70 }, "percent")).toEqual({ text: "Up 10 points on last week", good: true });
    expect(describeChange({ current: 5, previous: 8 }, "count")).toEqual({ text: "3 fewer than last week", good: null });
    expect(describeChange({ current: 5, previous: null }, "count").text).toBe("No comparison yet");
  });
});
