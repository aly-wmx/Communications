"use server";

import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { acknowledge, escalate } from "@/lib/comms/contacts";
import { serviceDb } from "@/lib/comms/ghl-store";
import { planEscalation, planPickedUp } from "@/lib/comms/notify-plan";
import { dispatchPending, loadTeam, planContext, planTeam, saveNotifications } from "@/lib/comms/notify-store";
import { contactFromRow, contactPatch, slaFromJson } from "@/lib/comms/rows";
import { createClient } from "@/lib/supabase/server";
import { contactIdSchema, escalateSchema, prefsSchema } from "@/lib/validation/escalations";

/** Load a contact with the signed-in person's access (RLS), plus what the planners need. */
async function loadForAction(contactId: string) {
  const supabase = await createClient();
  const [{ data: row }, { data: settings }] = await Promise.all([
    supabase.from("contacts").select("*, clients(name)").eq("id", contactId).maybeSingle(),
    supabase.from("settings").select("sla").eq("id", 1).maybeSingle(),
  ]);
  if (!row) return null;
  const { clients, ...contactRow } = row as typeof row & { clients: { name: string } | null };
  return { supabase, contactRow, contact: contactFromRow(contactRow), clientName: clients?.name ?? "A client", sla: slaFromJson(settings?.sla) };
}

/** Send right away rather than waiting up to a minute for the scheduled run. */
async function deliverNow() {
  try {
    await dispatchPending(serviceDb(), 10);
  } catch (err) {
    console.error("immediate delivery failed; the scheduled run will retry", err);
  }
}

export async function escalateContact(input: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = escalateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const loaded = await loadForAction(parsed.data.contactId);
  if (!loaded) return { ok: false, error: "That contact no longer exists." };
  const { supabase, contactRow, contact, clientName, sla } = loaded;
  if (contact.status === "Resolved") return { ok: false, error: "That contact is already resolved." };

  const sb = serviceDb();
  const team = await loadTeam(sb);
  const now = new Date();
  const planned = planEscalation(planContext(contact, clientName, sla, now), planTeam(team), {
    raisedById: me.memberId,
    recipientIds: parsed.data.recipientIds,
    note: parsed.data.note,
    automatic: false,
  });
  if (!planned.length) return { ok: false, error: "Nobody to notify — tick “Escalations” for someone on the Team page." };

  const next = escalate(contact, me.memberId, planned.map((p) => p.recipientId), parsed.data.note, team, now, "manual");
  const { data: updated, error } = await supabase
    .from("contacts")
    .update(contactPatch(next))
    .eq("id", contact.id)
    .eq("updated_at", contactRow.updated_at)
    .select("id");
  if (error) return { ok: false, error: "Couldn't escalate it." };
  if (!updated?.length) return { ok: false, error: "Someone else just updated this contact — try again." };

  await saveNotifications(sb, planned, { contactId: contact.id, clientId: contact.clientId });
  await deliverNow();
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function acknowledgeEscalation(input: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = contactIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const loaded = await loadForAction(parsed.data.contactId);
  if (!loaded) return { ok: false, error: "That contact no longer exists." };
  const { supabase, contactRow, contact, clientName, sla } = loaded;

  const sb = serviceDb();
  const team = await loadTeam(sb);
  const now = new Date();
  const pending = contact.escalations.findLast((e) => !e.acknowledgedAt);
  if (!pending) return { ok: false, error: "Someone already picked this up." };

  const next = acknowledge(contact, me.memberId, team, now);
  const { data: updated } = await supabase
    .from("contacts")
    .update(contactPatch(next))
    .eq("id", contact.id)
    .eq("updated_at", contactRow.updated_at)
    .select("id");
  if (!updated?.length) return { ok: false, error: "Someone else just updated this — refresh and check who has it." };

  // Assign it to whoever picked it up, and tell the others to stand down.
  if (contact.assigneeId !== me.memberId) {
    await supabase.from("contacts").update({ assignee_id: me.memberId }).eq("id", contact.id);
  }
  const planned = planPickedUp(planContext(contact, clientName, sla, now), planTeam(team), {
    byId: me.memberId,
    notifiedIds: pending.notifiedIds,
  });
  await saveNotifications(sb, planned, { contactId: contact.id, clientId: contact.clientId });
  await sb
    .from("notifications")
    .update({ read_at: now.toISOString() })
    .eq("contact_id", contact.id)
    .eq("recipient_id", me.memberId)
    .eq("kind", "escalation")
    .is("read_at", null);
  await deliverNow();
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveMyNotificationPrefs(input: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings." };
  const supabase = await createClient();
  // RLS: people can only write their own row.
  const { error } = await supabase
    .from("notification_prefs")
    .upsert({ member_id: me.memberId, ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save your notification settings." };
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

/** Sends you a test notification through every channel you have on, so you can check Slack and email work. */
export async function sendTestNotification(): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const sb = serviceDb();
  await saveNotifications(
    sb,
    [
      {
        recipientId: me.memberId,
        kind: "mention",
        title: "Test notification from the portal",
        body: "If you can read this in Slack or your inbox, notifications are working.",
        urgent: false,
      },
    ],
    {},
  );
  await deliverNow();
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}
