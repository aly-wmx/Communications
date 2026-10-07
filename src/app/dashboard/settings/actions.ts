"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { isValidTimeZone } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { slaSettingsSchema } from "@/lib/validation/settings";

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
