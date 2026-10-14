import type { ContactEvent } from "./types";
import { departmentStages, type Department } from "@/lib/stages";

/** The parts of a contacts row a realtime event carries that matter for alerting. */
export interface AlertRow {
  id: string;
  client_id: string;
  channel: string;
  priority: string;
  status: string;
  source: string;
  summary: string;
  history: unknown;
  assignee_id?: string | null;
}

export interface IncomingAlert {
  /** Stable per message, so the same event never alerts twice. */
  key: string;
  contactId: string;
  clientId: string;
  urgent: boolean;
  /** Who it's assigned to ("" when nobody). */
  assigneeId: string;
  /** e.g. "New text" / "Another text" / "Van logged a call". */
  headline: string;
  body: string;
}

const FRESH_MS = 5 * 60_000;

/**
 * Decide whether a realtime insert/update on `contacts` is something new from a client
 * that this person should hear about. Realtime UPDATE events don't include the old row,
 * so this reads the newest history entry instead of diffing.
 *
 * Alerts for: a new contact (from GHL, or logged by someone else), and a further
 * message appended to a waiting contact by GHL. Never for your own actions, replies,
 * assignments or status changes.
 */
export function incomingAlert(
  event: "INSERT" | "UPDATE",
  row: AlertRow,
  meId: string,
  teamNames: Record<string, string>,
  now = new Date(),
): IncomingAlert | null {
  const history = Array.isArray(row.history) ? (row.history as ContactEvent[]) : [];
  const last = history.at(-1);
  if (!last) return null;
  if (now.getTime() - new Date(last.at).getTime() > FRESH_MS) return null;

  const channel = row.channel.toLowerCase();
  const base = {
    key: `${row.id}:${last.at}`,
    contactId: row.id,
    clientId: row.client_id,
    urgent: row.priority === "Urgent",
    assigneeId: row.assignee_id ?? "",
  };

  if (event === "INSERT") {
    if (row.source === "ghl" || last.byId === "") {
      return { ...base, headline: `New ${channel}`, body: row.summary };
    }
    if (last.byId === meId) return null;
    const who = teamNames[last.byId] ?? "A teammate";
    return { ...base, headline: `${who} logged a ${channel}`, body: row.summary };
  }

  // UPDATE: only a system (GHL) entry that adds another client message, on a contact still waiting on us.
  if (last.byId !== "" || row.status !== "Open") return null;
  if (!last.message.includes("via GoHighLevel")) return null;
  const quoted = /“(.*)”/.exec(last.message)?.[1] ?? "";
  return { ...base, headline: "Another message", body: quoted || row.summary };
}

/**
 * Whether an alert pops up and chimes for this person, or only updates the counts
 * quietly. Loud: anything urgent, anything assigned to them, and unassigned items
 * in the business they're looking at and in their department (everything, if they
 * have none). Someone else's items and other businesses stay quiet.
 */
export function alertIsForMe(
  alert: { urgent: boolean; assigneeId: string },
  client: { businessId: string; stage: string | null },
  me: { id: string; department: Department | null; currentBusinessId: string },
): boolean {
  if (alert.urgent || alert.assigneeId === me.id) return true;
  if (alert.assigneeId) return false;
  if (client.businessId !== me.currentBusinessId) return false;
  if (!me.department) return true;
  // Clients without a stage are usually new, so Sales hears about them.
  if (!client.stage) return me.department === "sales";
  return (departmentStages(me.department) as readonly string[]).includes(client.stage);
}
