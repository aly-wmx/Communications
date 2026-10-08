"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
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

  const host = (await headers()).get("host") ?? "localhost:3000";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;

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
