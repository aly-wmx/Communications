import { useMemo, useState } from 'react';
import { formatDate } from '../../lib/dates';
import {
  applyFilters,
  emptyFilters,
  isOverdue,
  sortRecords,
  type Filters,
  type SortKey,
} from '../../lib/records';
import { CHANNELS, STATUSES, type Communication } from '../../lib/types';
import { OverdueTag, PriorityTag, StatusBadge } from './Badges';

interface Props {
  items: Communication[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  owners: string[];
  onOpen: (c: Communication) => void;
  onQuickStatus: (c: Communication, status: Communication['status']) => void;
}

const COLUMNS: Array<[SortKey, string]> = [
  ['date', 'Date'],
  ['title', 'Communication'],
  ['channel', 'Channel'],
  ['status', 'Status'],
];

export function CommList({ items, filters, setFilters, owners, onOpen, onQuickStatus }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
  const rows = useMemo(
    () => sortRecords(applyFilters(items, filters), sort.key, sort.desc),
    [items, filters, sort],
  );
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters({ ...filters, [k]: v });
  const active = JSON.stringify(filters) !== JSON.stringify(emptyFilters);

  return (
    <div className="list-view">
      <div className="filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Search title, audience, notes, tags…"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          aria-label="Search"
        />
        <select value={filters.status} onChange={(e) => set('status', e.target.value as never)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={filters.channel} onChange={(e) => set('channel', e.target.value as never)} aria-label="Channel">
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={filters.owner} onChange={(e) => set('owner', e.target.value)} aria-label="Owner">
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <label className="filter-date">
          From <input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="filter-date">
          To <input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.overdueOnly}
            onChange={(e) => set('overdueOnly', e.target.checked)}
          />
          Overdue only
        </label>
        {active && (
          <button type="button" className="btn btn-ghost" onClick={() => setFilters(emptyFilters)}>
            Clear filters
          </button>
        )}
      </div>

      <div className="list-summary">
        <span className="muted">
          {rows.length} of {items.length} communications
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No communications match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
                    <button
                      type="button"
                      className="th-btn"
                      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }))}
                    >
                      {label}
                      {sort.key === key && <span aria-hidden>{sort.desc ? ' ↓' : ' ↑'}</span>}
                    </button>
                  </th>
                ))}
                <th>Audience</th>
                <th>Owner</th>
                <th>
                  <span className="sr-only">Quick update</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="nowrap">
                    {formatDate(c.sentDate || c.scheduledDate)}
                    {!c.sentDate && c.scheduledDate && <span className="cell-sub">planned</span>}
                  </td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => onOpen(c)}>
                      {c.title}
                    </button>
                    {c.tags.length > 0 && <span className="cell-sub">{c.tags.join(' · ')}</span>}
                  </td>
                  <td>{c.channel}</td>
                  <td>
                    <span className="badge-stack">
                      <StatusBadge status={c.status} />
                      {isOverdue(c) && <OverdueTag />}
                      <PriorityTag priority={c.priority} />
                    </span>
                  </td>
                  <td>{c.audience || <span className="muted">—</span>}</td>
                  <td>{c.owner || <span className="muted">—</span>}</td>
                  <td className="nowrap">
                    {c.status !== 'Sent' && c.status !== 'Cancelled' && (
                      <button type="button" className="btn btn-small" onClick={() => onQuickStatus(c, 'Sent')}>
                        Mark sent
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
