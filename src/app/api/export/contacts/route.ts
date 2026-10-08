import type { NextRequest } from "next/server";
import { getSessionMember } from "@/lib/auth";
import { canExport } from "@/lib/roles";
import { getBusinessContext } from "@/lib/business";
import { toCsv } from "@/lib/comms/channels";
import { loadQueue } from "@/lib/comms/load";
import { facts, rangeStart, REPORT_RANGES, type ReportRange } from "@/lib/comms/reports";
import { createClient } from "@/lib/supabase/server";

/** CSV of every client contact in the range with response times (team members only). */
export async function GET(req: NextRequest) {
  const me = await getSessionMember();
  if (!me) return new Response("Sign in first.", { status: 401 });
  if (!canExport(me.role)) return new Response("Only managers and admins can export.", { status: 403 });
  const { current } = await getBusinessContext();
  if (!current) return new Response("No business.", { status: 404 });

  const param = req.nextUrl.searchParams.get("range") ?? "30d";
  const range = (param in REPORT_RANGES ? param : "30d") as ReportRange;
  const supabase = await createClient();
  const [{ contacts, sla }, { data: clients }, { data: team }] = await Promise.all([
    loadQueue(current.id),
    supabase.from("clients").select("id, name, phone, email, stage").eq("business_id", current.id),
    supabase.from("team_members").select("id, name"),
  ]);
  const now = new Date();
  const from = rangeStart(range, now);
  const tz = sla.timeZone || "UTC";
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "short", timeStyle: "short" });
  const when = (iso: string) => (iso ? fmt.format(new Date(iso)) : "");
  const client = new Map((clients ?? []).map((c) => [c.id, c]));
  const name = (id: string) => (id ? ((team ?? []).find((t) => t.id === id)?.name ?? "") : "");

  const rows = contacts
    .filter((c) => !from || new Date(c.receivedAt) >= from)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    .map((c) => {
      const f = facts(c, sla, now);
      const cl = client.get(c.clientId);
      const resolvedReason = [...c.history].reverse().find((h) => h.message.startsWith("Resolved"))?.message.replace(/^Resolved( — )?/, "") ?? "";
      return [
        when(c.receivedAt),
        cl?.name ?? "",
        cl?.phone ?? "",
        cl?.email ?? "",
        cl?.stage ?? "",
        c.channel,
        c.priority,
        c.summary,
        name(c.assigneeId),
        c.status,
        when(c.firstResponseAt),
        name(c.respondedById),
        f.firstResponseMinutes ?? "",
        f.withinTarget == null ? "" : f.withinTarget ? "Yes" : "No",
        f.escalated ? (f.autoEscalated ? "Automatic" : "Manual") : "",
        when(c.resolvedAt),
        resolvedReason,
      ];
    });

  const csv = toCsv(
    [
      "Received",
      "Client",
      "Phone",
      "Email",
      "Stage",
      "Channel",
      "Priority",
      "Message",
      "Assigned to",
      "Status",
      "First response",
      "Responded by",
      "First response (business minutes)",
      "Within target",
      "Escalated",
      "Resolved",
      "Resolution reason",
    ],
    rows,
  );
  // Audit trail in the server logs: who downloaded client data, and how much.
  console.info(`[export] ${me.email} exported contacts (${range}, ${rows.length} rows)`);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="client-contacts-${range}-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
