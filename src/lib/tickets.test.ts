import { describe, expect, it } from "vitest";
import { createContact, resolve } from "@/lib/comms/contacts";
import { defaultSla } from "@/lib/comms/sla";
import { buildBoard, contactColumn, dueAtFromDate, dueState, type BoardFilters, type Ticket } from "./tickets";

const now = new Date("2026-10-15T15:00:00Z");
const allHours = { ...defaultSla, businessHours: { ...defaultSla.businessHours, enabled: false } };

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: "t1",
  businessId: "wm",
  clientId: null,
  title: "Send revised drawings",
  details: "",
  status: "todo",
  priority: "normal",
  assigneeId: "van",
  createdBy: "reid",
  dueAt: null,
  doneAt: null,
  createdAt: "2026-10-14T10:00:00Z",
  updatedAt: "2026-10-14T10:00:00Z",
  ...over,
});

const contact = (receivedAt: string, assigneeId = "") =>
  createContact({ clientId: "cl1", channel: "Text", priority: "Normal", receivedAt, summary: "When do you start?", assigneeId }, "", new Date(receivedAt));

const filters = (over: Partial<BoardFilters> = {}): BoardFilters => ({ type: "all", who: "team", clientId: "", ...over });
const board = (tickets: Ticket[], contacts = [] as ReturnType<typeof contact>[], f = filters()) =>
  buildBoard({ tickets, contacts, clientNames: { cl1: "Hendersons" }, filters: f, meId: "van", sla: allHours, now });

describe("dueState", () => {
  it("is overdue once the due time passes, due soon within a day, and nothing once done", () => {
    expect(dueState({ dueAt: "2026-10-15T14:59:00Z", status: "todo" }, now)).toBe("overdue");
    expect(dueState({ dueAt: "2026-10-16T14:00:00Z", status: "in_progress" }, now)).toBe("due_soon");
    expect(dueState({ dueAt: "2026-10-20T14:00:00Z", status: "todo" }, now)).toBeNull();
    expect(dueState({ dueAt: "2026-10-01T14:00:00Z", status: "done" }, now)).toBeNull();
    expect(dueState({ dueAt: null, status: "todo" }, now)).toBeNull();
  });
});

describe("contactColumn", () => {
  it("puts client items in the column that matches their state", () => {
    expect(contactColumn({ status: "Open", assigneeId: "" })).toBe("todo");
    expect(contactColumn({ status: "Open", assigneeId: "van" })).toBe("in_progress");
    expect(contactColumn({ status: "Waiting on client", assigneeId: "van" })).toBe("waiting");
    expect(contactColumn({ status: "Resolved", assigneeId: "van" })).toBe("done");
  });
});

describe("buildBoard", () => {
  it("shows tickets and client items together, each in its column", () => {
    const cols = board([ticket(), ticket({ id: "t2", status: "waiting" })], [contact("2026-10-15T14:00:00Z", "van")]);
    expect(cols.todo.map((c) => c.id)).toEqual(["t1"]);
    expect(cols.waiting.map((c) => c.id)).toEqual(["t2"]);
    expect(cols.in_progress).toHaveLength(1);
    expect(cols.in_progress[0]).toMatchObject({ kind: "client", clientName: "Hendersons" });
  });

  it("filters by type and by who", () => {
    const t = [ticket(), ticket({ id: "t2", assigneeId: "reid" }), ticket({ id: "t3", assigneeId: null })];
    const c = [contact("2026-10-15T14:00:00Z", "van")];
    expect(board(t, c, filters({ type: "tickets" })).in_progress).toHaveLength(0);
    expect(board(t, c, filters({ type: "client" })).todo).toHaveLength(0);
    expect(board(t, c, filters({ who: "mine" })).todo.map((x) => x.id)).toEqual(["t1"]);
    expect(board(t, c, filters({ who: "unassigned" })).todo.map((x) => x.id)).toEqual(["t3"]);
    expect(board(t, c, filters({ who: "reid" })).todo.map((x) => x.id)).toEqual(["t2"]);
  });

  it("puts overdue and urgent work at the top of a column", () => {
    const cols = board([
      ticket({ id: "later", dueAt: "2026-10-30T10:00:00Z" }),
      ticket({ id: "overdue", dueAt: "2026-10-15T10:00:00Z" }),
      ticket({ id: "urgent", priority: "urgent" }),
    ]);
    expect(cols.todo.map((c) => c.id)).toEqual(["overdue", "urgent", "later"]);
    expect(cols.todo[0]).toMatchObject({ due: "overdue" });
  });

  it("keeps a week of Done, newest first", () => {
    const cols = board(
      [
        ticket({ id: "old", status: "done", doneAt: "2026-10-01T10:00:00Z" }),
        ticket({ id: "mon", status: "done", doneAt: "2026-10-12T10:00:00Z" }),
        ticket({ id: "wed", status: "done", doneAt: "2026-10-14T10:00:00Z" }),
      ],
      [resolve(contact("2026-10-10T10:00:00Z", "van"), "van", new Date("2026-10-13T10:00:00Z"))],
    );
    expect(cols.done.map((c) => c.id)).toEqual(["wed", expect.any(String), "mon"]);
  });
});

describe("dueAtFromDate", () => {
  it("means close of business that day, in the business's time zone", () => {
    const ny = { timeZone: "America/New_York", businessHours: { ...defaultSla.businessHours, end: "17:00" } };
    expect(dueAtFromDate("2026-10-16", ny)).toBe("2026-10-16T21:00:00.000Z");
    expect(dueAtFromDate("", ny)).toBeNull();
    expect(dueAtFromDate("16/10/2026", ny)).toBeNull();
  });
});
