import "server-only";
import { createClient } from "@/lib/supabase/server";
import { callOutcome, type CallOutcome } from "./channels";

/** Calls for the Call Log and its CSV export. */

export const RANGES = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" } as const;
export type Range = keyof typeof RANGES;

export interface CallRow {
  id: string;
  clientId: string;
  clientName: string;
  phone: string;
  direction: "inbound" | "outbound";
  outcome: CallOutcome;
  channel: string;
  durationSeconds: number | null;
  occurredAt: string;
  note: string;
  loggedBy: string;
}

function since(range: Range, timeZone: string): string | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "today") {
    // Midnight in the business's time zone.
    const local = new Date(now.toLocaleString("en-US", { timeZone }));
    const offset = now.getTime() - local.getTime();
    local.setHours(0, 0, 0, 0);
    return new Date(local.getTime() + offset).toISOString();
  }
  return new Date(now.getTime() - (range === "7d" ? 7 : 30) * 24 * 60 * 60_000).toISOString();
}

export async function loadCalls(businessId: string, range: Range, timeZone: string, limit = 1000): Promise<CallRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("messages")
    .select("id, client_id, direction, channel, call_status, duration_seconds, occurred_at, body, source, clients!inner(name, phone, business_id)")
    .in("channel", ["Call", "Missed call", "Voicemail"])
    .eq("clients.business_id", businessId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  const from = since(range, timeZone || "UTC");
  if (from) q = q.gte("occurred_at", from);
  const { data } = await q;

  return (data ?? []).map((m) => {
    const client = m.clients as unknown as { name: string; phone: string };
    const status = m.call_status || /·\s*([a-z -]+)/i.exec(m.body)?.[1]?.trim().replace(/ /g, "-") || "";
    const note = m.body.includes(" — ") ? m.body.split(" — ").slice(1).join(" — ") : "";
    return {
      id: m.id,
      clientId: m.client_id,
      clientName: client?.name ?? "Unknown",
      phone: client?.phone ?? "",
      direction: m.direction === "outbound" ? "outbound" : "inbound",
      outcome: callOutcome(m.direction, m.channel, status),
      channel: m.channel,
      durationSeconds: m.duration_seconds,
      occurredAt: m.occurred_at,
      note,
      loggedBy: m.source.startsWith("portal:") ? m.source.slice(7) : "",
    };
  });
}
