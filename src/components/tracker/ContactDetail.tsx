import { useState } from 'react';
import { formatTimestamp } from '../../lib/dates';
import { assign, markResponded, reopen, resolve, waitOnClient } from '../../lib/tracker/contacts';
import { formatMinutes, slaState } from '../../lib/tracker/sla';
import type { Tracker } from '../../lib/tracker/store';
import { CONTACT_CHANNELS, type ClientContact, type ContactChannel, type ContactPriority } from '../../lib/tracker/types';
import { Modal } from '../Modal';
import { SlaPill } from './SlaPill';
import { toLocalInput } from './LogContact';

interface Props {
  tracker: Tracker;
  contactId: string;
  now: Date;
  onClose: () => void;
  onEscalate: (c: ClientContact) => void;
  onFlash: (msg: string) => void;
}

export function ContactDetail({ tracker, contactId, now, onClose, onEscalate, onFlash }: Props) {
  const { contacts, clients, team, sla, meId } = tracker;
  const contact = contacts.find((c) => c.id === contactId);
  const [summary, setSummary] = useState(contact?.summary ?? '');
  const [channel, setChannel] = useState<ContactChannel>(contact?.channel ?? 'Call');
  const [priority, setPriority] = useState<ContactPriority>(contact?.priority ?? 'Normal');
  const [receivedAt, setReceivedAt] = useState(contact ? toLocalInput(new Date(contact.receivedAt)) : '');
  if (!contact) return null;

  const client = clients.find((c) => c.id === contact.clientId);
  const nameOf = (id: string) => (id ? team.find((t) => t.id === id)?.name ?? 'Former member' : 'System');
  const st = slaState(contact, sla, now);
  const upd = (fn: (c: ClientContact) => ClientContact) => tracker.updateContact(contact.id, fn);

  const dirty =
    summary !== contact.summary ||
    channel !== contact.channel ||
    priority !== contact.priority ||
    receivedAt !== toLocalInput(new Date(contact.receivedAt));

  const saveEdits = () => {
    const when = new Date(receivedAt);
    upd((c) => {
      const changes: string[] = [];
      if (c.priority !== priority) changes.push(`Priority → ${priority}`);
      if (c.channel !== channel) changes.push(`Channel → ${channel}`);
      if (!Number.isNaN(when.getTime()) && when.toISOString() !== c.receivedAt) changes.push('Received time corrected');
      const at = new Date().toISOString();
      return {
        ...c,
        summary: summary.trim(),
        channel,
        priority,
        receivedAt: Number.isNaN(when.getTime()) ? c.receivedAt : when.toISOString(),
        updatedAt: at,
        history: changes.length ? [...c.history, { at, byId: meId, message: changes.join('; ') }] : c.history,
      };
    });
    onFlash('Changes saved.');
  };

  return (
    <Modal
      title={client?.name ?? 'Client contact'}
      onClose={onClose}
      onSubmit={saveEdits}
      footer={
        <>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Delete this contact from the queue? Use Resolve instead if it was handled.')) {
                tracker.deleteContact(contact.id);
                onClose();
              }
            }}
          >
            Delete
          </button>
          <span className="spacer" />
          {contact.status === 'Resolved' ? (
            <button type="button" className="btn" onClick={() => upd((c) => reopen(c, meId))}>
              Reopen
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => onEscalate(contact)}>
                Escalate
              </button>
              <button type="button" className="btn" onClick={() => upd((c) => markResponded(c, meId))}>
                {contact.firstResponseAt ? 'Log another response' : 'Responded'}
              </button>
              <button type="button" className="btn" onClick={() => upd((c) => resolve(c, meId))}>
                Resolve
              </button>
            </>
          )}
          <button type="submit" className="btn btn-primary" disabled={!dirty}>
            Save
          </button>
        </>
      }
    >
      <div className="span-2 detail-head">
        <SlaPill contact={contact} sla={sla} now={now} />
        <span className="badge badge-neutral">{contact.status}</span>
        {client?.project && <span className="muted">{client.project}</span>}
        {client?.phone && (
          <a className="muted" href={`tel:${client.phone}`}>
            {client.phone}
          </a>
        )}
      </div>
      <p className="span-2 muted detail-sla">
        {st.stage === 'responded'
          ? `First response after ${formatMinutes(st.waitedMinutes)} by ${nameOf(contact.respondedById)}.`
          : st.stage === 'paused'
            ? 'Not waiting on us — the SLA clock is stopped.'
            : st.minutesToNext != null
              ? `${formatMinutes(st.minutesToNext)} until ${st.stage === 'ok' ? 'the reminder' : 'escalation'}.`
              : `Past the ${formatMinutes(st.escalateAfter)} escalation threshold.`}
        {sla.businessHours.enabled && ' Counting business hours only.'}
      </p>

      <label className="field">
        <span>Assigned to</span>
        <select value={contact.assigneeId} onChange={(e) => upd((c) => assign(c, e.target.value, meId, team))}>
          <option value="">Unassigned</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select
          value={contact.status}
          onChange={(e) => {
            const v = e.target.value;
            if (v === contact.status) return;
            upd((c) => (v === 'Resolved' ? resolve(c, meId) : v === 'Open' ? reopen(c, meId) : waitOnClient(c, meId)));
          }}
        >
          <option>Open</option>
          <option>Waiting on client</option>
          <option>Resolved</option>
        </select>
      </label>
      <label className="field">
        <span>Channel</span>
        <select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>
          {CONTACT_CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Priority</span>
        <select value={priority} onChange={(e) => setPriority(e.target.value as ContactPriority)}>
          <option>Normal</option>
          <option>Urgent</option>
        </select>
      </label>
      <label className="field span-2">
        <span>Received</span>
        <input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
      </label>
      <label className="field span-2">
        <span>What do they need?</span>
        <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>

      <section className="span-2 history">
        <h3>Timeline</h3>
        <ol>
          {[...contact.history].reverse().map((h, i) => (
            <li key={i}>
              <time>{formatTimestamp(h.at)}</time> {h.message} <span className="muted">· {nameOf(h.byId)}</span>
            </li>
          ))}
        </ol>
      </section>
    </Modal>
  );
}
