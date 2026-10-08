import { describe, expect, it } from "vitest";
import { createContact, escalate, markResponded, resolve } from "./contacts";
import { buildReport, median, weekStart } from "./reports";
import { defaultSla } from "./sla";

const sla = { ...defaultSla, timeZone: "America/New_York", businessHours: { ...defaultSla.businessHours, enabled: false } };
const now = new Date("2026-10-08T16:00:00Z");
const make = (receivedAt: string, channel: "Text" | "Email" | "Call" = "Text") =>
  createContact({ clientId: "cl", channel, priority: "Normal", receivedAt, summary: "", assigneeId: "van" }, "van", new Date(receivedAt));
const team = [
  { id: "van", name: "Van", email: "", phone: "", escalation: false },
  { id: "reid", name: "Reid", email: "", phone: "", escalation: true },
];

describe("helpers", () => {
  it("medians", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(3); // rounds 2.5 up
  });

  it("weeks start on Monday in the business's time zone", () => {
    expect(weekStart("2026-10-08T16:00:00Z", "America/New_York")).toBe("2026-10-05"); // Thursday
    expect(weekStart("2026-10-05T02:00:00Z", "America/New_York")).toBe("2026-09-28"); // still Sunday night in NY
    expect(weekStart("2026-10-05T02:00:00Z", "UTC")).toBe("2026-10-05");
  });
});

describe("buildReport", () => {
  const fast = markResponded(make("2026-10-07T13:00:00Z"), "van", new Date("2026-10-07T13:30:00Z")); // 30m
  const slow = markResponded(make("2026-10-06T13:00:00Z", "Email"), "reid", new Date("2026-10-06T19:00:00Z")); // 6h, late
  const waiting = make("2026-10-08T14:00:00Z");
  const noReply = resolve(make("2026-10-05T15:00:00Z", "Call"), "van", new Date("2026-10-05T16:00:00Z"), "Handled by phone");
  const esc = escalate(make("2026-10-01T13:00:00Z"), "", ["reid"], "", team, new Date("2026-10-01T17:00:00Z"), "sla");
  const picked = { ...esc, escalations: [{ ...esc.escalations[0], acknowledgedById: "reid", acknowledgedAt: "2026-10-01T17:10:00.000Z" }] };
  const old = markResponded(make("2026-08-01T13:00:00Z"), "van", new Date("2026-08-01T13:10:00Z"));
  const all = [fast, slow, waiting, noReply, picked, old];

  it("counts the headline numbers for the range", () => {
    const r = buildReport(all, sla, now, "30d");
    expect(r.totals).toMatchObject({
      contacts: 5, // "old" is outside 30 days
      answered: 2,
      resolvedWithoutReply: 1,
      waitingNow: 2, // waiting + the escalated one still open
      medianFirstResponse: 195, // 30 and 360
      averageFirstResponse: 195,
      withinTargetPct: 50,
      escalated: 1,
      autoEscalated: 1,
    });
  });

  it("breaks down by week, channel and person", () => {
    const r = buildReport(all, sla, now, "all");
    expect(r.weeks.map((w) => w.week)).toEqual(["2026-07-27", "2026-09-28", "2026-10-05"]);
    expect(r.weeks.at(-1)).toMatchObject({ contacts: 4, withinTargetPct: 50 });
    expect(r.channels[0]).toMatchObject({ channel: "Text", contacts: 4 });
    const van = r.people.find((p) => p.id === "van");
    expect(van).toMatchObject({ answered: 2, medianFirstResponse: 20, withinTargetPct: 100 });
    expect(r.people.find((p) => p.id === "reid")).toMatchObject({ answered: 1, pickedUp: 1, withinTargetPct: 0 });
  });
});
