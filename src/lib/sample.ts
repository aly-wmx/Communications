import { addDays, today } from './dates';
import { createRecord } from './records';
import { emptyInput, type Communication, type CommunicationInput } from './types';

/** A small, realistic set of records so a new user can see how the dashboard works. */
export function sampleData(): Communication[] {
  const t = today();
  const rows: Array<Partial<CommunicationInput>> = [
    {
      title: 'Monthly staff newsletter',
      channel: 'Newsletter',
      status: 'Sent',
      audience: 'All staff',
      owner: 'Comms team',
      sentDate: addDays(t, -12),
      scheduledDate: addDays(t, -12),
      reach: 420,
      tags: ['internal', 'monthly'],
    },
    {
      title: 'Q3 results press release',
      channel: 'Press release',
      status: 'In review',
      priority: 'High',
      audience: 'Media',
      owner: 'Comms team',
      requestedBy: 'Finance',
      scheduledDate: addDays(t, 3),
      tags: ['external'],
    },
    {
      title: 'Office move reminder',
      channel: 'Email',
      status: 'Scheduled',
      audience: 'Head office',
      owner: 'Comms team',
      requestedBy: 'Facilities',
      scheduledDate: addDays(t, 1),
    },
    {
      title: 'Community event promo',
      channel: 'Social media',
      status: 'Draft',
      audience: 'Public',
      owner: 'Comms team',
      scheduledDate: addDays(t, -2),
      tags: ['event'],
    },
    {
      title: 'Website homepage refresh',
      channel: 'Website',
      status: 'Sent',
      audience: 'Public',
      owner: 'Web team',
      sentDate: addDays(t, -40),
      scheduledDate: addDays(t, -40),
    },
    {
      title: 'Policy update memo',
      channel: 'Internal memo',
      status: 'Approved',
      audience: 'Managers',
      owner: 'Comms team',
      requestedBy: 'HR',
      scheduledDate: addDays(t, 6),
    },
  ];
  return rows.map((r) => createRecord({ ...emptyInput(), ...r }));
}
