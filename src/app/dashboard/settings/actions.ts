"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { isValidTimeZone } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { slaSettingsSchema } from "@/lib/validation/settings";
import { normaliseDomain } from "@/lib/signin-domains";

export async function saveSla(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = slaSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the settings." };
  const v = parsed.data;
  if (!isValidTimeZone(v.timeZone)) return { ok: false, error: "That time zone isn't recognised." };

  const supabase = await createClient();
  if (v.defaultAssigneeId) {
    const { data } = await supabase.from("team_members").select("id").eq("id", v.defaultAssigneeId).maybeSingle();
    if (!data) return { ok: false, error: "The default assignee isn't on the team." };
  }

  const sla = { ...v, businessHours: { ...v.businessHours, days: [...new Set(v.businessHours.days)].sort() } };
  const { error } = await supabase
    .from("settings")
    .upsert({ id: 1, sla: sla as unknown as Json, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save the settings." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Domains whose Google accounts join automatically, and addresses blocked from doing so. */
export async function saveSignInAccess(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const v = input as { domains?: unknown; blocked?: unknown };
  if (!Array.isArray(v?.domains) || !Array.isArray(v?.blocked)) return { ok: false, error: "Invalid input." };

  const domains: string[] = [];
  for (const d of v.domains) {
    const clean = typeof d === "string" ? normaliseDomain(d) : null;
    if (!clean) return { ok: false, error: `"${String(d)}" isn't a valid domain (e.g. watermarkdesignbuild.com).` };
    if (!domains.includes(clean)) domains.push(clean);
  }
  if (domains.length > 10) return { ok: false, error: "Up to 10 domains." };
  const blocked = [...new Set(v.blocked.filter((b): b is string => typeof b === "string" && /^[^\s@]+@[^\s@]+$/.test(b)).map((b) => b.trim().toLowerCase()))];

  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ allowed_domains: domains, blocked_emails: blocked }).eq("id", 1);
  if (error) return { ok: false, error: "Couldn't save sign-in access." };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
