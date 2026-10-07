/** Inbound client contact tracking: who owes a client a response, and for how long. */

export const CONTACT_CHANNELS = [
  'Call',
  'Missed call',
  'Voicemail',
  'Text',
  'Email',
  'Portal message',
] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/**
 * Open            – waiting on us (the SLA clock runs until the first response)
 * Waiting on client – we've done our part; nothing ages
 * Resolved        – closed
 */
export const CONTACT_STATUSES = ['Open', 'Waiting on client', 'Resolved'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export type ContactPriority = 'Normal' | 'Urgent';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** Receives escalations (e.g. Reid and Chris). */
  escalation: boolean;
}

export interface Client {
  id: string;
  name: string;
  project: string;
  phone: string;
  email: string;
  /** Team member who normally handles this client. */
  ownerId: string;
  notes: string;
  createdAt: string;
}

export interface Escalation {
  at: string;
  /** Team member id who pressed Escalate, or '' when raised by the SLA rule. */
  byId: string;
  reason: 'manual' | 'sla';
  notifiedIds: string[];
  note: string;
}

export interface ContactEvent {
  at: string;
  byId: string;
  message: string;
}

export interface ClientContact {
  id: string;
  clientId: string;
  channel: ContactChannel;
  priority: ContactPriority;
  /** When the client reached out (ISO). The SLA clock starts here. */
  receivedAt: string;
  summary: string;
  assigneeId: string;
  status: ContactStatus;
  /** First response to the client (ISO), '' until someone responds. */
  firstResponseAt: string;
  respondedById: string;
  resolvedAt: string;
  escalations: Escalation[];
  history: ContactEvent[];
  /** 'manual' now; 'ghl' once GoHighLevel webhooks create contacts. */
  source: 'manual' | 'ghl';
  createdAt: string;
  updatedAt: string;
}

export interface BusinessHours {
  enabled: boolean;
  /** "HH:MM", local time. */
  start: string;
  end: string;
  /** 0 = Sunday … 6 = Saturday. */
  days: number[];
}

export interface SlaSettings {
  /** Minutes without a response before the assignee is reminded (amber). */
  reminderMinutes: number;
  /** Minutes without a response before escalation (red). */
  escalateMinutes: number;
  /** Minutes before an Urgent contact escalates; 0 = immediately. */
  urgentEscalateMinutes: number;
  /** Count only business minutes toward the SLA. */
  businessHours: BusinessHours;
  /** Default assignee for new contacts when the client has no owner. */
  defaultAssigneeId: string;
  /** IANA zone the business hours are in, e.g. "America/Los_Angeles". Empty until an admin sets it. */
  timeZone?: string;
}
