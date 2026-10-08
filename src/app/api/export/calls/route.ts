import type { NextRequest } from "next/server";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { loadCalls, RANGES, type Range } from "@/lib/comms/call-log";
import { CALL_OUTCOMES, toCsv } from "@/lib/comms/channels";
import { slaFromJson } from "@/lib/comms/rows";
import { createClient } from "@/lib/supabase/server";

/** CSV download of the call log for the chosen range (team members only). */
export async function GET(req: NextRequest) {
  const me = await getSessionMember();
  if (!me) return new Response("Sign in first.", { status: 401 });
  const { current } = await getBusinessContext();
  if (!current) return new Response("No business.", { status: 404 });

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";
  const range = (rangeParam in RANGES ? rangeParam : "30d") as Range;
  const { data: settings } = await (await createClient()).from("settings").select("sla").eq("id", 1).maybeSingle();
  const tz = slaFromJson(settings?.sla).timeZone || "UTC";
  const calls = await loadCalls(current.id, range, tz, 10_000);

  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "short", timeStyle: "short" });
  const csv = toCsv(
    ["When", "Client", "Phone", "Direction", "Outcome", "Length (seconds)", "Note", "Logged by"],
    calls.map((c) => [
      fmt.format(new Date(c.occurredAt)),
      c.clientName,
      c.phone,
      c.direction === "inbound" ? "Incoming" : "Outgoing",
      CALL_OUTCOMES[c.outcome].label,
      c.durationSeconds ?? "",
      c.note,
      c.loggedBy,
    ]),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="call-log-${range}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
