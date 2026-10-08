"use server";

import { revalidatePath } from "next/cache";
import { getSessionMember, requireAdmin } from "@/lib/auth";
import { resolve } from "@/lib/comms/contacts";
import { addGhlTags, ghlConfig, GhlError, removeGhlTags, updateGhlContact } from "@/lib/comms/ghl-api";
import { contactFromRow, contactPatch } from "@/lib/comms/rows";
import { toE164 } from "@/lib/comms/outbound";
import { createClient } from "@/lib/supabase/server";
import { archiveSchema, clientUpdateSchema } from "@/lib/validation/clients";

export type UpdateClientResult = { ok: true; warning?: string } | { ok: false; error: string };

/** Save a client's details; name/phone/email also go to their GoHighLevel contact. */
export async function updateClient(input: unknown): Promise<UpdateClientResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };

  const parsed = clientUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const v = parsed.data;

  const phone = v.phone ? toE164(v.phone) : "";
  if (v.phone && !phone) return { ok: false, error: "That phone number doesn't look right. Include the area code." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("clients")
    .select("id, name, phone, email, ghl_contact_id")
    .eq("id", v.clientId)
    .maybeSingle();
  if (!before) return { ok: false, error: "That client no longer exists." };

  if (v.ownerId) {
    const { data: owner } = await supabase.from("team_members").select("id").eq("id", v.ownerId).maybeSingle();
    if (!owner) return { ok: false, error: "That owner isn't on the team." };
  }

  // RLS: any team member may update clients.
  const { error } = await supabase
    .from("clients")
    .update({ name: v.name, project: v.project, phone, email: v.email, owner_id: v.ownerId || null, notes: v.notes })
    .eq("id", v.clientId);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("clients_name_key") ? "Another client already has that name." : "Couldn't save the changes.",
    };
  }

  revalidatePath(`/dashboard/clients/${v.clientId}`);
  revalidatePath("/dashboard/clients");

  // Keep GoHighLevel in step. The portal save already succeeded, so a GHL problem is a warning, not a failure.
  const changedForGhl = before.name !== v.name || before.phone !== phone || before.email !== v.email;
  if (before.ghl_contact_id && changedForGhl) {
    const { token, missing } = ghlConfig();
    if (missing.length) return { ok: true, warning: "Saved here, but GoHighLevel isn't connected, so it wasn't updated there." };
    try {
      await updateGhlContact(token, before.ghl_contact_id, { name: v.name, phone, email: v.email });
    } catch (err) {
      const why = err instanceof GhlError ? err.message : "GoHighLevel didn't respond.";
      return { ok: true, warning: `Saved here, but not in GoHighLevel: ${why}` };
    }
  }
  return { ok: true };
}

/** Admin only: remove a client and their portal history. Nothing is deleted in GoHighLevel. */
export async function deleteClient(clientId: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (typeof clientId !== "string" || !clientId || clientId.length > 100) return { ok: false, error: "Invalid client." };

  const supabase = await createClient();
  // RLS also enforces admin-only deletes; the select confirms a row was actually removed.
  const { data, error } = await supabase.from("clients").delete().eq("id", clientId).select("id");
  if (error) return { ok: false, error: "Couldn't delete the client." };
  if (!data?.length) return { ok: false, error: "That client was already removed, or you don't have permission." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const SPAM_TAG = "spam";

/**
 * Move a client to the Archived folder (as spam, or just archived). Their open
 * queue items are resolved, and new messages from them are kept on the thread
 * without reopening the queue or alerting anyone. Spam also tags the contact in GHL.
 */
export async function archiveClient(input: unknown): Promise<UpdateClientResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { clientId, reason } = parsed.data;

  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, name, ghl_contact_id").eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "That client no longer exists." };

  const now = new Date();
  const { error } = await supabase
    .from("clients")
    .update({ archived_at: now.toISOString(), archive_reason: reason, archived_by: me.memberId })
    .eq("id", clientId);
  if (error) return { ok: false, error: "Couldn't archive the client." };

  const { data: open } = await supabase.from("contacts").select("*").eq("client_id", clientId).neq("status", "Resolved");
  for (const row of open ?? []) {
    const next = resolve(contactFromRow(row), me.memberId, now, reason === "spam" ? "Marked as spam" : "Archived");
    await supabase.from("contacts").update(contactPatch(next)).eq("id", row.id);
  }

  revalidatePath("/dashboard", "layout");
  if (reason === "spam" && client.ghl_contact_id) {
    const { token, missing } = ghlConfig();
    if (missing.length) return { ok: true, warning: "Archived as spam here; GoHighLevel isn't connected, so it wasn't tagged there." };
    try {
      await addGhlTags(token, client.ghl_contact_id, [SPAM_TAG]);
    } catch (err) {
      return { ok: true, warning: `Archived as spam here, but not tagged in GoHighLevel: ${err instanceof GhlError ? err.message : "no response"}` };
    }
  }
  return { ok: true };
}

/** Bring a client back from the Archived folder (removes the GHL "spam" tag if it was spam). */
export async function restoreClient(input: unknown): Promise<UpdateClientResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = archiveSchema.pick({ clientId: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, ghl_contact_id, archive_reason")
    .eq("id", parsed.data.clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: "That client no longer exists." };

  const { error } = await supabase
    .from("clients")
    .update({ archived_at: null, archive_reason: null, archived_by: "" })
    .eq("id", client.id);
  if (error) return { ok: false, error: "Couldn't restore the client." };
  revalidatePath("/dashboard", "layout");

  if (client.archive_reason === "spam" && client.ghl_contact_id) {
    const { token, missing } = ghlConfig();
    if (!missing.length) {
      try {
        await removeGhlTags(token, client.ghl_contact_id, [SPAM_TAG]);
      } catch (err) {
        return { ok: true, warning: `Restored here, but the GoHighLevel "spam" tag couldn't be removed: ${err instanceof GhlError ? err.message : "no response"}` };
      }
    }
  }
  return { ok: true };
}
