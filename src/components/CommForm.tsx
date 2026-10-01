import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatTimestamp } from '../lib/dates';
import {
  CHANNELS,
  PRIORITIES,
  STATUSES,
  emptyInput,
  type Communication,
  type CommunicationInput,
} from '../lib/types';

interface Props {
  record: Communication | null;
  /** Prefill for new records, e.g. a date clicked on the calendar. */
  defaults?: Partial<CommunicationInput>;
  suggestions: { audiences: string[]; owners: string[] };
  onSave: (input: CommunicationInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function fromRecord(r: Communication): CommunicationInput {
  const { id: _id, createdAt: _c, updatedAt: _u, history: _h, ...input } = r;
  return input;
}

export function CommForm({ record, defaults, suggestions, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<CommunicationInput>(() =>
    record ? fromRecord(record) : { ...emptyInput(), ...defaults },
  );
  const [tagText, setTagText] = useState(form.tags.join(', '));
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (dlg && !dlg.open) dlg.showModal?.();
  }, []);

  const set = <K extends keyof CommunicationInput>(key: K, value: CommunicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError('Please give this communication a title.');
      return;
    }
    // A sent date implies it went out; keep status honest.
    const status =
      form.sentDate && form.status !== 'Cancelled' ? 'Sent' : form.status;
    onSave({ ...form, status, tags: tagText.split(',') });
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="form-title"
    >
      <form onSubmit={submit}>
        <header className="modal-head">
          <h2 id="form-title">{record ? 'Edit communication' : 'Log a communication'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          <label className="field span-2">
            <span>Title *</span>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. October staff newsletter"
            />
          </label>
          {error && <p className="form-error span-2">{error}</p>}

          <label className="field">
            <span>Channel</span>
            <select value={form.channel} onChange={(e) => set('channel', e.target.value as never)}>
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => set('status', e.target.value as never)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Audience</span>
            <input
              list="audience-list"
              value={form.audience}
              onChange={(e) => set('audience', e.target.value)}
              placeholder="e.g. All staff, Media, Parents"
            />
            <datalist id="audience-list">
              {suggestions.audiences.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={form.priority} onChange={(e) => set('priority', e.target.value as never)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Owner</span>
            <input
              list="owner-list"
              value={form.owner}
              onChange={(e) => set('owner', e.target.value)}
              placeholder="Who is responsible"
            />
            <datalist id="owner-list">
              {suggestions.owners.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Requested by</span>
            <input
              value={form.requestedBy}
              onChange={(e) => set('requestedBy', e.target.value)}
              placeholder="Department or person"
            />
          </label>

          <label className="field">
            <span>Scheduled date</span>
            <input
              type="date"
              value={form.scheduledDate}
              onChange={(e) => set('scheduledDate', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Sent / published date</span>
            <input
              type="date"
              value={form.sentDate}
              onChange={(e) => set('sentDate', e.target.value)}
            />
          </label>

          <label className="field">
            <span>Reach (recipients / views)</span>
            <input
              type="number"
              min={0}
              value={form.reach ?? ''}
              onChange={(e) => set('reach', e.target.value === '' ? null : Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Link</span>
            <input
              type="url"
              value={form.link}
              onChange={(e) => set('link', e.target.value)}
              placeholder="https://"
            />
          </label>

          <label className="field span-2">
            <span>Tags (comma separated)</span>
            <input value={tagText} onChange={(e) => setTagText(e.target.value)} />
          </label>
          <label className="field span-2">
            <span>Key message / summary</span>
            <textarea
              rows={2}
              value={form.summary}
              onChange={(e) => set('summary', e.target.value)}
            />
          </label>
          <label className="field span-2">
            <span>Notes</span>
            <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>

          {record && record.history.length > 0 && (
            <section className="span-2 history">
              <h3>History</h3>
              <ol>
                {[...record.history].reverse().map((h, i) => (
                  <li key={i}>
                    <time>{formatTimestamp(h.at)}</time> {h.message}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <footer className="modal-foot">
          {onDelete && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (confirm(`Delete "${record?.title}"? This cannot be undone.`)) onDelete();
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
            {record ? 'Save changes' : 'Add communication'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
