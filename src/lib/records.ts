import { addDays, monthKey, today } from './dates';
import {
  CHANNELS,
  PRIORITIES,
  STATUSES,
  type Channel,
  type Communication,
  type CommunicationInput,
  type Status,
} from './types';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Fill sentDate automatically the first time a record is marked Sent. */
function normalise(input: CommunicationInput): CommunicationInput {
  const out = { ...input, title: input.title.trim() };
  if (out.status === 'Sent' && !out.sentDate) out.sentDate = today();
  out.tags = [...new Set(out.tags.map((t) => t.trim()).filter(Boolean))];
  return out;
}

export function createRecord(input: CommunicationInput, now = new Date()): Communication {
  const at = now.toISOString();
  return {
    ...normalise(input),
    id: newId(),
    createdAt: at,
    updatedAt: at,
    history: [{ at, message: `Created as ${input.status}` }],
  };
}

const TRACKED: Array<[keyof CommunicationInput, string]> = [
  ['status', 'Status'],
  ['scheduledDate', 'Scheduled date'],
  ['sentDate', 'Sent date'],
  ['owner', 'Owner'],
  ['channel', 'Channel'],
  ['priority', 'Priority'],
];

export function updateRecord(
  existing: Communication,
  input: CommunicationInput,
  now = new Date(),
): Communication {
  const next = normalise(input);
  const at = now.toISOString();
  const changes = TRACKED.filter(([k]) => existing[k] !== next[k]).map(
    ([k, label]) => `${label}: ${existing[k] || '—'} → ${next[k] || '—'}`,
  );
  const history = changes.length
    ? [...existing.history, { at, message: changes.join('; ') }]
    : existing.history;
  return { ...existing, ...next, updatedAt: at, history };
}

export function isOverdue(c: Communication, on = today()): boolean {
  return (
    !!c.scheduledDate &&
    c.scheduledDate < on &&
    c.status !== 'Sent' &&
    c.status !== 'Cancelled'
  );
}

export interface Filters {
  search: string;
  status: Status | '';
  channel: Channel | '';
  owner: string;
  from: string;
  to: string;
  overdueOnly: boolean;
}

export const emptyFilters: Filters = {
  search: '',
  status: '',
  channel: '',
  owner: '',
  from: '',
  to: '',
  overdueOnly: false,
};

/** The date a record "belongs" to: when it went out, or when it is planned to. */
export function effectiveDate(c: Communication): string {
  return c.sentDate || c.scheduledDate;
}

export function applyFilters(list: Communication[], f: Filters): Communication[] {
  const q = f.search.trim().toLowerCase();
  return list.filter((c) => {
    if (f.status && c.status !== f.status) return false;
    if (f.channel && c.channel !== f.channel) return false;
    if (f.owner && c.owner !== f.owner) return false;
    if (f.overdueOnly && !isOverdue(c)) return false;
    const d = effectiveDate(c);
    if (f.from && (!d || d < f.from)) return false;
    if (f.to && (!d || d > f.to)) return false;
    if (q) {
      const hay = [c.title, c.audience, c.owner, c.requestedBy, c.summary, c.notes, ...c.tags]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type SortKey = 'date' | 'title' | 'status' | 'channel' | 'updated';

export function sortRecords(list: Communication[], key: SortKey, desc: boolean): Communication[] {
  const val = (c: Communication): string => {
    switch (key) {
      case 'date':
        return effectiveDate(c) || '9999-99-99';
      case 'title':
        return c.title.toLowerCase();
      case 'status':
        return String(STATUSES.indexOf(c.status)).padStart(2, '0');
      case 'channel':
        return c.channel;
      case 'updated':
        return c.updatedAt;
    }
  };
  const sorted = [...list].sort((a, b) => val(a).localeCompare(val(b)));
  return desc ? sorted.reverse() : sorted;
}

export interface Stats {
  total: number;
  sentThisMonth: number;
  upcoming7: number;
  awaitingApproval: number;
  overdue: number;
  reachThisMonth: number;
  byChannel: Array<{ channel: Channel; count: number }>;
  byStatus: Array<{ status: Status; count: number }>;
  monthly: Array<{ month: string; count: number }>;
}

export function computeStats(list: Communication[], on = today()): Stats {
  const thisMonth = monthKey(on);
  const in7 = addDays(on, 7);
  const sent = list.filter((c) => c.status === 'Sent');
  const sentThisMonth = sent.filter((c) => c.sentDate && monthKey(c.sentDate) === thisMonth);

  // Last six months, oldest first, counting sent communications.
  const months: string[] = [];
  const [y, m] = thisMonth.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return {
    total: list.length,
    sentThisMonth: sentThisMonth.length,
    upcoming7: list.filter(
      (c) =>
        c.scheduledDate >= on &&
        c.scheduledDate <= in7 &&
        c.status !== 'Sent' &&
        c.status !== 'Cancelled',
    ).length,
    awaitingApproval: list.filter((c) => c.status === 'In review').length,
    overdue: list.filter((c) => isOverdue(c, on)).length,
    reachThisMonth: sentThisMonth.reduce((n, c) => n + (c.reach ?? 0), 0),
    byChannel: CHANNELS.map((channel) => ({
      channel,
      count: list.filter((c) => c.channel === channel && c.status !== 'Cancelled').length,
    }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count),
    byStatus: STATUSES.map((status) => ({
      status,
      count: list.filter((c) => c.status === status).length,
    })),
    monthly: months.map((month) => ({
      month,
      count: sent.filter((c) => c.sentDate && monthKey(c.sentDate) === month).length,
    })),
  };
}

// ---------- Import / export ----------

/** Validate and coerce records from a JSON backup. Throws on malformed input. */
export function parseBackup(text: string): Communication[] {
  const data: unknown = JSON.parse(text);
  const arr = Array.isArray(data)
    ? data
    : (data as { communications?: unknown })?.communications;
  if (!Array.isArray(arr)) throw new Error('Backup file does not contain a communications list.');
  return arr.map((raw, i) => {
    const r = raw as Partial<Communication>;
    if (!r || typeof r.title !== 'string' || !r.title.trim()) {
      throw new Error(`Record ${i + 1} is missing a title.`);
    }
    const now = new Date().toISOString();
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return {
      id: str(r.id) || newId(),
      title: r.title,
      channel: CHANNELS.includes(r.channel as Channel) ? (r.channel as Channel) : 'Other',
      status: STATUSES.includes(r.status as Status) ? (r.status as Status) : 'Draft',
      priority: PRIORITIES.includes(r.priority as never) ? r.priority! : 'Normal',
      audience: str(r.audience),
      owner: str(r.owner),
      requestedBy: str(r.requestedBy),
      scheduledDate: str(r.scheduledDate),
      sentDate: str(r.sentDate),
      reach: typeof r.reach === 'number' ? r.reach : null,
      link: str(r.link),
      tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string') : [],
      summary: str(r.summary),
      notes: str(r.notes),
      createdAt: str(r.createdAt) || now,
      updatedAt: str(r.updatedAt) || now,
      history: Array.isArray(r.history) ? r.history : [],
    };
  });
}
