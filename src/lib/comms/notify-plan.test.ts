import { describe, expect, it } from "vitest";
import { acknowledge, awaitingPickup, createContact, escalate, reminderDue } from "./contacts";
import { planEscalation, planNewMessage, planPickedUp, planReminder, responsible, type PlanContext, type PlanMember } from "./notify-plan";
import { defaultSla } from "./sla";

const team: PlanMember[] = [
  { id: "aly", name: "Aly", role: "admin", escalation: false },
  { id: "reid", name: "Reid", role: "manager", escalation: true },
  { id: "chris", name: "Chris", role: "manager", escalation: true },
  { id: "van", name: "Van", role: "coordinator", escalation: false },
];
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  clientName: "Hernandez family",
  channel: "Text",
  summary: "Is the delivery still Thursday?",
  waitedMinutes: 250,
  urgent: false,
  assigneeId: "van",
  defaultAssigneeId: "",
  ...over,
});

describe("who is responsible", () => {
  it("is the assignee, then the default assignee, then the coordinators", () => {
    expect(responsible(ctx(), team)).toEqual(["van"]);
    expect(responsible(ctx({ assigneeId: "", defaultAssigneeId: "aly" }), team)).toEqual(["aly"]);
    expect(responsible(ctx({ assigneeId: "", defaultAssigneeId: "" }), team)).toEqual(["van"]);
    expect(responsible(ctx({ assigneeId: "gone" }), team)).toEqual(["van"]);
  });
});

describe("planners", () => {
  it("new messages and reminders go to whoever is responsible", () => {
    expect(planNewMessage(ctx(), team)).toEqual([
      expect.objectContaining({ recipientId: "van", kind: "new_message", title: "New text from Hernandez family" }),
    ]);
    expect(planReminder(ctx({ waitedMinutes: 65 }), team)[0]).toMatchObject({ recipientId: "van", title: "Hernandez family has waited 1h 5m" });
  });

  it("automatic escalations go to the managers and the assignee", () => {
    const n = planEscalation(ctx(), team, { raisedById: "", automatic: true });
    expect(n.map((x) => x.recipientId).sort()).toEqual(["chris", "reid", "van"]);
    expect(n[0].body).toContain("No reply after 4h 10m.");
    expect(n.every((x) => x.urgent)).toBe(true);
  });

  it("manual escalations skip the person who raised them and include the note", () => {
    const n = planEscalation(ctx(), team, { raisedById: "van", automatic: false, note: "Client upset" });
    expect(n.map((x) => x.recipientId).sort()).toEqual(["chris", "reid"]);
    expect(n[0].body).toContain("Van escalated it: Client upset");
  });

  it("picked-up tells the others to stand down", () => {
    const n = planPickedUp(ctx(), team, { byId: "reid", notifiedIds: ["reid", "chris", "van"] });
    expect(n.map((x) => x.recipientId).sort()).toEqual(["chris", "van"]);
    expect(n[0].title).toBe("Reid picked up Hernandez family");
  });
});

describe("contact rules", () => {
  const base = () =>
    createContact(
      { clientId: "cl", channel: "Text", priority: "Normal", receivedAt: "2026-10-05T13:00:00.000Z", summary: "", assigneeId: "van" },
      "van",
      new Date("2026-10-05T13:00:00.000Z"),
    );
  const sla = { ...defaultSla, timeZone: "America/New_York" }; // 13:00 UTC = 9am New York

  it("reminds once at the reminder threshold", () => {
    const c = base();
    expect(reminderDue(c, sla, new Date("2026-10-05T13:30:00Z"))).toBe(false);
    expect(reminderDue(c, sla, new Date("2026-10-05T14:05:00Z"))).toBe(true);
    expect(reminderDue({ ...c, remindedAt: "2026-10-05T14:01:00.000Z" }, sla, new Date("2026-10-05T14:05:00Z"))).toBe(false);
  });

  it("records who picked up an escalation", () => {
    const members = team.map((t) => ({ ...t, email: "", phone: "" }));
    const e = escalate(base(), "", ["reid", "chris"], "", members, new Date("2026-10-05T17:00:00Z"), "sla");
    expect(awaitingPickup(e)).toBe(true);
    const a = acknowledge(e, "reid", members, new Date("2026-10-05T17:05:00Z"));
    expect(a.escalations[0]).toMatchObject({ acknowledgedById: "reid", acknowledgedAt: "2026-10-05T17:05:00.000Z" });
    expect(awaitingPickup(a)).toBe(false);
    expect(a.history.at(-1)?.message).toBe("Reid picked up the escalation");
    expect(acknowledge(a, "chris", members)).toBe(a); // nothing left to pick up
  });
});
