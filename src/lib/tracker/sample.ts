import { createContact, escalate, markResponded, newId, resolve } from './contacts';
import type { Client, ClientContact, ContactChannel, TeamMember } from './types';

/** Demo clients and contacts at different ages so the queue can be tried out. */
export function trackerSample(team: TeamMember[], now = new Date()): { clients: Client[]; contacts: ClientContact[] } {
  const id = (name: string) => team.find((t) => t.name === name)?.id ?? team[0]?.id ?? '';
  const van = id('Van');
  const reid = id('Reid');
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  const mk = (name: string, project: string, phone: string): Client => ({
    id: newId('cl'),
    name,
    project,
    phone,
    email: '',
    ownerId: '',
    notes: '',
    createdAt: now.toISOString(),
  });
  const clients = [
    mk('Hernandez family', 'Kitchen remodel', '555-0142'),
    mk('Patel residence', 'Second-storey addition', '555-0187'),
    mk('Oak Street duplex', 'New build', '555-0110'),
    mk('Morgan & Lee', 'Basement finish', '555-0163'),
    mk('Chen residence', 'Bathroom renovation', '555-0121'),
  ];

  const c = (client: Client, channel: ContactChannel, ago: number, summary: string, extra: Partial<ClientContact> = {}) =>
    ({ ...createContact({ clientId: client.id, channel, priority: 'Normal', receivedAt: minsAgo(ago).toISOString(), summary, assigneeId: van }, van, minsAgo(ago)), ...extra });

  const contacts: ClientContact[] = [
    c(clients[0], 'Text', 20, 'Asking if the cabinet delivery is still on for Thursday'),
    c(clients[1], 'Missed call', 95, 'Left no voicemail, called twice'),
    c(clients[2], 'Voicemail', 60 * 26, 'Wants an update on the permit inspection date'),
    c(clients[3], 'Portal message', 10, 'Water coming through the window well after the storm', { priority: 'Urgent' }),
    escalate(c(clients[4], 'Call', 60 * 30, 'Unhappy about tile delay, wants a call from a manager'), van, [reid], 'Client upset', team, minsAgo(60 * 2)),
    markResponded(c(clients[0], 'Email', 150, 'Sent revised drawings, asked for approval'), van, minsAgo(115)),
    resolve(markResponded(c(clients[1], 'Call', 170, 'Change order question'), van, minsAgo(150)), van, minsAgo(140)),
  ];
  return { clients, contacts };
}
