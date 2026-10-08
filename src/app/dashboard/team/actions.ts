"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { siteUrl } from "@/lib/comms/notify-store";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getSessionMember, requireAdmin } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import type { Database } from "@/lib/supabase/database.types";
import { memberFieldSchema, memberIdSchema } from "@/lib/validation/team";

/** Removed addresses must not walk back in through "allowed sign-in domains". */
async function blockAutoJoin(email: string) {
  const address = email.trim().toLowerCase();
  if (!address) return;
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("blocked_emails").eq("id", 1).maybeSingle();
  const list = data?.blocked_emails ?? [];
  if (!list.includes(address)) await supabase.from("settings").update({ blocked_emails: [...list, address] }).eq("id", 1);
}

/** Turn database refusals into something an admin can act on. */
function explain(message: string, fallback: string): string {
  if (message.includes("at least one admin")) return "The portal needs at least one admin with an email.";
  if (message.includes("team_members_email_key")) return "Someone else on the team already uses that email.";
  return fallback;
}

export async function updateMemberField(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = memberFieldSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { id, field, value } = parsed.data;

  const me = await getSessionMember();
  if (me?.memberId === id && (field === "role" || field === "email")) {
    return { ok: false, error: "You can't change your own role or sign-in email. Ask another admin." };
  }

  const update = { [field]: value } as Database["public"]["Tables"]["team_members"]["Update"];
  const supabase = await createClient();
  const { data: before } = field === "email" ? await supabase.from("team_members").select("email").eq("id", id).maybeSingle() : { data: null };
  const { error } = await supabase.from("team_members").update(update).eq("id", id);
  if (error) return { ok: false, error: explain(error.message, "Couldn't save that change.") };
  if (field === "email" && before?.email && before.email.toLowerCase() !== String(value).toLowerCase()) await blockAutoJoin(before.email);

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function addMember(): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_members")
    .insert({ id: `tm_${randomUUID()}`, name: "New person", role: "coordinator" });
  if (error) return { ok: false, error: "Couldn't add that person." };

  revalidatePath("/dashboard/team");
  return { ok: true };
}

export async function deleteMember(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = memberIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const me = await getSessionMember();
  if (me?.memberId === parsed.data.id) return { ok: false, error: "You can't remove yourself." };

  const supabase = await createClient();
  const { data: removed } = await supabase.from("team_members").select("email").eq("id", parsed.data.id).maybeSingle();
  const { error } = await supabase.from("team_members").delete().eq("id", parsed.data.id);
  if (error) return { ok: false, error: explain(error.message, "Couldn't remove that person.") };
  if (removed?.email) await blockAutoJoin(removed.email);

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Emails a sign-up link so they can set a password. Optional — anyone on the
 * team list can also just use "Continue with Google" with that address.
 */
export async function inviteMember(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = memberIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "Invites need SUPABASE_SERVICE_ROLE_KEY set in Vercel. Google sign-in works without it." };
  }

  const supabase = await createClient();
  const { data: member } = await supabase.from("team_members").select("email").eq("id", parsed.data.id).maybeSingle();
  if (!member?.email) return { ok: false, error: "Add their email first." };

  // Fixed site address, never the request's Host header (which a caller can set).
  const origin = siteUrl();

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(member.email, { redirectTo: `${origin}/reset-password` });
  if (error) {
    if (/already been registered|already exists/i.test(error.message)) {
      return { ok: false, error: "They already have an account — they can sign in, or use Forgot password." };
    }
    return { ok: false, error: `Couldn't send the invite: ${error.message}` };
  }
  return { ok: true };
}

const ghlUserIdSchema = z.string().min(1).max(60);

/** Add a GoHighLevel user to the portal team (gives them sign-in access). */
export async function addFromGhl(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = z
    .object({ ghlUserId: ghlUserIdSchema, role: z.enum(["admin", "manager", "coordinator"]), department: z.enum(["", "sales", "design", "construction", "client_care"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { ghlUserId, role, department } = parsed.data;

  const supabase = await createClient();
  const { data: u } = await supabase.from("ghl_users").select("id, name, email, phone").eq("id", ghlUserId).maybeSingle();
  if (!u) return { ok: false, error: "That GoHighLevel user wasn't found — wait for the next sync." };
  const { error } = await supabase.from("team_members").insert({
    id: `tm_${randomUUID()}`,
    name: u.name || u.email || "New teammate",
    email: u.email,
    phone: u.phone,
    role,
    department,
    ghl_user_id: u.id,
  });
  if (error) return { ok: false, error: explain(error.message, error.message.includes("ghl_user") ? "That GHL user is already linked to a teammate." : "Couldn't add them.") };
  revalidatePath("/dashboard/team");
  return { ok: true };
}

/** Link (or unlink with "") a portal teammate to a GoHighLevel user, and copy over any missing phone. */
export async function linkGhlUser(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = z.object({ memberId: z.string().min(1).max(100), ghlUserId: z.string().max(60) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { memberId, ghlUserId } = parsed.data;

  const supabase = await createClient();
  if (!ghlUserId) {
    await supabase.from("team_members").update({ ghl_user_id: null }).eq("id", memberId);
    revalidatePath("/dashboard/team");
    return { ok: true };
  }
  const [{ data: u }, { data: m }] = await Promise.all([
    supabase.from("ghl_users").select("phone").eq("id", ghlUserId).maybeSingle(),
    supabase.from("team_members").select("phone").eq("id", memberId).maybeSingle(),
  ]);
  if (!u || !m) return { ok: false, error: "Not found." };
  const { error } = await supabase
    .from("team_members")
    .update({ ghl_user_id: ghlUserId, ...(!m.phone && u.phone ? { phone: u.phone } : {}) })
    .eq("id", memberId);
  if (error) return { ok: false, error: "That GHL user is already linked to someone else." };
  revalidatePath("/dashboard/team");
  return { ok: true };
}

/** Copy name and phone from GoHighLevel onto every linked teammate (emails are left alone — they're sign-ins). */
export async function syncLinkedFromGhl(): Promise<ActionResult & { updated?: number }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = await createClient();
  const [{ data: members }, { data: users }] = await Promise.all([
    supabase.from("team_members").select("id, name, phone, email, ghl_user_id").not("ghl_user_id", "is", null),
    supabase.from("ghl_users").select("id, name, phone, email"),
  ]);
  let updated = 0;
  for (const m of members ?? []) {
    const u = (users ?? []).find((x) => x.id === m.ghl_user_id);
    if (!u) continue;
    const patch = {
      ...(u.name && u.name !== m.name ? { name: u.name } : {}),
      ...(u.phone && u.phone !== m.phone ? { phone: u.phone } : {}),
      ...(!m.email && u.email ? { email: u.email } : {}),
    };
    if (Object.keys(patch).length) {
      await supabase.from("team_members").update(patch).eq("id", m.id);
      updated++;
    }
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, updated };
}
