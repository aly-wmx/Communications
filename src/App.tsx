import { useMemo, useRef, useState } from 'react';
import { Calendar } from './components/Calendar';
import { CommForm } from './components/CommForm';
import { CommList } from './components/CommList';
import { Dashboard } from './components/Dashboard';
import { today } from './lib/dates';
import { emptyFilters, parseBackup, toCsv, type Filters } from './lib/records';
import { sampleData } from './lib/sample';
import { useCommunications } from './lib/store';
import type { Communication, CommunicationInput } from './lib/types';

type View = 'dashboard' | 'list' | 'calendar' | 'data';

const VIEWS: Array<[View, string]> = [
  ['dashboard', 'Dashboard'],
  ['list', 'Communications log'],
  ['calendar', 'Calendar'],
  ['data', 'Import / export'],
];

type Editing = { record: Communication | null; defaults?: Partial<CommunicationInput> } | null;

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export default function App() {
  const { items, add, update, remove, replaceAll, saveError } = useCommunications();
  const [view, setView] = useState<View>('dashboard');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const importMode = useRef<'merge' | 'replace'>('merge');
  const noticeTimer = useRef<number>(undefined);

  const suggestions = useMemo(
    () => ({
      audiences: uniqueSorted(items.map((c) => c.audience)),
      owners: uniqueSorted(items.map((c) => c.owner)),
    }),
    [items],
  );

  const flash = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3500);
  };

  const drill = (f: Partial<Filters>) => {
    setFilters({ ...emptyFilters, ...f });
    setView('list');
  };

  const exportCsv = (list: Communication[]) =>
    download(`communications-${today()}.csv`, toCsv(list), 'text/csv;charset=utf-8');

  const exportBackup = () =>
    download(
      `communications-backup-${today()}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), communications: items }, null, 2),
      'application/json',
    );

  const importBackup = async (file: File, mode: 'merge' | 'replace') => {
    try {
      const list = parseBackup(await file.text());
      if (mode === 'replace') {
        if (items.length && !confirm(`Replace all ${items.length} existing records with ${list.length} from the backup? This cannot be undone.`)) {
          return;
        }
        replaceAll(list);
      } else {
        const byId = new Map(items.map((c) => [c.id, c]));
        for (const c of list) byId.set(c.id, c);
        replaceAll([...byId.values()]);
      }
      flash(`Imported ${list.length} records.`);
    } catch (err) {
      alert(`Could not import that file: ${(err as Error).message}`);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ✉
          </span>
          <span>Communications Dashboard</span>
        </div>
        <nav className="tabs" aria-label="Views">
          {VIEWS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`tab ${view === key ? 'is-active' : ''}`}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ record: null })}>
          + Log communication
        </button>
      </header>

      {saveError && (
        <div className="alert" role="alert">
          Changes could not be saved in this browser (storage is full or blocked). Export a backup now.
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      <main className="content">
        {items.length === 0 && view !== 'data' ? (
          <div className="welcome">
            <h1>Track every communication in one place</h1>
            <p>
              Log emails, newsletters, press releases, social posts and more. See what is coming up,
              what is waiting on approval and what has gone out.
            </p>
            <div className="welcome-actions">
              <button type="button" className="btn btn-primary" onClick={() => setEditing({ record: null })}>
                Log your first communication
              </button>
              <button type="button" className="btn" onClick={() => replaceAll(sampleData())}>
                Load sample data
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setView('data')}>
                Restore a backup
              </button>
            </div>
          </div>
        ) : view === 'dashboard' ? (
          <Dashboard items={items} onOpen={(c) => setEditing({ record: c })} onDrill={drill} />
        ) : view === 'list' ? (
          <CommList
            items={items}
            filters={filters}
            setFilters={setFilters}
            owners={suggestions.owners}
            onOpen={(c) => setEditing({ record: c })}
            onQuickStatus={(c, status) => {
              const { id: _i, createdAt: _c, updatedAt: _u, history: _h, ...input } = c;
              update(c.id, { ...input, status, sentDate: status === 'Sent' ? input.sentDate || today() : input.sentDate });
              flash(`"${c.title}" marked as ${status.toLowerCase()}.`);
            }}
            onExport={exportCsv}
          />
        ) : view === 'calendar' ? (
          <Calendar
            items={items}
            onOpen={(c) => setEditing({ record: c })}
            onNewOn={(date) => setEditing({ record: null, defaults: { scheduledDate: date, status: 'Scheduled' } })}
          />
        ) : (
          <section className="data-view">
            <div className="panel">
              <h2>Export</h2>
              <p className="muted">
                Records are stored in this browser only. Download a backup regularly, and use it to move
                your log to another computer.
              </p>
              <div className="row-actions">
                <button type="button" className="btn btn-primary" onClick={exportBackup} disabled={!items.length}>
                  Download backup (.json)
                </button>
                <button type="button" className="btn" onClick={() => exportCsv(items)} disabled={!items.length}>
                  Export all to spreadsheet (.csv)
                </button>
              </div>
            </div>
            <div className="panel">
              <h2>Import</h2>
              <p className="muted">
                Restore from a backup file downloaded from this dashboard. Merging keeps your current
                records and updates any that also appear in the backup.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importBackup(f, importMode.current);
                  e.target.value = '';
                }}
              />
              <div className="row-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    importMode.current = 'merge';
                    fileRef.current?.click();
                  }}
                >
                  Merge a backup…
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    importMode.current = 'replace';
                    fileRef.current?.click();
                  }}
                >
                  Replace with a backup…
                </button>
              </div>
            </div>
            <div className="panel">
              <h2>Reset</h2>
              <p className="muted">Remove every record from this browser. Download a backup first.</p>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!items.length}
                onClick={() => {
                  if (confirm(`Delete all ${items.length} records from this browser? This cannot be undone.`)) {
                    replaceAll([]);
                    flash('All records cleared.');
                  }
                }}
              >
                Clear all records
              </button>
            </div>
          </section>
        )}
      </main>

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
              flash('Changes saved.');
            } else {
              add(input);
              flash('Communication logged.');
            }
            setEditing(null);
          }}
          onDelete={
            editing.record
              ? () => {
                  remove(editing.record!.id);
                  setEditing(null);
                  flash('Communication deleted.');
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
