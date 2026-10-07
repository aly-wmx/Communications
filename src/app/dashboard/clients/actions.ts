"use server";

import { revalidatePath } from "next/cache";
import { getSessionMember, requireAdmin } from "@/lib/auth";
import { ghlConfig, GhlError, updateGhlContact } from "@/lib/comms/ghl-api";
import { toE164 } from "@/lib/comms/outbound";
import { createClient } from "@/lib/supabase/server";
import { clientUpdateSchema } from "@/lib/validation/clients";

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
