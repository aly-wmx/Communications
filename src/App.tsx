import { useRef, useState } from 'react';
import { Announcements } from './components/announcements/Announcements';
import { Clients } from './components/tracker/Clients';
import { ContactDetail } from './components/tracker/ContactDetail';
import { EscalateDialog } from './components/tracker/EscalateDialog';
import { LogContact } from './components/tracker/LogContact';
import { Queue } from './components/tracker/Queue';
import { Settings } from './components/tracker/Settings';
import { useNow } from './lib/persist';
import { useCommunications } from './lib/store';
import { assign, markResponded, queueStats } from './lib/tracker/contacts';
import { trackerSample } from './lib/tracker/sample';
import { useTracker } from './lib/tracker/store';
import type { ClientContact } from './lib/tracker/types';

type View = 'queue' | 'clients' | 'announcements' | 'settings';

export default function App() {
  const tracker = useTracker();
  const announcements = useCommunications();
  const now = useNow();
  const [view, setView] = useState<View>('queue');
  const [clientFilter, setClientFilter] = useState('');
  const [logging, setLogging] = useState<{ clientId?: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [escalating, setEscalating] = useState<ClientContact | null>(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number>(undefined);

  const flash = (msg: string) => {
    setNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3500);
  };

  const { contacts, team, meId } = tracker;
  const me = team.find((t) => t.id === meId);
  const stats = queueStats(contacts, tracker.sla, now);

  const tabs: Array<[View, string, number?]> = [
    ['queue', 'Client queue', stats.needsEscalation || undefined],
    ['clients', 'Clients'],
    ['announcements', 'Announcements'],
    ['settings', 'Settings'],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ✉
          </span>
          <span className="brand-text">
            <span className="brand-org">Watermark Design Build</span>
            <span>Client Communications</span>
          </span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {tabs.map(([key, label, badge]) => (
            <button
              key={key}
              type="button"
              className={`tab ${view === key ? 'is-active' : ''}`}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => setView(key)}
            >
              {label}
              {badge ? (
                <span className="tab-badge" aria-label={`${badge} need escalation`}>
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
        <label className="acting-as">
          <span className="muted">You are</span>
          <select value={meId} onChange={(e) => tracker.setMeId(e.target.value)} className={!me ? 'needs-attention' : ''}>
            <option value="">Choose…</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {(view === 'queue' || view === 'clients') && (
          <button type="button" className="btn btn-primary" onClick={() => setLogging({})}>
            + Log client contact
          </button>
        )}
      </header>

      {(tracker.saveError || announcements.saveError) && (
        <div className="alert" role="alert">
          Changes could not be saved in this browser (storage is full or blocked). Download a backup from Settings now.
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}

      <main className="content">
        {view === 'queue' &&
          (contacts.length === 0 ? (
            <div className="welcome">
              <h1>Every client waiting on a response, in one place</h1>
              <p>
                Log calls, texts, voicemails and portal messages as they come in. The queue shows who owns each one, how
                long the client has waited, and when it needs escalating.
              </p>
              <div className="welcome-actions">
                <button type="button" className="btn btn-primary" onClick={() => setLogging({})}>
                  Log a client contact
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const s = trackerSample(team);
                    tracker.setClients((prev) => [...prev, ...s.clients]);
                    tracker.setContacts(s.contacts);
                  }}
                >
                  Load sample data
                </button>
              </div>
            </div>
          ) : (
            <Queue
              tracker={tracker}
              now={now}
              clientFilter={clientFilter}
              setClientFilter={setClientFilter}
              onOpen={(c) => setOpenId(c.id)}
              onEscalate={setEscalating}
              onResponded={(c) => {
                tracker.updateContact(c.id, (x) => markResponded(x, meId));
                flash('Marked as responded. Now waiting on the client.');
              }}
              onAssign={(c, id) => tracker.updateContact(c.id, (x) => assign(x, id, meId, team))}
            />
          ))}
        {view === 'clients' && (
          <Clients
            tracker={tracker}
            now={now}
            onFlash={flash}
            onLogFor={(clientId) => setLogging({ clientId })}
            onShowQueue={(clientId) => {
              setClientFilter(clientId);
              setView('queue');
            }}
          />
        )}
        {view === 'announcements' && <Announcements store={announcements} onFlash={flash} />}
        {view === 'settings' && <Settings tracker={tracker} announcements={announcements} onFlash={flash} />}
      </main>

      {logging && (
        <LogContact
          tracker={tracker}
          presetClientId={logging.clientId}
          onClose={() => setLogging(null)}
          onSaved={(msg) => {
            setLogging(null);
            setView('queue');
            flash(msg);
          }}
        />
      )}
      {openId && !escalating && (
        <ContactDetail
          key={openId}
          tracker={tracker}
          contactId={openId}
          now={now}
          onClose={() => setOpenId(null)}
          onEscalate={setEscalating}
          onFlash={flash}
        />
      )}
      {escalating && (
        <EscalateDialog
          tracker={tracker}
          contact={escalating}
          now={now}
          onClose={() => setEscalating(null)}
          onDone={(msg) => {
            setEscalating(null);
            flash(msg);
          }}
        />
      )}
    </div>
  );
}
