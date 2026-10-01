import { formatMinutes, slaState } from './sla';
import type { Client, ClientContact, SlaSettings, TeamMember } from './types';

/**
 * Build a pre-filled email for an escalation.
 * Until the portal has a server to send notifications, the Escalate button
 * records the escalation and opens this draft in the user's mail app.
 */
export function escalationEmail(
  contact: ClientContact,
  client: Client | undefined,
  recipients: TeamMember[],
  assignee: TeamMember | undefined,
  sla: SlaSettings,
  note: string,
  now: Date,
): { href: string; missing: TeamMember[] } {
  const withEmail = recipients.filter((r) => r.email.trim());
  const missing = recipients.filter((r) => !r.email.trim());
  const waited = formatMinutes(slaState(contact, sla, now).waitedMinutes);
  const who = client ? `${client.name}${client.project ? ` (${client.project})` : ''}` : 'Unknown client';

  const subject = `ESCALATION: ${who} waiting ${waited} on a ${contact.channel.toLowerCase()}`;
  const body = [
    `Client: ${who}`,
    client?.phone ? `Phone: ${client.phone}` : '',
    `Channel: ${contact.channel}${contact.priority === 'Urgent' ? ' (URGENT)' : ''}`,
    `Received: ${new Date(contact.receivedAt).toLocaleString()}`,
    `Waiting: ${waited} without a response`,
    `Assigned to: ${assignee?.name ?? 'Unassigned'}`,
    '',
    `Summary: ${contact.summary || '—'}`,
    note ? `\nEscalation note: ${note}` : '',
    '',
    'Please follow up with the client or reassign in the portal.',
  ]
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n');

  const to = withEmail.map((r) => r.email.trim()).join(',');
  const href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { href, missing };
}
