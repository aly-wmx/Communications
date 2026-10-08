import { formatMinutes } from "./sla";

/** Who is notified about what, and the words they see. Pure, so the rules are tested. */

export type NotificationKind = "escalation" | "reminder" | "new_message" | "picked_up" | "mention";

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ["escalation", "picked_up", "mention", "reminder", "new_message"];

export const isNotificationKind = (k: unknown): k is NotificationKind =>
  typeof k === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(k);

/**
 * Which kinds leave the portal, set by an admin in Settings → Notifications.
 * Everything always shows in the portal (bell and pop-ups).
 */
export interface DeliveryRules {
  email: string[];
  dm: string[];
}

/** Used if the settings can't be read: only escalations leave the portal. */
export const DEFAULT_DELIVERY: DeliveryRules = { email: ["escalation"], dm: ["escalation"] };

export interface PlanMember {
  id: string;
  name: string;
  role: string;
  escalation: boolean;
}

export interface PlannedNotification {
  recipientId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  urgent: boolean;
}

export interface PlanContext {
  clientName: string;
  channel: string;
  summary: string;
  waitedMinutes: number;
  urgent: boolean;
  assigneeId: string;
  /** Used when the contact is unassigned. */
  defaultAssigneeId: string;
}

/** Slack's required escaping: client text can't ping @channel or hide a link behind other words. */
export const escapeSlack = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const quote = (s: string) => (s ? `“${s.length > 140 ? `${s.slice(0, 140)}…` : s}”` : "");
const unique = (ids: string[]) => [...new Set(ids.filter(Boolean))];

/** The person responsible: the assignee, else the default assignee, else every coordinator. */
export function responsible(ctx: PlanContext, team: PlanMember[]): string[] {
  const known = (id: string) => team.some((t) => t.id === id);
  if (ctx.assigneeId && known(ctx.assigneeId)) return [ctx.assigneeId];
  if (ctx.defaultAssigneeId && known(ctx.defaultAssigneeId)) return [ctx.defaultAssigneeId];
  return team.filter((t) => t.role === "coordinator").map((t) => t.id);
}

export function planNewMessage(ctx: PlanContext, team: PlanMember[]): PlannedNotification[] {
  return responsible(ctx, team).map((recipientId) => ({
    recipientId,
    kind: "new_message",
    title: `New ${ctx.channel.toLowerCase()} from ${ctx.clientName}`,
    body: quote(ctx.summary),
    urgent: ctx.urgent,
  }));
}

export function planReminder(ctx: PlanContext, team: PlanMember[]): PlannedNotification[] {
  return responsible(ctx, team).map((recipientId) => ({
    recipientId,
    kind: "reminder",
    title: `${ctx.clientName} has waited ${formatMinutes(ctx.waitedMinutes)}`,
    body: [`${ctx.channel} still needs a reply.`, quote(ctx.summary)].filter(Boolean).join(" "),
    urgent: false,
  }));
}

/**
 * Escalation goes to the chosen people (default: everyone marked "receives
 * escalations") plus whoever is responsible, but never to the person who raised it.
 */
export function planEscalation(
  ctx: PlanContext,
  team: PlanMember[],
  opts: { raisedById: string; recipientIds?: string[]; note?: string; automatic: boolean },
): PlannedNotification[] {
  const managers = opts.recipientIds?.length ? opts.recipientIds : team.filter((t) => t.escalation).map((t) => t.id);
  const raisedBy = team.find((t) => t.id === opts.raisedById)?.name;
  const why = opts.automatic
    ? `No reply after ${formatMinutes(ctx.waitedMinutes)}.`
    : `${raisedBy ?? "A teammate"} escalated it${opts.note ? `: ${opts.note}` : "."}`;
  return unique([...managers, ...responsible(ctx, team)])
    .filter((id) => id !== opts.raisedById && team.some((t) => t.id === id))
    .map((recipientId) => ({
      recipientId,
      kind: "escalation",
      title: `${ctx.urgent ? "URGENT · " : ""}Escalated: ${ctx.clientName}`,
      body: [why, quote(ctx.summary)].filter(Boolean).join(" "),
      urgent: true,
    }));
}

/** Tell everyone who got the escalation that someone has it, so they can stand down. */
export function planPickedUp(
  ctx: PlanContext,
  team: PlanMember[],
  opts: { byId: string; notifiedIds: string[] },
): PlannedNotification[] {
  const by = team.find((t) => t.id === opts.byId)?.name ?? "Someone";
  return unique([...opts.notifiedIds, ...responsible(ctx, team)])
    .filter((id) => id !== opts.byId && team.some((t) => t.id === id))
    .map((recipientId) => ({
      recipientId,
      kind: "picked_up",
      title: `${by} picked up ${ctx.clientName}`,
      body: "You don't need to act on this escalation.",
      urgent: false,
    }));
}
