import type { Communication } from '../types';
import type { Client, ClientContact, Escalation, ContactEvent, TeamMember } from './types';

/** Postgres returns "…+00:00"; the app compares ISO strings, so normalise to toISOString(). */
const iso = (v: string | null | undefined): string => (v ? new Date(v).toISOString() : '');
const tsOrNull = (v: string): string | null => (v ? v : null);

export interface TeamRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  escalation: boolean;
}

export const teamMapping = {
  table: 'team_members',
  fromRow: (r: TeamRow): TeamMember => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    escalation: r.escalation,
  }),
  toRow: (t: TeamMember): TeamRow => ({
    id: t.id,
    name: t.name.trim() || 'Unnamed',
    email: t.email.trim(),
    phone: t.phone.trim(),
    escalation: t.escalation,
  }),
  sort: (a: TeamMember, b: TeamMember) => a.name.localeCompare(b.name),
};

export interface ClientRow {
  id: string;
  name: string;
  project: string;
  phone: string;
  email: string;
  owner_id: string | null;
  notes: string;
  created_at: string;
}

export const clientMapping = {
  table: 'clients',
  fromRow: (r: ClientRow): Client => ({
    id: r.id,
    name: r.name,
    project: r.project,
    phone: r.phone,
    email: r.email,
    ownerId: r.owner_id ?? '',
    notes: r.notes,
    createdAt: iso(r.created_at),
  }),
  toRow: (c: Client): ClientRow => ({
    id: c.id,
    name: c.name,
    project: c.project,
    phone: c.phone,
    email: c.email,
    owner_id: c.ownerId || null,
    notes: c.notes,
    created_at: c.createdAt || new Date().toISOString(),
  }),
  sort: (a: Client, b: Client) => a.name.localeCompare(b.name),
};

export interface ContactRow {
  id: string;
  client_id: string;
  channel: ClientContact['channel'];
  priority: ClientContact['priority'];
  received_at: string;
  summary: string;
  assignee_id: string | null;
  status: ClientContact['status'];
  first_response_at: string | null;
  responded_by_id: string;
  resolved_at: string | null;
  escalations: Escalation[];
  history: ContactEvent[];
  source: ClientContact['source'];
  created_at: string;
  updated_at: string;
}

export const contactMapping = {
  table: 'contacts',
  fromRow: (r: ContactRow): ClientContact => ({
    id: r.id,
    clientId: r.client_id,
    channel: r.channel,
    priority: r.priority,
    receivedAt: iso(r.received_at),
    summary: r.summary,
    assigneeId: r.assignee_id ?? '',
    status: r.status,
    firstResponseAt: iso(r.first_response_at),
    respondedById: r.responded_by_id,
    resolvedAt: iso(r.resolved_at),
    escalations: r.escalations ?? [],
    history: r.history ?? [],
    source: r.source,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  }),
  toRow: (c: ClientContact): ContactRow => ({
    id: c.id,
    client_id: c.clientId,
    channel: c.channel,
    priority: c.priority,
    received_at: c.receivedAt,
    summary: c.summary,
    assignee_id: c.assigneeId || null,
    status: c.status,
    first_response_at: tsOrNull(c.firstResponseAt),
    responded_by_id: c.respondedById,
    resolved_at: tsOrNull(c.resolvedAt),
    escalations: c.escalations,
    history: c.history,
    source: c.source,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }),
};

export interface AnnouncementRow {
  id: string;
  data: Communication;
  updated_at: string;
}

export const announcementMapping = {
  table: 'announcements',
  fromRow: (r: AnnouncementRow): Communication => ({ ...r.data, id: r.id }),
  toRow: (c: Communication): AnnouncementRow => ({ id: c.id, data: c, updated_at: c.updatedAt }),
  sort: (a: Communication, b: Communication) => b.createdAt.localeCompare(a.createdAt),
};
