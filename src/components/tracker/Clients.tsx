import { useMemo, useState } from 'react';
import { clientSummaries } from '../../lib/tracker/contacts';
import { formatMinutes } from '../../lib/tracker/sla';
import type { Tracker } from '../../lib/tracker/store';
import type { Client } from '../../lib/tracker/types';
import { Modal } from '../Modal';

interface Props {
  tracker: Tracker;
  now: Date;
  onShowQueue: (clientId: string) => void;
  onLogFor: (clientId: string) => void;
  onFlash: (msg: string) => void;
}

const NO_RESPONSE_OPTIONS: Array<[number, string]> = [
  [0, 'All clients'],
  [-1, 'Waiting on us'],
  [24 * 60, 'No response in 1+ day'],
  [3 * 24 * 60, 'No response in 3+ days'],
  [7 * 24 * 60, 'No response in 7+ days'],
];

function ago(iso: string, now: Date): string {
  if (!iso) return '—';
  return `${formatMinutes(Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)))} ago`;
}

export function Clients({ tracker, now, onShowQueue, onLogFor, onFlash }: Props) {
  const { clients, contacts, team, sla } = tracker;
  const [search, setSearch] = useState('');
  const [noResponse, setNoResponse] = useState(0);
  const [editing, setEditing] = useState<Client | 'new' | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientSummaries(clients, contacts, sla, now)
      .filter((r) => !q || `${r.client.name} ${r.client.project}`.toLowerCase().includes(q))
      .filter((r) => {
        if (noResponse === 0) return true;
        if (noResponse === -1) return r.waitingOnUs > 0;
        // Clients who reached out after our last response (or never got one), for longer than N minutes.
        const lastIn = r.lastInboundAt ? new Date(r.lastInboundAt).getTime() : 0;
        const lastOut = r.lastResponseAt ? new Date(r.lastResponseAt).getTime() : 0;
        return lastIn > lastOut && now.getTime() - lastIn >= noResponse * 60_000;
      })
      .sort(
        (a, b) =>
          Number(b.breached) - Number(a.breached) ||
          b.longestWaitMinutes - a.longestWaitMinutes ||
          a.client.name.localeCompare(b.client.name),
      );
  }, [clients, contacts, sla, now, search, noResponse]);

  const ownerName = (id: string) => team.find((t) => t.id === id)?.name ?? '—';

  return (
    <div className="list-view">
      <div className="filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Search clients or projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search clients"
        />
        <select value={noResponse} onChange={(e) => setNoResponse(Number(e.target.value))} aria-label="Response filter">
          {NO_RESPONSE_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          + Add client
        </button>
      </div>

      <div className="list-summary">
        <span className="muted">
          {rows.length} of {clients.length} clients
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">{clients.length ? 'No clients match.' : 'No clients yet. They are added when you log a contact, or with “Add client”.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Owner</th>
                <th>Waiting on us</th>
                <th>Last contact from client</th>
                <th>Last response</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.client.id}>
                  <td>
                    <button type="button" className="link-btn" onClick={() => setEditing(r.client)}>
                      {r.client.name}
                    </button>
                    {r.client.project && <span className="cell-sub">{r.client.project}</span>}
                  </td>
                  <td>{ownerName(r.client.ownerId)}</td>
                  <td>
                    {r.waitingOnUs ? (
                      <span className={`sla sla-${r.breached ? 'bad' : 'warn'}`}>
                        <span aria-hidden className="sla-icon">
                          {r.breached ? '!' : '◔'}
                        </span>
                        <span className="sla-label">{r.waitingOnUs} waiting</span>
                        <span className="sla-time">{formatMinutes(r.longestWaitMinutes)}</span>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="nowrap">{ago(r.lastInboundAt, now)}</td>
                  <td className="nowrap">{ago(r.lastResponseAt, now)}</td>
                  <td className="nowrap">
                    <button type="button" className="btn btn-small" onClick={() => onLogFor(r.client.id)}>
                      Log contact
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn-small btn-ghost"
                      onClick={() => onShowQueue(r.client.id)}
                      disabled={!r.open && !contacts.some((c) => c.clientId === r.client.id)}
                    >
                      View contacts
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ClientForm
          tracker={tracker}
          client={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onFlash(msg);
          }}
        />
      )}
    </div>
  );
}

function ClientForm({
  tracker,
  client,
  onClose,
  onSaved,
}: {
  tracker: Tracker;
  client: Client | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState(() => ({
    name: client?.name ?? '',
    project: client?.project ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    ownerId: client?.ownerId ?? '',
    notes: client?.notes ?? '',
  }));
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const name = form.name.trim();
    if (!name) return setError('Enter the client’s name.');
    const dup = tracker.clients.find((c) => c.id !== client?.id && c.name.trim().toLowerCase() === name.toLowerCase());
    if (dup) return setError('A client with this name already exists.');
    if (client) {
      tracker.updateClient(client.id, { ...form, name });
      onSaved('Client updated.');
    } else {
      tracker.addClient({ ...form, name });
      onSaved('Client added.');
    }
  };

  const contactCount = client ? tracker.contacts.filter((c) => c.clientId === client.id).length : 0;

  return (
    <Modal
      title={client ? 'Edit client' : 'Add client'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          {client && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (confirm(`Delete ${client.name} and their ${contactCount} logged contacts? This cannot be undone.`)) {
                  tracker.deleteClient(client.id);
                  onSaved('Client deleted.');
                }
              }}
            >
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>Name *</span>
        <input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="field">
        <span>Project / job</span>
        <input value={form.project} onChange={(e) => set('project', e.target.value)} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </label>
      <label className="field">
        <span>Email</span>
        <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
      </label>
      <label className="field span-2">
        <span>Owner (new contacts are assigned to them)</span>
        <select value={form.ownerId} onChange={(e) => set('ownerId', e.target.value)}>
          <option value="">Default assignee</option>
          {tracker.team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field span-2">
        <span>Notes</span>
        <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {error && <p className="form-error span-2">{error}</p>}
    </Modal>
  );
}
