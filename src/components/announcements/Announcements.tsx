import { useState } from 'react';
import { today } from '../../lib/dates';
import { emptyFilters, type Filters } from '../../lib/records';
import { sampleData } from '../../lib/sample';
import type { useCommunications } from '../../lib/store';
import type { Communication, CommunicationInput } from '../../lib/types';
import { Calendar } from './Calendar';
import { CommForm } from './CommForm';
import { CommList } from './CommList';
import { Dashboard } from './Dashboard';

type SubView = 'overview' | 'log' | 'calendar';
type Editing = { record: Communication | null; defaults?: Partial<CommunicationInput> } | null;

interface Props {
  store: ReturnType<typeof useCommunications>;
  onFlash: (msg: string) => void;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Outgoing communications: newsletters, client notices, bulk notifications. */
export function Announcements({ store, onFlash }: Props) {
  const { items, add, update, remove, replaceAll } = store;
  const [view, setView] = useState<SubView>('overview');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [editing, setEditing] = useState<Editing>(null);

  const suggestions = {
    audiences: uniqueSorted(items.map((c) => c.audience)),
    owners: uniqueSorted(items.map((c) => c.owner)),
  };

  const drill = (f: Partial<Filters>) => {
    setFilters({ ...emptyFilters, ...f });
    setView('log');
  };

  return (
    <div className="announcements">
      <div className="subnav">
        <div className="segmented" role="tablist" aria-label="Announcements view">
          {(
            [
              ['overview', 'Overview'],
              ['log', 'Log'],
              ['calendar', 'Calendar'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              className={`seg ${view === key ? 'is-active' : ''}`}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="muted subnav-note">Outgoing notices, newsletters and bulk client notifications</span>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ record: null })}>
          + Log announcement
        </button>
      </div>

      {items.length === 0 ? (
        <div className="welcome">
          <h1>Track outgoing communications</h1>
          <p>Log client notices, newsletters and bulk notifications, and see what is scheduled and what has gone out.</p>
          <div className="welcome-actions">
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ record: null })}>
              Log your first announcement
            </button>
            <button type="button" className="btn" onClick={() => replaceAll(sampleData())}>
              Load sample data
            </button>
          </div>
        </div>
      ) : view === 'overview' ? (
        <Dashboard items={items} onOpen={(c) => setEditing({ record: c })} onDrill={drill} />
      ) : view === 'log' ? (
        <CommList
          items={items}
          filters={filters}
          setFilters={setFilters}
          owners={suggestions.owners}
          onOpen={(c) => setEditing({ record: c })}
          onQuickStatus={(c, status) => {
            const { id: _i, createdAt: _c, updatedAt: _u, history: _h, ...input } = c;
            update(c.id, { ...input, status, sentDate: status === 'Sent' ? input.sentDate || today() : input.sentDate });
            onFlash(`"${c.title}" marked as ${status.toLowerCase()}.`);
          }}
        />
      ) : (
        <Calendar
          items={items}
          onOpen={(c) => setEditing({ record: c })}
          onNewOn={(date) => setEditing({ record: null, defaults: { scheduledDate: date, status: 'Scheduled' } })}
        />
      )}

      {editing && (
        <CommForm
          key={editing.record?.id ?? 'new'}
          record={editing.record}
          defaults={editing.defaults}
          suggestions={suggestions}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            if (editing.record) {
              update(editing.record.id, input);
              onFlash('Changes saved.');
            } else {
              add(input);
              onFlash('Announcement logged.');
            }
            setEditing(null);
          }}
          onDelete={
            editing.record
              ? () => {
                  remove(editing.record!.id);
                  setEditing(null);
                  onFlash('Announcement deleted.');
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
