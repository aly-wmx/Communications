import { awaitingPickup } from "@/lib/comms/contacts";
import { formatMinutes, needsEscalation, slaState, zonedTime } from "@/lib/comms/sla";
import type { ClientContact, SlaSettings } from "@/lib/comms/types";

/**
 * The Board: tickets (team work) and client conversation items in the same four
 * columns. Pure, so the column rules and due dates are tested.
 */

export const COLUMNS = ["todo", "in_progress", "waiting", "done"] as const;
export type Column = (typeof COLUMNS)[number];
export type TicketStatus = Column;

export const COLUMN_LABELS: Record<Column, string> = {
  todo: "To do",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
};

export const PRIORITIES = ["normal", "high", "urgent"] as const;
export type TicketPriority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<TicketPriority, string> = { normal: "Normal", high: "High", urgent: "Urgent" };

export const isColumn = (v: unknown): v is Column => typeof v === "string" && (COLUMNS as readonly string[]).includes(v);
export const isPriority = (v: unknown): v is TicketPriority => typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);

export interface Ticket {
  id: string;
  businessId: string;
  clientId: string | null;
  title: string;
  details: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId: string | null;
  createdBy: string | null;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketRow {
  id: string;
  business_id: string;
  client_id: string | null;
  title: string;
  details: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  created_by: string | null;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export function ticketFromRow(r: TicketRow): Ticket {
  return {
    id: r.id,
    businessId: r.business_id,
    clientId: r.client_id,
    title: r.title,
    details: r.details,
    status: isColumn(r.status) ? r.status : "todo",
    priority: isPriority(r.priority) ? r.priority : "normal",
    assigneeId: r.assignee_id,
    createdBy: r.created_by,
    dueAt: r.due_at,
    doneAt: r.done_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** A ticket due within this long counts as due soon (and its assignee gets one reminder). */
export const DUE_SOON_MS = 24 * 60 * 60_000;

/** Worked out from due_at whenever it's read; never stored. */
export function dueState(t: Pick<Ticket, "dueAt" | "status">, now: Date): "overdue" | "due_soon" | null {
  if (!t.dueAt || t.status === "done") return null;
  const due = new Date(t.dueAt).getTime();
  if (Number.isNaN(due)) return null;
  if (due <= now.getTime()) return "overdue";
  return due - now.getTime() <= DUE_SOON_MS ? "due_soon" : null;
}

/**
 * Where a client conversation item sits on the Board. Client items have no
 * "in progress" status of their own: open and assigned counts as in progress.
 */
export function contactColumn(c: Pick<ClientContact, "status" | "assigneeId">): Column {
  if (c.status === "Resolved") return "done";
  if (c.status === "Waiting on client") return "waiting";
  return c.assigneeId ? "in_progress" : "todo";
}

export type BoardCard =
  | {
      kind: "ticket";
      id: string;
      column: Column;
      title: string;
      clientId: string | null;
      clientName: string;
      assigneeId: string | null;
      priority: TicketPriority;
      dueAt: string | null;
      due: "overdue" | "due_soon" | null;
      sortKey: string;
    }
  | {
      kind: "client";
      id: string;
      column: Column;
      title: string;
      clientId: string;
      clientName: string;
      assigneeId: string | null;
      channel: string;
      urgent: boolean;
      escalated: boolean;
      overdue: boolean;
      waitedLabel: string;
      sortKey: string;
    };

export type TypeFilter = "all" | "tickets" | "client";
export interface BoardFilters {
  type: TypeFilter;
  /** "mine", "team" (everyone), "unassigned", or a team member id. */
  who: string;
  clientId: string;
}

/** Done cards stay on the Board this long, so a finished week is still visible. */
export const DONE_DAYS = 7;

function whoMatches(assigneeId: string | null, who: string, meId: string): boolean {
  if (who === "team") return true;
  if (who === "mine") return assigneeId === meId;
  if (who === "unassigned") return !assigneeId;
  return assigneeId === who;
}

const PRIORITY_RANK: Record<TicketPriority, number> = { urgent: 0, high: 1, normal: 2 };

/**
 * The four columns for these filters. Within a column, what needs attention comes
 * first: overdue or urgent, then the soonest due or longest waiting, then newest.
 */
export function buildBoard(input: {
  tickets: Ticket[];
  contacts: ClientContact[];
  clientNames: Record<string, string>;
  filters: BoardFilters;
  meId: string;
  sla: SlaSettings;
  now: Date;
}): Record<Column, BoardCard[]> {
  const { tickets, contacts, clientNames, filters, meId, sla, now } = input;
  const doneSince = now.getTime() - DONE_DAYS * 24 * 60 * 60_000;
  const columns: Record<Column, BoardCard[]> = { todo: [], in_progress: [], waiting: [], done: [] };

  if (filters.type !== "client") {
    for (const t of tickets) {
      if (t.status === "done" && (!t.doneAt || new Date(t.doneAt).getTime() < doneSince)) continue;
      if (!whoMatches(t.assigneeId, filters.who, meId)) continue;
      if (filters.clientId && t.clientId !== filters.clientId) continue;
      const due = dueState(t, now);
      // Already late beats urgent-but-not-yet-due.
      const rank = due === "overdue" ? 0 : t.priority === "urgent" ? 1 : 2;
      columns[t.status].push({
        kind: "ticket",
        id: t.id,
        column: t.status,
        title: t.title,
        clientId: t.clientId,
        clientName: t.clientId ? (clientNames[t.clientId] ?? "") : "",
        assigneeId: t.assigneeId,
        priority: t.priority,
        dueAt: t.dueAt,
        due,
        sortKey: t.status === "done" ? invert(t.doneAt ?? t.updatedAt) : `${rank}|${PRIORITY_RANK[t.priority]}|${t.dueAt ?? "9999"}|${invert(t.createdAt)}`,
      });
    }
  }

  if (filters.type !== "tickets") {
    for (const c of contacts) {
      if (c.status === "Resolved" && (!c.resolvedAt || new Date(c.resolvedAt).getTime() < doneSince)) continue;
      if (!whoMatches(c.assigneeId || null, filters.who, meId)) continue;
      if (filters.clientId && c.clientId !== filters.clientId) continue;
      const column = contactColumn(c);
      const state = c.status === "Open" ? slaState(c, sla, now) : null;
      const overdue = c.status === "Open" && (needsEscalation(c, sla, now) || state?.stage === "breach");
      const urgent = c.priority === "Urgent";
      columns[column].push({
        kind: "client",
        id: c.id,
        column,
        title: c.summary || `${c.channel} from the client`,
        clientId: c.clientId,
        clientName: clientNames[c.clientId] ?? "A client",
        assigneeId: c.assigneeId || null,
        channel: c.channel,
        urgent,
        escalated: awaitingPickup(c),
        overdue,
        waitedLabel: state ? formatMinutes(state.waitedMinutes) : "",
        sortKey: column === "done" ? invert(c.resolvedAt || c.updatedAt) : `${overdue ? 0 : urgent ? 1 : 2}|1|${c.receivedAt}|${invert(c.receivedAt)}`,
      });
    }
  }

  // Done is keyed on when it finished (newest first); the others on what needs attention.
  for (const col of COLUMNS) columns[col].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return columns;
}

/** Newer timestamps sort first inside an ascending key. */
const invert = (iso: string) => String(9_999_999_999_999 - new Date(iso).getTime()).padStart(13, "0");

/**
 * A due *date* from the form ("2026-10-16") as a moment: close of business that
 * day in the business's time zone (17:00 if business hours aren't set).
 */
export function dueAtFromDate(date: string, sla: Pick<SlaSettings, "timeZone" | "businessHours">): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [h, min] = (sla.businessHours.end || "17:00").split(":").map(Number);
  return new Date(zonedTime(Number(m[1]), Number(m[2]), Number(m[3]), h || 17, min || 0, sla.timeZone || "UTC")).toISOString();
}
