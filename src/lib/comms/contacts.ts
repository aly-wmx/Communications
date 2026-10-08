import { needsEscalation, slaState, startOfZonedDay } from './sla';
import type {
  Client,
  ClientContact,
  ContactChannel,
  ContactPriority,
  SlaSettings,
  TeamMember,
} from './types';

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export interface NewContactInput {
  clientId: string;
  channel: ContactChannel;
  priority: ContactPriority;
  receivedAt: string;
  summary: string;
  assigneeId: string;
}

export function createContact(input: NewContactInput, byId: string, now = new Date()): ClientContact {
  const at = now.toISOString();
  return {
    ...input,
    summary: input.summary.trim(),
    id: newId('ct'),
    status: 'Open',
    firstResponseAt: '',
    respondedById: '',
    resolvedAt: '',
    escalations: [],
    history: [{ at, byId, message: `Logged ${input.channel.toLowerCase()}` }],
    source: 'manual',
    createdAt: at,
    updatedAt: at,
  };
}

function withEvent(c: ClientContact, byId: string, message: string, now: Date, patch: Partial<ClientContact>): ClientContact {
  const at = now.toISOString();
  return { ...c, ...patch, updatedAt: at, history: [...c.history, { at, byId, message }] };
}

export function assign(c: ClientContact, assigneeId: string, byId: string, team: TeamMember[], now = new Date()) {
  if (c.assigneeId === assigneeId) return c;
  const name = team.find((t) => t.id === assigneeId)?.name ?? 'Unassigned';
  return withEvent(c, byId, `Assigned to ${name}`, now, { assigneeId });
}

/** Record the first (or a follow-up) response. Only the first stops the SLA clock. */
export function markResponded(c: ClientContact, byId: string, now = new Date(), waitingOnClient = true) {
  const first = !c.firstResponseAt;
  return withEvent(c, byId, first ? 'Responded to client' : 'Responded again', now, {
    firstResponseAt: c.firstResponseAt || now.toISOString(),
    respondedById: c.respondedById || byId,
    status: waitingOnClient && c.status === 'Open' ? 'Waiting on client' : c.status,
  });
}

/** Add a line to the item's history without changing anything else (e.g. "Missed call logged"). */
export function note(c: ClientContact, byId: string, message: string, now = new Date()) {
  return withEvent(c, byId, message, now, {});
}

export function resolve(c: ClientContact, byId: string, now = new Date(), reason = '') {
  return withEvent(c, byId, reason ? `Resolved — ${reason}` : 'Resolved', now, { status: 'Resolved', resolvedAt: now.toISOString() });
}

export function waitOnClient(c: ClientContact, byId: string, now = new Date()) {
  return withEvent(c, byId, 'Waiting on client', now, { status: 'Waiting on client', resolvedAt: '' });
}

export function reopen(c: ClientContact, byId: string, now = new Date()) {
  return withEvent(c, byId, 'Reopened', now, { status: 'Open', resolvedAt: '' });
}

export function escalate(
  c: ClientContact,
  byId: string,
  notifiedIds: string[],
  note: string,
  team: TeamMember[],
  now = new Date(),
  reason: 'manual' | 'sla' = 'manual',
) {
  const names = notifiedIds.map((id) => team.find((t) => t.id === id)?.name).filter(Boolean);
  const at = now.toISOString();
  return withEvent(
    c,
    byId,
    `Escalated to ${names.join(' & ') || 'nobody'}${note ? ` — ${note}` : ''}`,
    now,
    { escalations: [...c.escalations, { at, byId, reason, notifiedIds, note: note.trim() }] },
  );
}

/** "I've got it": the latest unacknowledged escalation is taken by this person. */
export function acknowledge(c: ClientContact, byId: string, team: TeamMember[], now = new Date()) {
  const idx = c.escalations.findLastIndex((e) => !e.acknowledgedAt);
  if (idx < 0) return c;
  const name = team.find((t) => t.id === byId)?.name ?? "Someone";
  const escalations = c.escalations.map((e, i) =>
    i === idx ? { ...e, acknowledgedById: byId, acknowledgedAt: now.toISOString() } : e,
  );
  return withEvent(c, byId, `${name} picked up the escalation`, now, { escalations });
}

/** True once a contact has reached the reminder threshold and nobody has been reminded yet. */
export function reminderDue(c: ClientContact, s: SlaSettings, now: Date): boolean {
  return !c.remindedAt && slaState(c, s, now).stage === "reminder";
}

/** Escalated and nobody has said "I've got it" yet. */
export function awaitingPickup(c: ClientContact): boolean {
  return c.status !== "Resolved" && c.escalations.some((e) => !e.acknowledgedAt);
}

// ---------- Queue views ----------

export type QueueFilter = 'waiting' | 'overdue' | 'escalate' | 'escalated' | 'client' | 'resolved' | 'all';

export function matchesFilter(c: ClientContact, f: QueueFilter, s: SlaSettings, now: Date): boolean {
  switch (f) {
    case 'waiting':
      return c.status === 'Open';
    case 'overdue':
      return slaState(c, s, now).stage === 'breach';
    case 'escalate':
      return needsEscalation(c, s, now);
    case 'escalated':
      return c.status !== 'Resolved' && c.escalations.length > 0;
    case 'client':
      return c.status === 'Waiting on client';
    case 'resolved':
      return c.status === 'Resolved';
    case 'all':
      return true;
  }
}

/** Most urgent first: needs-escalation, breached, reminder, then oldest. Resolved last. */
export function sortQueue(list: ClientContact[], s: SlaSettings, now: Date): ClientContact[] {
  const rank = (c: ClientContact) => {
    if (c.status === 'Resolved') return 9;
    const st = slaState(c, s, now).stage;
    if (needsEscalation(c, s, now)) return 0;
    return { breach: 1, reminder: 2, ok: 3, paused: 5, responded: 5 }[st];
  };
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.status === 'Resolved') return b.resolvedAt.localeCompare(a.resolvedAt);
    return a.receivedAt.localeCompare(b.receivedAt);
  });
}

export interface QueueStats {
  waiting: number;
  overdue: number;
  needsEscalation: number;
  escalatedOpen: number;
  waitingOnClient: number;
  resolvedToday: number;
  /** Median SLA minutes to first response over the last 7 days; null when no data. */
  medianResponse7d: number | null;
  /** Share of contacts responded within SLA over the last 7 days, 0–1; null when no data. */
  withinSla7d: number | null;
  byAssignee: Array<{ id: string; open: number; overdue: number }>;
}

export function queueStats(list: ClientContact[], s: SlaSettings, now: Date): QueueStats {
  const startOfDay = startOfZonedDay(now, s.timeZone);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString();

  const responded7 = list.filter((c) => c.firstResponseAt && c.receivedAt >= weekAgo);
  const times = responded7.map((c) => slaState(c, s, now).waitedMinutes).sort((a, b) => a - b);
  const median = times.length
    ? times.length % 2
      ? times[(times.length - 1) / 2]
      : Math.round((times[times.length / 2 - 1] + times[times.length / 2]) / 2)
    : null;
  const within = responded7.filter((c) => {
    const st = slaState(c, s, now);
    return st.waitedMinutes < st.escalateAfter || (st.escalateAfter === 0 && st.waitedMinutes === 0);
  }).length;

  const open = list.filter((c) => c.status !== 'Resolved');
  const assignees = [...new Set(open.map((c) => c.assigneeId))];

  return {
    waiting: list.filter((c) => c.status === 'Open').length,
    overdue: list.filter((c) => slaState(c, s, now).stage === 'breach').length,
    needsEscalation: list.filter((c) => needsEscalation(c, s, now)).length,
    escalatedOpen: open.filter((c) => c.escalations.length > 0).length,
    waitingOnClient: list.filter((c) => c.status === 'Waiting on client').length,
    resolvedToday: list.filter((c) => c.resolvedAt && new Date(c.resolvedAt) >= startOfDay).length,
    medianResponse7d: median,
    withinSla7d: responded7.length ? within / responded7.length : null,
    byAssignee: assignees
      .map((id) => ({
        id,
        open: open.filter((c) => c.assigneeId === id).length,
        overdue: open.filter((c) => c.assigneeId === id && slaState(c, s, now).stage === 'breach').length,
      }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open),
  };
}

// ---------- Client list ----------

export interface ClientSummary {
  client: Client;
  open: number;
  waitingOnUs: number;
  lastInboundAt: string;
  lastResponseAt: string;
  /** SLA minutes of the longest-waiting open contact, 0 when nothing is waiting. */
  longestWaitMinutes: number;
  breached: boolean;
}

export function clientSummaries(
  clients: Client[],
  contacts: ClientContact[],
  s: SlaSettings,
  now: Date,
): ClientSummary[] {
  return clients.map((client) => {
    const mine = contacts.filter((c) => c.clientId === client.id);
    const waiting = mine.filter((c) => c.status === 'Open');
    const states = waiting.map((c) => slaState(c, s, now));
    const max = (xs: string[]) => xs.filter(Boolean).sort().at(-1) ?? '';
    return {
      client,
      open: mine.filter((c) => c.status !== 'Resolved').length,
      waitingOnUs: waiting.length,
      lastInboundAt: max(mine.map((c) => c.receivedAt)),
      lastResponseAt: max(mine.map((c) => c.firstResponseAt)),
      longestWaitMinutes: Math.max(0, ...states.map((st) => st.waitedMinutes)),
      breached: states.some((st) => st.stage === 'breach'),
    };
  });
}

/** Choose who a new contact goes to: the client's owner, else the default assignee. */
export function routeAssignee(client: Client | undefined, s: SlaSettings): string {
  return client?.ownerId || s.defaultAssigneeId;
}
