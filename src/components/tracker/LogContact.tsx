import { useState } from 'react';
import { routeAssignee, type NewContactInput } from '../../lib/tracker/contacts';
import type { Tracker } from '../../lib/tracker/store';
import { CONTACT_CHANNELS, type ContactChannel, type ContactPriority } from '../../lib/tracker/types';
import { Modal } from '../Modal';

/** "YYYY-MM-DDTHH:MM" in local time, for datetime-local inputs. */
export function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

interface Props {
  tracker: Tracker;
  presetClientId?: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function LogContact({ tracker, presetClientId, onClose, onSaved }: Props) {
  const { clients, team, sla } = tracker;
  const preset = clients.find((c) => c.id === presetClientId);
  const [clientName, setClientName] = useState(preset?.name ?? '');
  const [project, setProject] = useState(preset?.project ?? '');
  const [phone, setPhone] = useState(preset?.phone ?? '');
  const [channel, setChannel] = useState<ContactChannel>('Call');
  const [priority, setPriority] = useState<ContactPriority>('Normal');
  const [receivedAt, setReceivedAt] = useState(toLocalInput(new Date()));
  const [summary, setSummary] = useState('');
  const [assigneeId, setAssigneeId] = useState(routeAssignee(preset, sla));
  const [assigneeTouched, setAssigneeTouched] = useState(false);
  const [error, setError] = useState('');

  const match = clients.find((c) => c.name.trim().toLowerCase() === clientName.trim().toLowerCase());

  const pickClient = (name: string) => {
    setClientName(name);
    const c = clients.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (c) {
      setProject(c.project);
      setPhone(c.phone);
      if (!assigneeTouched) setAssigneeId(routeAssignee(c, sla));
    }
  };

  const save = () => {
    if (!clientName.trim()) return setError('Who is the client?');
    const when = new Date(receivedAt);
    if (Number.isNaN(when.getTime())) return setError('Enter when the client reached out.');
    if (when.getTime() > Date.now() + 60_000) return setError('The received time is in the future.');

    const client =
      match ??
      tracker.addClient({ name: clientName, project, phone, email: '', ownerId: '', notes: '' });
    const input: NewContactInput = {
      clientId: client.id,
      channel,
      priority,
      receivedAt: when.toISOString(),
      summary,
      assigneeId,
    };
    tracker.addContact(input);
    onSaved(`Logged ${channel.toLowerCase()} from ${client.name}.`);
  };

  return (
    <Modal
      title="Log a client contact"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add to queue
          </button>
        </>
      }
    >
      <label className="field">
        <span>Client *</span>
        <input
          autoFocus
          list="client-names"
          value={clientName}
          onChange={(e) => pickClient(e.target.value)}
          placeholder="Start typing a client name"
        />
        <datalist id="client-names">
          {clients.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        {clientName.trim() && !match && <small className="hint">New client, will be added to the client list.</small>}
      </label>
      <label className="field">
        <span>Project / job</span>
        <input value={project} onChange={(e) => setProject(e.target.value)} disabled={!!match} />
      </label>
      {!match && (
        <label className="field">
          <span>Client phone</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Channel</span>
        <select value={channel} onChange={(e) => setChannel(e.target.value as ContactChannel)}>
          {CONTACT_CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Received</span>
        <input type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
      </label>
      <label className="field">
        <span>Priority</span>
        <select value={priority} onChange={(e) => setPriority(e.target.value as ContactPriority)}>
          <option>Normal</option>
          <option>Urgent</option>
        </select>
        {priority === 'Urgent' && (
          <small className="hint">
            {sla.urgentEscalateMinutes === 0
              ? 'Urgent contacts need escalating straight away.'
              : `Urgent contacts escalate after ${sla.urgentEscalateMinutes} minutes.`}
          </small>
        )}
      </label>
      <label className="field">
        <span>Assign to</span>
        <select
          value={assigneeId}
          onChange={(e) => {
            setAssigneeId(e.target.value);
            setAssigneeTouched(true);
          }}
        >
          <option value="">Unassigned</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field span-2">
        <span>What do they need?</span>
        <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      {error && <p className="form-error span-2">{error}</p>}
    </Modal>
  );
}
