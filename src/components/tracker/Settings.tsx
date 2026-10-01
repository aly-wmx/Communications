import { useEffect, useState } from 'react';
import { newId } from '../../lib/tracker/contacts';
import type { Tracker } from '../../lib/tracker/store';
import type { SlaSettings, TeamMember } from '../../lib/tracker/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  tracker: Tracker;
  onFlash: (msg: string) => void;
}

export function Settings({ tracker, onFlash }: Props) {
  const { team, setTeam, sla, setSla } = tracker;
  const [draft, setDraft] = useState<SlaSettings>(sla);
  const slaDirty = JSON.stringify(draft) !== JSON.stringify(sla);

  const setMember = (id: string, patch: Partial<TeamMember>) =>
    setTeam((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  return (
    <div className="settings">

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
              void setSla(draft);
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
        <p className="muted">
          People who can be assigned contacts. <strong>Anyone with an email here can sign in</strong> and see every
          client; clear or remove an email to take access away. Tick “Escalations” for whoever gets notified.
        </p>
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
                    <BlurInput label="Name" value={t.name} onCommit={(v) => (v.trim() ? setMember(t.id, { name: v.trim() }) : false)} />
                  </td>
                  <td>
                    <BlurInput
                      label={`${t.name} email`}
                      type="email"
                      value={t.email}
                      placeholder="name@company.com"
                      disabled={t.id === tracker.meId}
                      title={t.id === tracker.meId ? 'You can’t change your own sign-in email here.' : undefined}
                      onCommit={(v) => {
                        const email = v.trim().toLowerCase();
                        if (email && team.some((x) => x.id !== t.id && x.email.toLowerCase() === email)) {
                          alert('Another team member already uses that email.');
                          return false;
                        }
                        setMember(t.id, { email });
                      }}
                    />
                  </td>
                  <td>
                    <BlurInput label={`${t.name} phone`} type="tel" value={t.phone} onCommit={(v) => setMember(t.id, { phone: v.trim() })} />
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
                      disabled={t.id === tracker.meId}
                      title={t.id === tracker.meId ? 'You can’t remove yourself.' : undefined}
                      onClick={() => {
                        const open = tracker.contacts.filter((c) => c.assigneeId === t.id && c.status !== 'Resolved').length;
                        const msg = open
                          ? `Remove ${t.name}? They lose access, and their ${open} open contacts become unassigned.`
                          : `Remove ${t.name}? They lose access to the tracker.`;
                        if (!confirm(msg)) return;
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

    </div>
  );
}

/** Text input that saves when you leave the field, so live updates don't fight your typing. */
function BlurInput({
  label,
  value,
  onCommit,
  type = 'text',
  placeholder,
  disabled,
  title,
}: {
  label: string;
  value: string;
  /** Return false to reject the edit and restore the saved value. */
  onCommit: (v: string) => void | boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  return (
    <input
      aria-label={label}
      type={type}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      onBlur={() => {
        setFocused(false);
        if (draft !== value && onCommit(draft) === false) setDraft(value);
      }}
    />
  );
}
