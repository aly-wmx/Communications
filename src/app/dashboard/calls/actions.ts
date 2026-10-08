"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { createContact } from "@/lib/comms/contacts";
import { serviceDb } from "@/lib/comms/ghl-store";
import { slaFromJson } from "@/lib/comms/rows";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { logCallSchema } from "@/lib/validation/calls";

const STATUS = { connected: "completed", missed: "no-answer", voicemail: "voicemail", failed: "failed" } as const;

/**
 * Log a call that happened outside GoHighLevel (e.g. from a personal phone).
 * It joins the client's thread and the call log; a missed call or voicemail
 * from the client also opens a queue item so someone calls back.
 */
export async function logCall(input: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = logCallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;

  const when = v.occurredAt ? new Date(v.occurredAt) : new Date();
  if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 60_000) return { ok: false, error: "Check the call time." };

  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, owner_id").eq("id", v.clientId).maybeSingle();
  if (!client) return { ok: false, error: "That client no longer exists." };

  const channel = v.outcome === "voicemail" ? "Voicemail" : v.outcome === "missed" && v.direction === "inbound" ? "Missed call" : "Call";
  const label = v.outcome === "voicemail" ? "Voicemail" : `${v.direction === "inbound" ? "Incoming" : "Outgoing"} call · ${STATUS[v.outcome].replace("-", " ")}`;
  const seconds = Math.round(v.durationMinutes * 60);

  // Thread entries are written by the server only.
  const { error } = await serviceDb()
    .from("messages")
    .insert({
      id: `manual_${randomUUID()}`,
      client_id: client.id,
      direction: v.direction,
      channel,
      body: v.note ? `${label} — ${v.note}` : label,
      status: STATUS[v.outcome],
      call_status: STATUS[v.outcome],
      duration_seconds: seconds || null,
      sent_by_user: v.direction === "outbound",
      source: `portal:${me.name}`,
      occurred_at: when.toISOString(),
    });
  if (error) return { ok: false, error: "Couldn't log the call." };

  // A client we missed needs a call back: put it in the queue.
  if (v.direction === "inbound" && (v.outcome === "missed" || v.outcome === "voicemail")) {
    const { data: settings } = await supabase.from("settings").select("sla").eq("id", 1).maybeSingle();
    const c = createContact(
      {
        clientId: client.id,
        channel: channel as "Missed call" | "Voicemail",
        priority: "Normal",
        receivedAt: when.toISOString(),
        summary: v.note,
        assigneeId: client.owner_id || slaFromJson(settings?.sla).defaultAssigneeId,
      },
      me.memberId,
      new Date(),
    );
    await supabase.from("contacts").insert({
      id: c.id,
      client_id: c.clientId,
      channel: c.channel,
      priority: c.priority,
      received_at: c.receivedAt,
      summary: c.summary,
      assignee_id: c.assigneeId || null,
      status: c.status,
      history: c.history as unknown as Json,
      source: "manual",
    });
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
