import "server-only";
import { escalate, reminderDue } from "./contacts";
import { ghlConfig, sendGhlMessage, upsertGhlContact } from "./ghl-api";
import type { Db } from "./ghl-store";
import { planEscalation, planReminder, type PlanContext, type PlanMember, type PlannedNotification } from "./notify-plan";
import { textToHtml } from "./outbound";
import { contactFromRow, contactPatch, slaFromJson } from "./rows";
import { needsEscalation, slaState } from "./sla";
import type { ClientContact, SlaSettings, TeamMember } from "./types";
import type { Json } from "@/lib/supabase/database.types";

/** Saving, sending and scheduling notifications. Server only (service role). */

export const TEAM_TAG = "WMX portal team";
const ENGINE_KEY = "notify_engine";
const MAX_ATTEMPTS = 3;

export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://communications-wmx1.vercel.app";
}

export interface TeamRow extends TeamMember {
  role: string;
  slack_user_id: string;
  ghl_contact_id: string | null;
}

export async function loadTeam(sb: Db): Promise<TeamRow[]> {
  const { data } = await sb.from("team_members").select("id, name, email, phone, escalation, role, slack_user_id, ghl_contact_id");
  return (data ?? []) as TeamRow[];
}

/** GHL contact ids that belong to teammates, so the sync never treats them as clients. */
export async function teamGhlContactIds(sb: Db): Promise<Set<string>> {
  const { data } = await sb.from("team_members").select("ghl_contact_id").not("ghl_contact_id", "is", null);
  return new Set((data ?? []).map((r) => r.ghl_contact_id as string));
}

export function planTeam(team: TeamRow[]): PlanMember[] {
  return team.map((t) => ({ id: t.id, name: t.name, role: t.role, escalation: t.escalation }));
}

export function planContext(c: ClientContact, clientName: string, sla: SlaSettings, now: Date): PlanContext {
  return {
    clientName,
    channel: c.channel,
    summary: c.summary,
    waitedMinutes: slaState(c, sla, now).waitedMinutes,
    urgent: c.priority === "Urgent",
    assigneeId: c.assigneeId,
    defaultAssigneeId: sla.defaultAssigneeId,
  };
}

export async function saveNotifications(
  sb: Db,
  planned: PlannedNotification[],
  about: { contactId?: string; clientId?: string; link?: string },
): Promise<number> {
  if (!planned.length) return 0;
  const link = about.link ?? (about.clientId ? `/dashboard/inbox?view=all&dept=all&c=${about.clientId}` : "/dashboard/inbox");
  const { error } = await sb.from("notifications").insert(
    planned.map((p) => ({
      recipient_id: p.recipientId,
      kind: p.kind,
      title: p.title,
      body: p.body,
      urgent: p.urgent,
      link,
      contact_id: about.contactId ?? null,
      client_id: about.clientId ?? null,
    })),
  );
  if (error) throw error;
  await queueChannelPosts(sb, planned, link);
  return planned.length;
}

export const CHANNEL_EVENTS = ["escalation", "picked_up", "mention", "reminder", "new_message"] as const;

/**
 * The team channel gets one post per event (e.g. one escalation post tagging
 * everyone notified), for the kinds chosen in Settings.
 */
async function queueChannelPosts(sb: Db, planned: PlannedNotification[], link: string) {
  const { data: settings } = await sb.from("settings").select("slack_channel_id, slack_channel_events").eq("id", 1).maybeSingle();
  if (!settings?.slack_channel_id) return;
  const groups = new Map<string, { kind: string; title: string; body: string; urgent: boolean; ids: string[] }>();
  for (const p of planned) {
    if (!settings.slack_channel_events.includes(p.kind)) continue;
    // Mentions are personal ("X mentioned you…"), so the channel post names everyone instead.
    const key = `${p.kind}|${p.kind === "mention" ? p.body : p.title}|${p.body}`;
    const g = groups.get(key) ?? { kind: p.kind, title: p.title, body: p.body, urgent: p.urgent, ids: [] };
    g.ids.push(p.recipientId);
    groups.set(key, g);
  }
  if (!groups.size) return;
  await sb.from("slack_channel_posts").insert(
    [...groups.values()].map((g) => ({
      kind: g.kind,
      // "Aly mentioned you on X" → "Aly mentioned teammates on X"; "Aly needs you to reply to X" → "Aly asked for a reply to X".
      title:
        g.kind === "mention"
          ? g.title.replace(/ mentioned you /, " mentioned teammates ").replace(/ needs you to reply to /, " asked for a reply to ")
          : g.title,
      body: g.body,
      link,
      urgent: g.urgent,
      mention_member_ids: g.ids,
    })),
  );
}

// ---------- The every-minute engine: reminders and automatic escalation ----------

/**
 * Only contacts that arrive after the engine was first switched on are reminded
 * or escalated automatically, so switching it on doesn't flood the managers with
 * the existing backlog (that's on the Escalations page to handle by hand).
 */
async function engineStart(sb: Db, now: Date): Promise<string> {
  const { data } = await sb.from("integration_state").select("value").eq("key", ENGINE_KEY).maybeSingle();
  const started = (data?.value as { startedAt?: string } | null)?.startedAt;
  if (started) return started;
  const startedAt = now.toISOString();
  await sb.from("integration_state").upsert({ key: ENGINE_KEY, value: { startedAt } as unknown as Json });
  return startedAt;
}

export async function runEngine(sb: Db, now = new Date()): Promise<{ reminded: number; escalated: number }> {
  const startedAt = await engineStart(sb, now);
  const [{ data: rows }, { data: settings }, team] = await Promise.all([
    sb.from("contacts").select("*, clients(name)").eq("status", "Open").gte("received_at", startedAt),
    sb.from("settings").select("sla").eq("id", 1).maybeSingle(),
    loadTeam(sb),
  ]);
  const sla = slaFromJson(settings?.sla);
  const members = planTeam(team);
  let reminded = 0;
  let escalated = 0;

  for (const row of rows ?? []) {
    const { clients, ...contactRow } = row as typeof row & { clients: { name: string } | null };
    const c = contactFromRow(contactRow);
    const clientName = clients?.name ?? "A client";

    if (needsEscalation(c, sla, now)) {
      const planned = planEscalation(planContext(c, clientName, sla, now), members, { raisedById: "", automatic: true });
      const notifiedIds = planned.map((p) => p.recipientId);
      const next = escalate(c, "", notifiedIds, "", team, now, "sla");
      // Only the run that changes the row sends notifications (guards against overlapping runs).
      const { data: updated } = await sb
        .from("contacts")
        .update(contactPatch(next))
        .eq("id", c.id)
        .eq("updated_at", contactRow.updated_at)
        .select("id");
      if (updated?.length) {
        await saveNotifications(sb, planned, { contactId: c.id, clientId: c.clientId });
        escalated++;
      }
    } else if (reminderDue(c, sla, now)) {
      const { data: updated } = await sb
        .from("contacts")
        .update({ reminded_at: now.toISOString() })
        .eq("id", c.id)
        .is("reminded_at", null)
        .select("id");
      if (updated?.length) {
        await saveNotifications(sb, planReminder(planContext(c, clientName, sla, now), members), { contactId: c.id, clientId: c.clientId });
        reminded++;
      }
    }
  }
  return { reminded, escalated };
}

// ---------- Delivery: Slack DMs and email through GoHighLevel ----------

interface Prefs {
  slack: boolean;
  email: boolean;
  new_messages: boolean;
  reminders: boolean;
}
const DEFAULT_PREFS: Prefs = { slack: true, email: true, new_messages: true, reminders: true };

/** Escalations, pick-ups and mentions always go out; reminders and new-message alerts follow each person's choice. */
function wants(prefs: Prefs, kind: string): boolean {
  if (kind === "new_message") return prefs.new_messages;
  if (kind === "reminder") return prefs.reminders;
  return true;
}

async function sendSlack(token: string, userId: string, n: { title: string; body: string; link: string; urgent: boolean }) {
  const url = `${siteUrl()}${n.link}`;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      channel: userId, // A member ID posts to the app's direct message with that person.
      text: `${n.title}${n.body ? ` — ${n.body}` : ""}`,
      unfurl_links: false,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `${n.urgent ? ":rotating_light: " : ""}*${n.title}*${n.body ? `\n${n.body}` : ""}` } },
        { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in portal" }, url, style: n.urgent ? "danger" : "primary" }] },
      ],
    }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!body.ok) throw new Error(`Slack: ${body.error ?? res.status}`);
}

async function teamContactId(sb: Db, member: TeamRow, token: string, locationId: string): Promise<string> {
  if (member.ghl_contact_id) return member.ghl_contact_id;
  const { id } = await upsertGhlContact(token, locationId, { name: member.name, phone: "", email: member.email }, [TEAM_TAG]);
  await sb.from("team_members").update({ ghl_contact_id: id }).eq("id", member.id);
  member.ghl_contact_id = id;
  return id;
}

async function sendEmail(sb: Db, member: TeamRow, n: { title: string; body: string; link: string }) {
  const { token, locationId, missing } = ghlConfig();
  if (missing.length) throw new Error("GoHighLevel isn't connected.");
  const contactId = await teamContactId(sb, member, token, locationId);
  const url = `${siteUrl()}${n.link}`;
  const text = `${n.body}\n\nOpen in the portal: ${url}`;
  await sendGhlMessage(token, {
    type: "Email",
    contactId,
    subject: `[Portal] ${n.title}`,
    message: text,
    html: `${textToHtml(n.body)}<p><a href="${url}">Open in the portal →</a></p>`,
  });
}

/** Post queued channel messages to the team Slack channel, tagging the people involved. */
async function dispatchChannel(sb: Db, team: TeamRow[]): Promise<number> {
  const token = process.env.SLACK_BOT_TOKEN ?? "";
  const { data: settings } = await sb.from("settings").select("slack_channel_id").eq("id", 1).maybeSingle();
  const { data: posts } = await sb.from("slack_channel_posts").select("*").eq("status", "pending").order("created_at").limit(15);
  if (!posts?.length) return 0;
  if (!token || !settings?.slack_channel_id) {
    await sb.from("slack_channel_posts").update({ status: "skipped", error: token ? "No channel set" : "Slack isn't connected" }).in("id", posts.map((p) => p.id));
    return 0;
  }
  let sent = 0;
  for (const p of posts) {
    const tags = p.mention_member_ids
      .map((id) => team.find((t) => t.id === id))
      .filter((t): t is TeamRow => Boolean(t))
      .map((t) => (t.slack_user_id ? `<@${t.slack_user_id}>` : t.name));
    try {
      await sendSlack(token, settings.slack_channel_id, {
        title: p.title,
        body: [p.body, tags.length ? `For: ${tags.join(" ")}` : ""].filter(Boolean).join("\n"),
        link: p.link,
        urgent: p.urgent,
      });
      await sb.from("slack_channel_posts").update({ status: "sent", attempts: p.attempts + 1 }).eq("id", p.id);
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Slack failed";
      const hint = /not_in_channel|channel_not_found/.test(msg) ? `${msg} — invite the app to the channel (/invite @WMX Portal)` : msg;
      await sb
        .from("slack_channel_posts")
        .update({ attempts: p.attempts + 1, error: hint.slice(0, 300), ...(p.attempts + 1 >= MAX_ATTEMPTS ? { status: "failed" } : {}) })
        .eq("id", p.id);
    }
  }
  return sent;
}

export async function dispatchPending(sb: Db, limit = 25): Promise<{ slack: number; email: number; failed: number; channel?: number }> {
  const { data: pending } = await sb
    .from("notifications")
    .select("*")
    .or("slack_status.eq.pending,email_status.eq.pending")
    .order("created_at")
    .limit(limit);
  const [team, { data: prefRows }] = await Promise.all([loadTeam(sb), sb.from("notification_prefs").select("*")]);
  const channel = await dispatchChannel(sb, team);
  if (!pending?.length) return { slack: 0, email: 0, failed: 0, channel };
  const prefsFor = (id: string): Prefs => ({ ...DEFAULT_PREFS, ...(prefRows ?? []).find((p) => p.member_id === id) });
  const slackToken = process.env.SLACK_BOT_TOKEN ?? "";
  const counts = { slack: 0, email: 0, failed: 0 };

  for (const n of pending) {
    const member = team.find((t) => t.id === n.recipient_id);
    const prefs = prefsFor(n.recipient_id);
    const patch: { slack_status?: string; email_status?: string; attempts: number; delivery_error?: string } = { attempts: n.attempts + 1 };
    const errors: string[] = [];

    if (n.slack_status === "pending") {
      if (!member || !slackToken || !member.slack_user_id || !prefs.slack || !wants(prefs, n.kind)) {
        patch.slack_status = "skipped";
      } else {
        try {
          await sendSlack(slackToken, member.slack_user_id, n);
          patch.slack_status = "sent";
          counts.slack++;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Slack failed");
          if (n.attempts + 1 >= MAX_ATTEMPTS) patch.slack_status = "failed";
        }
      }
    }

    if (n.email_status === "pending") {
      if (!member || !member.email || !prefs.email || !wants(prefs, n.kind)) {
        patch.email_status = "skipped";
      } else {
        try {
          await sendEmail(sb, member, n);
          patch.email_status = "sent";
          counts.email++;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : "Email failed");
          if (n.attempts + 1 >= MAX_ATTEMPTS) patch.email_status = "failed";
        }
      }
    }

    if (errors.length) {
      patch.delivery_error = errors.join(" · ").slice(0, 500);
      if (patch.slack_status === "failed" || patch.email_status === "failed") counts.failed++;
    }
    await sb.from("notifications").update(patch).eq("id", n.id);
  }
  return { ...counts, channel };
}
