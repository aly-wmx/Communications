import { useState } from 'react';
import { escalate } from '../../lib/tracker/contacts';
import { escalationEmail } from '../../lib/tracker/notify';
import { formatMinutes, slaState } from '../../lib/tracker/sla';
import type { Tracker } from '../../lib/tracker/store';
import type { ClientContact } from '../../lib/tracker/types';
import { Modal } from '../Modal';

interface Props {
  tracker: Tracker;
  contact: ClientContact;
  now: Date;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export function EscalateDialog({ tracker, contact, now, onClose, onDone }: Props) {
  const { team, clients, sla, meId } = tracker;
  const client = clients.find((c) => c.id === contact.clientId);
  const [ids, setIds] = useState(() => team.filter((t) => t.escalation).map((t) => t.id));
  const [note, setNote] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const st = slaState(contact, sla, now);

  const recipients = team.filter((t) => ids.includes(t.id));
  const { href, missing } = escalationEmail(
    contact,
    client,
    recipients,
    team.find((t) => t.id === contact.assigneeId),
    sla,
    note,
    now,
  );
  const canEmail = recipients.length > missing.length;

  const submit = () => {
    if (!ids.length) return;
    tracker.updateContact(contact.id, (c) => escalate(c, meId, ids, note, team, new Date()));
    if (sendEmail && canEmail) window.location.href = href;
    onDone(`Escalated ${client?.name ?? 'contact'} to ${recipients.map((r) => r.name).join(' & ')}.`);
  };

  return (
    <Modal
      narrow
      title="Escalate"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-escalate" disabled={!ids.length}>
            Escalate{sendEmail && canEmail ? ' & email' : ''}
          </button>
        </>
      }
    >
      <p className="span-2 escalate-summary">
        <strong>{client?.name ?? 'Unknown client'}</strong> has waited{' '}
        <strong>{formatMinutes(st.waitedMinutes)}</strong> on a {contact.channel.toLowerCase()}
        {contact.escalations.length > 0 && <> and was already escalated {contact.escalations.length}×</>}.
      </p>
      <fieldset className="span-2 field-set">
        <legend>Notify</legend>
        {team.map((t) => (
          <label key={t.id} className="check">
            <input
              type="checkbox"
              checked={ids.includes(t.id)}
              onChange={(e) => setIds(e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id))}
            />
            {t.name}
            {!t.email && <span className="muted"> (no email set)</span>}
          </label>
        ))}
      </fieldset>
      <label className="field span-2">
        <span>Note (optional)</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it needs attention" />
      </label>
      <label className="check span-2">
        <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} disabled={!canEmail} />
        Open an email to them now
      </label>
      {missing.length > 0 && (
        <p className="hint span-2">
          Add email addresses for {missing.map((m) => m.name).join(' & ')} in Settings so they can be emailed.
        </p>
      )}
    </Modal>
  );
}
