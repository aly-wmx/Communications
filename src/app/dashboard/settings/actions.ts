"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { isValidTimeZone } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { slaSettingsSchema } from "@/lib/validation/settings";
import { normaliseDomain } from "@/lib/signin-domains";
import { serviceDb } from "@/lib/comms/ghl-store";
import { dispatchPending } from "@/lib/comms/notify-store";
import { isNotificationKind } from "@/lib/comms/notify-plan";

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


/** Team Slack channel for escalations, pick-ups and mentions, and which events go there. */
export async function saveSlackChannel(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const v = input as { channelId?: unknown };
  const channelId = typeof v?.channelId === "string" ? v.channelId.trim().toUpperCase() : "";
  if (channelId && !/^[CG][A-Z0-9]{8,}$/.test(channelId)) return { ok: false, error: "Slack channel IDs look like C0C7KR2UH9U (channel details → bottom of the About tab)." };
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ slack_channel_id: channelId }).eq("id", 1);
  if (error) return { ok: false, error: "Couldn't save the Slack channel." };
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/** Post a test message to the team channel right now. */
export async function testSlackChannel(): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!process.env.SLACK_BOT_TOKEN) return { ok: false, error: "Add SLACK_BOT_TOKEN in Vercel first." };
  const sb = serviceDb();
  const { data: settings } = await sb.from("settings").select("slack_channel_id").eq("id", 1).maybeSingle();
  if (!settings?.slack_channel_id) return { ok: false, error: "Save a channel ID first." };
  const { data: post, error } = await sb
    .from("slack_channel_posts")
    .insert({ kind: "mention", title: "Test from the Client Communications portal", body: "Escalations, pick-ups and mentions will appear in this channel.", link: "/dashboard" })
    .select("id")
    .single();
  if (error || !post) return { ok: false, error: "Couldn't queue the test." };
  await dispatchPending(sb, 1);
  const { data: result } = await sb.from("slack_channel_posts").select("status, error").eq("id", post.id).single();
  if (result?.status === "sent") return { ok: true };
  return { ok: false, error: result?.error || "Slack didn't accept the message." };
}

/** Settings → Notifications: which kinds go out by email, Slack DM and the team channel. */
export async function saveNotificationRules(input: unknown): Promise<ActionResult> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const v = (input ?? {}) as { email?: unknown; dm?: unknown; channel?: unknown };
  const kinds = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter(isNotificationKind))] : []);
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ email_kinds: kinds(v.email), dm_kinds: kinds(v.dm), slack_channel_events: kinds(v.channel) })
    .eq("id", 1);
  if (error) return { ok: false, error: "Couldn't save the notification settings." };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}
