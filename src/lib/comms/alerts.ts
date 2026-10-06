import type { ContactEvent } from "./types";

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
}

export interface IncomingAlert {
  /** Stable per message, so the same event never alerts twice. */
  key: string;
  contactId: string;
  clientId: string;
  urgent: boolean;
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
