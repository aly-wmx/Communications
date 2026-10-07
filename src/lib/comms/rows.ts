import type { Database } from "@/lib/supabase/database.types";
import { defaultSla } from "./sla";
import type { ClientContact, ContactEvent, Escalation, SlaSettings } from "./types";

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];

/** Postgres returns "…+00:00"; the queue logic compares ISO strings, so normalise to toISOString(). */
const iso = (v: string | null | undefined): string => (v ? new Date(v).toISOString() : "");

export function contactFromRow(r: ContactRow): ClientContact {
  return {
    id: r.id,
    clientId: r.client_id,
    channel: r.channel as ClientContact["channel"],
    priority: r.priority as ClientContact["priority"],
    receivedAt: iso(r.received_at),
    summary: r.summary,
    assigneeId: r.assignee_id ?? "",
    status: r.status as ClientContact["status"],
    firstResponseAt: iso(r.first_response_at),
    respondedById: r.responded_by_id,
    resolvedAt: iso(r.resolved_at),
    remindedAt: iso(r.reminded_at),
    escalations: (r.escalations as unknown as Escalation[]) ?? [],
    history: (r.history as unknown as ContactEvent[]) ?? [],
    source: r.source as ClientContact["source"],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** Settings row → SLA, filling anything missing from the defaults. */
export function slaFromJson(json: unknown): SlaSettings {
  const s = (json && typeof json === "object" ? json : {}) as Partial<SlaSettings>;
  return {
    ...defaultSla,
    ...s,
    businessHours: { ...defaultSla.businessHours, ...(s.businessHours ?? {}) },
    timeZone: typeof s.timeZone === "string" ? s.timeZone : "",
  };
}

/** The columns a queue action can change, ready for an UPDATE. */
export function contactPatch(c: ClientContact): Database["public"]["Tables"]["contacts"]["Update"] {
  return {
    assignee_id: c.assigneeId || null,
    status: c.status,
    first_response_at: c.firstResponseAt || null,
    responded_by_id: c.respondedById,
    resolved_at: c.resolvedAt || null,
    reminded_at: c.remindedAt || null,
    escalations: c.escalations as unknown as Database["public"]["Tables"]["contacts"]["Update"]["escalations"],
    history: c.history as unknown as Database["public"]["Tables"]["contacts"]["Update"]["history"],
    updated_at: c.updatedAt,
  };
}
