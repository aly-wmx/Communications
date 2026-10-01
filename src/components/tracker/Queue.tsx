import { useMemo, useState } from 'react';
import { matchesFilter, queueStats, sortQueue, type QueueFilter } from '../../lib/tracker/contacts';
import { formatMinutes, needsEscalation } from '../../lib/tracker/sla';
import type { Tracker } from '../../lib/tracker/store';
import type { ClientContact } from '../../lib/tracker/types';
import { SlaPill } from './SlaPill';
import { Tile } from '../Tile';

interface Props {
  tracker: Tracker;
  now: Date;
  clientFilter: string;
  setClientFilter: (id: string) => void;
  onOpen: (c: ClientContact) => void;
  onEscalate: (c: ClientContact) => void;
  onResponded: (c: ClientContact) => void;
  onAssign: (c: ClientContact, assigneeId: string) => void;
}

const FILTERS: Array<[QueueFilter, string]> = [
  ['waiting', 'Waiting on us'],
  ['escalate', 'Needs escalation'],
  ['overdue', 'Overdue'],
  ['escalated', 'Escalated'],
  ['client', 'Waiting on client'],
  ['resolved', 'Resolved'],
  ['all', 'All'],
];

function timeAgo(iso: string, now: Date): string {
  return `${formatMinutes(Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)))} ago`;
}

export function Queue({ tracker, now, clientFilter, setClientFilter, onOpen, onEscalate, onResponded, onAssign }: Props) {
  const { contacts, clients, team, sla } = tracker;
  const [filter, setFilter] = useState<QueueFilter>(clientFilter ? 'all' : 'waiting');
  const [assignee, setAssignee] = useState('');

  const stats = useMemo(() => queueStats(contacts, sla, now), [contacts, sla, now]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(([f]) => [f, contacts.filter((c) => matchesFilter(c, f, sla, now)).length])),
    [contacts, sla, now],
  );
  const rows = useMemo(
    () =>
      sortQueue(
        contacts.filter(
          (c) =>
            matchesFilter(c, filter, sla, now) &&
            (!assignee || (assignee === '-' ? !c.assigneeId : c.assigneeId === assignee)) &&
            (!clientFilter || c.clientId === clientFilter),
        ),
        sla,
        now,
      ),
    [contacts, filter, assignee, clientFilter, sla, now],
  );

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const nameOf = (id: string) => team.find((t) => t.id === id)?.name ?? 'Unassigned';
  const filteredClient = clientFilter ? clientById.get(clientFilter) : undefined;

  return (
    <div className="queue">
      <section className="tiles tiles-6">
        <Tile label="Waiting on us" value={stats.waiting} onClick={() => setFilter('waiting')} />
        <Tile
          label="Needs escalation"
          value={stats.needsEscalation}
          tone={stats.needsEscalation ? 'bad' : undefined}
          note={stats.needsEscalation ? 'Past SLA, nobody escalated yet' : 'Nothing to escalate'}
          onClick={() => setFilter('escalate')}
        />
        <Tile label="Overdue" value={stats.overdue} tone={stats.overdue ? 'bad' : undefined} onClick={() => setFilter('overdue')} />
        <Tile label="Escalated, still open" value={stats.escalatedOpen} onClick={() => setFilter('escalated')} />
        <Tile
          label="Median first response"
          value={stats.medianResponse7d == null ? '—' : formatMinutes(stats.medianResponse7d)}
          note={stats.withinSla7d == null ? 'Last 7 days' : `${Math.round(stats.withinSla7d * 100)}% within SLA · 7 days`}
        />
        <Tile label="Resolved today" value={stats.resolvedToday} onClick={() => setFilter('resolved')} />
      </section>

      {stats.byAssignee.length > 0 && (
        <section className="workload" aria-label="Open contacts by person">
          {stats.byAssignee.map((a) => (
            <button
              key={a.id || 'none'}
              type="button"
              className={`workload-chip ${assignee === (a.id || '-') ? 'is-active' : ''}`}
              onClick={() => setAssignee(assignee === (a.id || '-') ? '' : a.id || '-')}
            >
              <strong>{a.id ? nameOf(a.id) : 'Unassigned'}</strong> {a.open} open
              {a.overdue > 0 && <span className="badge badge-bad">{a.overdue} overdue</span>}
            </button>
          ))}
        </section>
      )}

      <div className="filters">
        <div className="segmented" role="tablist" aria-label="Queue filter">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`seg ${filter === key ? 'is-active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="seg-count">{counts[key]}</span>
            </button>
          ))}
        </div>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assigned to">
          <option value="">Everyone</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="-">Unassigned</option>
        </select>
        {filteredClient && (
          <button type="button" className="btn btn-small" onClick={() => setClientFilter('')}>
            Client: {filteredClient.name} ×
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          {filter === 'waiting' ? 'Nobody is waiting on a response. 🎉' : 'Nothing here.'}
        </p>
      ) : (
        <ul className="queue-list">
          {rows.map((c) => {
            const client = clientById.get(c.clientId);
            const flag = needsEscalation(c, sla, now);
            return (
              <li key={c.id} className={`queue-row ${flag ? 'is-flagged' : ''}`}>
                <div className="queue-sla">
                  <SlaPill contact={c} sla={sla} now={now} />
                </div>
                <button type="button" className="queue-main" onClick={() => onOpen(c)}>
                  <span className="queue-client">
                    {client?.name ?? 'Unknown client'}
                    {client?.project && <span className="muted"> · {client.project}</span>}
                    {c.priority === 'Urgent' && <span className="badge badge-bad">Urgent</span>}
                    {c.escalations.length > 0 && <span className="badge badge-warn">Escalated</span>}
                  </span>
                  <span className="queue-summary">{c.summary || <em className="muted">No summary</em>}</span>
                  <span className="queue-meta">
                    {c.channel} · received {timeAgo(c.receivedAt, now)}
                  </span>
                </button>
                <label className="queue-assign">
                  <span className="sr-only">Assigned to</span>
                  <select value={c.assigneeId} onChange={(e) => onAssign(c, e.target.value)}>
                    <option value="">Unassigned</option>
                    {team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="queue-actions">
                  {c.status === 'Open' && (
                    <button type="button" className="btn btn-small" onClick={() => onResponded(c)}>
                      Responded
                    </button>
                  )}
                  {c.status !== 'Resolved' && (
                    <button
                      type="button"
                      className={`btn btn-small ${flag ? 'btn-escalate' : ''}`}
                      onClick={() => onEscalate(c)}
                    >
                      Escalate
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
