export const CHANNELS = [
  'Email',
  'Newsletter',
  'Social media',
  'Press release',
  'Website',
  'Internal memo',
  'SMS',
  'Event',
  'Print',
  'Other',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const STATUSES = [
  'Draft',
  'In review',
  'Approved',
  'Scheduled',
  'Sent',
  'Cancelled',
] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface HistoryEntry {
  at: string; // ISO timestamp
  message: string;
}

export interface Communication {
  id: string;
  title: string;
  channel: Channel;
  status: Status;
  priority: Priority;
  audience: string;
  owner: string;
  requestedBy: string;
  /** Planned send/publish date, YYYY-MM-DD. */
  scheduledDate: string;
  /** Actual send/publish date, YYYY-MM-DD. */
  sentDate: string;
  reach: number | null;
  link: string;
  tags: string[];
  summary: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
}

export type CommunicationInput = Omit<
  Communication,
  'id' | 'createdAt' | 'updatedAt' | 'history'
>;

export function emptyInput(): CommunicationInput {
  return {
    title: '',
    channel: 'Email',
    status: 'Draft',
    priority: 'Normal',
    audience: '',
    owner: '',
    requestedBy: '',
    scheduledDate: '',
    sentDate: '',
    reach: null,
    link: '',
    tags: [],
    summary: '',
    notes: '',
  };
}
