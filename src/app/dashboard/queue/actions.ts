"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionMember } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { assign, markResponded, reopen, resolve } from "@/lib/comms/contacts";
import { contactFromRow, contactPatch } from "@/lib/comms/rows";
import type { TeamMember } from "@/lib/comms/types";
import { queueActionSchema } from "@/lib/validation/queue";

/** One entry point for the queue's buttons, so every change is validated and logged the same way. */
export async function queueAction(input: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };

  const parsed = queueActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const action = parsed.data;

  const supabase = await createClient();
  const { data: row, error: loadError } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", action.contactId)
    .maybeSingle();
  if (loadError || !row) return { ok: false, error: "That contact no longer exists." };

  const contact = contactFromRow(row);
  const now = new Date();
  let next = contact;

  if (action.action === "assign") {
    const { data: team } = await supabase.from("team_members").select("id, name, email, phone, escalation");
    const members = (team ?? []) as TeamMember[];
    if (action.assigneeId && !members.some((m) => m.id === action.assigneeId)) {
      return { ok: false, error: "That person isn't on the team." };
    }
    next = assign(contact, action.assigneeId, me.memberId, members, now);
  } else if (action.action === "responded") {
    next = markResponded(contact, me.memberId, now);
  } else if (action.action === "resolve") {
    if (contact.status === "Resolved") return { ok: true };
    next = resolve(contact, me.memberId, now, action.reason ?? "");
  } else {
    if (contact.status !== "Resolved") return { ok: true };
    next = reopen(contact, me.memberId, now);
  }
  if (next === contact) return { ok: true };

  // Only update if nobody else changed it since we read it, so two people can't overwrite each other's history.
  const { data: updated, error } = await supabase
    .from("contacts")
    .update(contactPatch(next))
    .eq("id", contact.id)
    .eq("updated_at", row.updated_at)
    .select("id");
  if (error?.code === "23505") return { ok: false, error: "This client already has an open item in the inbox — use that one instead." };
  if (error) return { ok: false, error: "Couldn't save that change." };
  if (!updated?.length) return { ok: false, error: "Someone else just updated this contact — refreshed, try again." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
