import { useRef, useState } from 'react';
import { parseBackup } from '../../lib/records';
import type { useCommunications } from '../../lib/store';
import { newId } from '../../lib/tracker/contacts';
import type { Tracker } from '../../lib/tracker/store';
import type { SlaSettings, TeamMember } from '../../lib/tracker/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  tracker: Tracker;
  announcements: ReturnType<typeof useCommunications>;
  onFlash: (msg: string) => void;
}

export function Settings({ tracker, announcements, onFlash }: Props) {
  const { team, setTeam, sla, setSla, meId, setMeId } = tracker;
  const [draft, setDraft] = useState<SlaSettings>(sla);
  const slaDirty = JSON.stringify(draft) !== JSON.stringify(sla);

  const setMember = (id: string, patch: Partial<TeamMember>) =>
    setTeam((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  return (
    <div className="settings">
      <section className="panel">
        <h2>Who is using this browser?</h2>
        <p className="muted">Recorded on every assignment, response and escalation you make.</p>
        <select value={meId} onChange={(e) => setMeId(e.target.value)} aria-label="Acting as">
          <option value="">Choose your name</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </section>

      <section className="panel">
        <h2>Escalation matrix (SLA)</h2>
        <p className="muted">How long a client can wait for a first response before the queue warns and then escalates.</p>
        <div className="sla-grid">
          <label className="field">
            <span>Reminder to the assignee after (minutes)</span>
            <input
              type="number"
              min={1}
              value={draft.reminderMinutes}
              onChange={(e) => setDraft({ ...draft, reminderMinutes: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <label className="field">
            <span>Escalate after (minutes)</span>
            <input
              type="number"
              min={1}
              value={draft.escalateMinutes}
              onChange={(e) => setDraft({ ...draft, escalateMinutes: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <label className="field">
            <span>Escalate urgent contacts after (minutes, 0 = immediately)</span>
            <input
              type="number"
              min={0}
              value={draft.urgentEscalateMinutes}
              onChange={(e) => setDraft({ ...draft, urgentEscalateMinutes: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="field">
            <span>Default assignee for new contacts</span>
            <select value={draft.defaultAssigneeId} onChange={(e) => setDraft({ ...draft, defaultAssigneeId: e.target.value })}>
              <option value="">Unassigned</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="field-set">
          <legend>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.businessHours.enabled}
                onChange={(e) => setDraft({ ...draft, businessHours: { ...draft.businessHours, enabled: e.target.checked } })}
              />
              Only count business hours
            </label>
          </legend>
          <p className="muted">When on, a text that arrives at 9pm doesn’t start ageing until opening time.</p>
          <div className="hours-row" aria-disabled={!draft.businessHours.enabled}>
            <label className="field">
              <span>Opens</span>
              <input
                type="time"
                value={draft.businessHours.start}
                disabled={!draft.businessHours.enabled}
                onChange={(e) => setDraft({ ...draft, businessHours: { ...draft.businessHours, start: e.target.value } })}
              />
            </label>
            <label className="field">
              <span>Closes</span>
              <input
                type="time"
                value={draft.businessHours.end}
                disabled={!draft.businessHours.enabled}
                onChange={(e) => setDraft({ ...draft, businessHours: { ...draft.businessHours, end: e.target.value } })}
              />
            </label>
            <div className="days">
              {DAYS.map((d, i) => (
                <label key={d} className="check">
                  <input
                    type="checkbox"
                    disabled={!draft.businessHours.enabled}
                    checked={draft.businessHours.days.includes(i)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        businessHours: {
                          ...draft.businessHours,
                          days: e.target.checked
                            ? [...draft.businessHours.days, i].sort()
                            : draft.businessHours.days.filter((x) => x !== i),
                        },
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <p className="sla-summary">
          A normal contact turns <strong>amber after {draft.reminderMinutes} min</strong> and{' '}
          <strong>needs escalation after {draft.escalateMinutes} min</strong>
          {draft.businessHours.enabled ? ' of business time' : ''}. Urgent contacts escalate{' '}
          {draft.urgentEscalateMinutes ? `after ${draft.urgentEscalateMinutes} min` : 'immediately'}. Escalations go to{' '}
          {team.filter((t) => t.escalation).map((t) => t.name).join(' & ') || 'nobody yet — tick someone below'}.
        </p>
        {draft.reminderMinutes > draft.escalateMinutes && (
          <p className="form-error">The reminder comes after escalation; it will be skipped.</p>
        )}
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!slaDirty}
            onClick={() => {
              setSla(draft);
              onFlash('Escalation matrix saved.');
            }}
          >
            Save matrix
          </button>
          {slaDirty && (
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(sla)}>
              Discard changes
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Team</h2>
        <p className="muted">People who can be assigned contacts. Tick “Escalations” for whoever gets notified.</p>
        <div className="table-wrap">
          <table className="table team-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Escalations</th>
                <th>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {team.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input aria-label="Name" value={t.name} onChange={(e) => setMember(t.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <input
                      aria-label={`${t.name} email`}
                      type="email"
                      value={t.email}
                      placeholder="name@company.com"
                      onChange={(e) => setMember(t.id, { email: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`${t.name} phone`}
                      type="tel"
                      value={t.phone}
                      onChange={(e) => setMember(t.id, { phone: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${t.name} receives escalations`}
                      checked={t.escalation}
                      onChange={(e) => setMember(t.id, { escalation: e.target.checked })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-ghost"
                      onClick={() => {
                        const open = tracker.contacts.filter((c) => c.assigneeId === t.id && c.status !== 'Resolved').length;
                        const msg = open
                          ? `Remove ${t.name}? Their ${open} open contacts will become unassigned.`
                          : `Remove ${t.name}?`;
                        if (!confirm(msg)) return;
                        tracker.setContacts((prev) => prev.map((c) => (c.assigneeId === t.id ? { ...c, assigneeId: '' } : c)));
                        setTeam((prev) => prev.filter((x) => x.id !== t.id));
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn"
            onClick={() => setTeam((prev) => [...prev, { id: newId('tm'), name: 'New member', email: '', phone: '', escalation: false }])}
          >
            + Add team member
          </button>
        </div>
      </section>

      <DataPanel tracker={tracker} announcements={announcements} onFlash={onFlash} />
    </div>
  );
}

/** Temporary safety net while data lives in the browser; removed once the portal has a shared database. */
function DataPanel({ tracker, announcements, onFlash }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const download = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      contacts: tracker.contacts,
      clients: tracker.clients,
      team: tracker.team,
      sla: tracker.sla,
      communications: announcements.items,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `portal-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.contacts) || !Array.isArray(data.clients) || !Array.isArray(data.team) || !data.sla) {
        throw new Error('This is not a tracker backup file.');
      }
      if (!confirm(`Replace everything in this browser with the backup (${data.contacts.length} contacts, ${data.clients.length} clients)?`)) return;
      tracker.setContacts(data.contacts);
      tracker.setClients(data.clients);
      tracker.setTeam(data.team);
      tracker.setSla(data.sla);
      if (Array.isArray(data.communications)) announcements.replaceAll(parseBackup(JSON.stringify(data.communications)));
      onFlash('Backup restored.');
    } catch (err) {
      alert(`Could not restore: ${(err as Error).message}`);
    }
  };

  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="muted">
        Until the portal is connected to its shared database, everything here is stored in this browser only. Download a
        backup at the end of each day; it can also move the data to another computer.
      </p>
      <div className="row-actions">
        <button type="button" className="btn" onClick={download}>
          Download backup
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Restore backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
