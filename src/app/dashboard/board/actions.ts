"use server";

import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { canAssignTickets } from "@/lib/roles";
import { findMentions } from "@/lib/comms/mentions";
import { memberIdsWithAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { formatStamp } from "@/lib/format-time";
import { slaFromJson } from "@/lib/comms/rows";
import { notifyNow } from "@/lib/comms/notify-now";
import { planAssigned, planTicketDone, planTicketMentions, type PlanMember } from "@/lib/comms/notify-plan";
import { COLUMN_LABELS, PRIORITY_LABELS, dueAtFromDate, ticketFromRow, type Ticket } from "@/lib/tickets";
import { newTicketSchema, ticketCommentSchema, ticketUpdateSchema } from "@/lib/validation/tickets";
import type { Database } from "@/lib/supabase/database.types";

type TicketPatch = Database["public"]["Tables"]["tickets"]["Update"];

/**
 * Tickets on the Board. Every write goes through the signed-in person's own
 * database access, so the tickets policies and the tickets_guard_update trigger
 * (only managers and admins assign others) apply even if a check here is missed.
 */

export type TicketResult = { ok: true; id: string } | { ok: false; error: string };
type Result = { ok: true } | { ok: false; error: string };

const NO_ACCESS = "That person doesn't have access to this business. An admin can give it on the Team page.";
const NOT_ALLOWED_TO_ASSIGN = "Only a manager or admin can assign a ticket to someone else. You can take it yourself.";

async function context() {
  const supabase = await createClient();
  const [{ data: team }, { data: settings }] = await Promise.all([
    supabase.from("team_members").select("id, name, role, escalation"),
    supabase.from("settings").select("sla").eq("id", 1).maybeSingle(),
  ]);
  return { supabase, team: (team ?? []) as PlanMember[], sla: slaFromJson(settings?.sla) };
}

/** Coordinators can only take a ticket (or let go of their own); managers and admins assign anyone. */
function mayAssign(role: string, meId: string, from: string | null, to: string | null): boolean {
  if (from === to || canAssignTickets(role as never)) return true;
  return to === meId || (to === null && from === meId);
}

async function log(supabase: Awaited<ReturnType<typeof createClient>>, ticketId: string, authorId: string, kind: string, body: string) {
  const { error } = await supabase.from("ticket_events").insert({ ticket_id: ticketId, author_id: authorId, kind, body });
  if (error) console.error("ticket saved, but its history entry wasn't", ticketId, kind, error);
}

export async function createTicket(input: unknown): Promise<TicketResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = newTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;
  const { current } = await getBusinessContext();
  if (!current) return { ok: false, error: "Add a business first." };

  const assigneeId = v.assigneeId || null;
  if (!mayAssign(me.role, me.memberId, null, assigneeId)) return { ok: false, error: NOT_ALLOWED_TO_ASSIGN };

  const { supabase, team, sla } = await context();
  if (assigneeId && !team.some((t) => t.id === assigneeId)) return { ok: false, error: "That person isn't on the team." };
  if (assigneeId && !(await memberIdsWithAccess(supabase, current.id)).has(assigneeId)) return { ok: false, error: NO_ACCESS };
  if (v.clientId) {
    const { data: client } = await supabase.from("clients").select("business_id").eq("id", v.clientId).maybeSingle();
    if (!client || client.business_id !== current.id) return { ok: false, error: "That client isn't in this business." };
  }

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      business_id: current.id,
      client_id: v.clientId || null,
      title: v.title,
      details: v.details,
      priority: v.priority,
      assignee_id: assigneeId,
      created_by: me.memberId,
      due_at: v.dueDate ? dueAtFromDate(v.dueDate, sla) : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("create ticket failed", error);
    return { ok: false, error: error?.code === "42501" ? NOT_ALLOWED_TO_ASSIGN : "Couldn't create the ticket." };
  }

  await log(supabase, data.id, me.memberId, "created", "Created the ticket");
  await notifyNow(
    planAssigned(team, { assigneeId, byId: me.memberId, what: { kind: "ticket", title: v.title }, body: v.details, urgent: v.priority === "urgent" }),
    { ticketId: data.id, clientId: v.clientId || undefined },
  );
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: data.id };
}

export async function updateTicket(input: unknown): Promise<Result> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = ticketUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change." };
  const change = parsed.data;

  const { supabase, team, sla } = await context();
  const { data: row } = await supabase.from("tickets").select("*").eq("id", change.id).maybeSingle();
  if (!row) return { ok: false, error: "That ticket no longer exists." };
  const before: Ticket = ticketFromRow(row);
  const nameOf = (id: string | null) => team.find((t) => t.id === id)?.name ?? "nobody";

  let patch: TicketPatch;
  let history: [kind: string, body: string];
  switch (change.field) {
    case "status": {
      if (change.value === before.status) return { ok: true };
      patch = { status: change.value, done_at: change.value === "done" ? new Date().toISOString() : null };
      history = ["status", `Moved to ${COLUMN_LABELS[change.value]}`];
      break;
    }
    case "assignee": {
      const to = change.value || null;
      if (to === before.assigneeId) return { ok: true };
      if (!mayAssign(me.role, me.memberId, before.assigneeId, to)) return { ok: false, error: NOT_ALLOWED_TO_ASSIGN };
      if (to && !team.some((t) => t.id === to)) return { ok: false, error: "That person isn't on the team." };
      if (to && !(await memberIdsWithAccess(supabase, before.businessId)).has(to)) return { ok: false, error: NO_ACCESS };
      patch = { assignee_id: to };
      history = ["assigned", to ? `Assigned to ${nameOf(to)}` : "Unassigned"];
      break;
    }
    case "priority": {
      if (change.value === before.priority) return { ok: true };
      patch = { priority: change.value };
      history = ["priority", `Priority: ${PRIORITY_LABELS[change.value]}`];
      break;
    }
    case "due": {
      const dueAt = change.value ? dueAtFromDate(change.value, sla) : null;
      if (dueAt === before.dueAt) return { ok: true };
      // A new due date earns a fresh reminder.
      patch = { due_at: dueAt, due_soon_notified_at: null, overdue_notified_at: null };
      history = ["due", dueAt ? `Due ${formatStamp(dueAt, sla.timeZone || "UTC", "date")}` : "Removed the due date"];
      break;
    }
    case "title":
    case "details": {
      if (change.value === before[change.field]) return { ok: true };
      patch = change.field === "title" ? { title: change.value } : { details: change.value };
      history = ["edited", change.field === "title" ? "Renamed the ticket" : "Edited the details"];
      break;
    }
    case "client": {
      const clientId = change.value || null;
      if (clientId === before.clientId) return { ok: true };
      if (clientId) {
        const { data: client } = await supabase.from("clients").select("business_id, name").eq("id", clientId).maybeSingle();
        if (!client || client.business_id !== before.businessId) return { ok: false, error: "That client isn't in this business." };
        history = ["client", `Linked to ${client.name}`];
      } else history = ["client", "Unlinked the client"];
      patch = { client_id: clientId };
      break;
    }
  }

  // Only if nobody changed it since it was read, so two people can't silently overwrite each other.
  const { data: saved, error } = await supabase.from("tickets").update(patch).eq("id", before.id).eq("updated_at", row.updated_at).select("id");
  if (error) {
    console.error("update ticket failed", error);
    return { ok: false, error: error.code === "42501" ? NOT_ALLOWED_TO_ASSIGN : "Couldn't save that change." };
  }
  if (!saved?.length) return { ok: false, error: "Someone else just changed this ticket. It's been refreshed; try again." };

  await log(supabase, before.id, me.memberId, history[0], history[1]);
  if (change.field === "assignee") {
    await notifyNow(
      planAssigned(team, { assigneeId: change.value || null, byId: me.memberId, what: { kind: "ticket", title: before.title }, body: before.details, urgent: before.priority === "urgent" }),
      { ticketId: before.id, clientId: before.clientId ?? undefined },
    );
  }
  if (change.field === "status" && change.value === "done") {
    await notifyNow(planTicketDone(team, before, me.memberId), { ticketId: before.id, clientId: before.clientId ?? undefined });
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function addTicketComment(input: unknown): Promise<Result> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = ticketCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  const { ticketId, body } = parsed.data;

  const { supabase, team } = await context();
  const { data: ticket } = await supabase.from("tickets").select("id, title, client_id").eq("id", ticketId).maybeSingle();
  if (!ticket) return { ok: false, error: "That ticket no longer exists." };
  // Worked out here from the text, never trusted from the browser.
  const known = findMentions(body, team).filter((id) => id !== me.memberId);

  const { error } = await supabase.from("ticket_events").insert({ ticket_id: ticketId, author_id: me.memberId, kind: "comment", body, mentions: known });
  if (error) {
    console.error("ticket comment failed", error);
    return { ok: false, error: "Couldn't post the comment." };
  }
  await notifyNow(planTicketMentions(team, ticket, me.memberId, known, body), { ticketId, clientId: ticket.client_id ?? undefined });
  revalidatePath("/dashboard/board");
  return { ok: true };
}
