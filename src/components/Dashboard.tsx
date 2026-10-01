import { addDays, formatDate, parseDateKey, today } from '../lib/dates';
import { computeStats, isOverdue, sortRecords, type Filters } from '../lib/records';
import type { Communication } from '../lib/types';
import { OverdueTag, PriorityTag, StatusBadge } from './Badges';

interface Props {
  items: Communication[];
  onOpen: (c: Communication) => void;
  onDrill: (f: Partial<Filters>) => void;
}

function Tile(props: { label: string; value: number | string; note?: string; tone?: 'bad'; onClick?: () => void }) {
  const body = (
    <>
      <span className="tile-label">{props.label}</span>
      <span className={`tile-value ${props.tone === 'bad' ? 'tone-bad' : ''}`}>{props.value}</span>
      {props.note && <span className="tile-note">{props.note}</span>}
    </>
  );
  return props.onClick ? (
    <button type="button" className="tile tile-link" onClick={props.onClick}>
      {body}
    </button>
  ) : (
    <div className="tile">{body}</div>
  );
}

/** Single-series horizontal bars with direct value labels. */
function BarList({ rows, onPick }: { rows: Array<{ label: string; count: number }>; onPick?: (label: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="empty-small">Nothing logged yet.</p>;
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <button
            type="button"
            className="barlist-row"
            onClick={() => onPick?.(r.label)}
            disabled={!onPick}
            title={`${r.label}: ${r.count}`}
          >
            <span className="barlist-label">{r.label}</span>
            <span className="barlist-track">
              <span className="barlist-bar" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="barlist-value">{r.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Vertical column chart of sent communications per month. */
function MonthlyColumns({ rows }: { rows: Array<{ month: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="columns" role="img" aria-label="Communications sent per month, last six months">
      {rows.map((r) => {
        const label = parseDateKey(`${r.month}-01`).toLocaleDateString(undefined, { month: 'short' });
        return (
          <div className="column" key={r.month} title={`${label}: ${r.count} sent`}>
            <span className="column-value">{r.count || ''}</span>
            <span className="column-track">
              <span className="column-bar" style={{ height: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="column-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ItemRow({ c, onOpen, showDate }: { c: Communication; onOpen: (c: Communication) => void; showDate: string }) {
  return (
    <li>
      <button type="button" className="item-row" onClick={() => onOpen(c)}>
        <span className="item-date">{formatDate(showDate)}</span>
        <span className="item-main">
          <span className="item-title">{c.title}</span>
          <span className="item-meta">
            {c.channel}
            {c.audience && ` · ${c.audience}`}
          </span>
        </span>
        <span className="item-tags">
          {isOverdue(c) && <OverdueTag />}
          <PriorityTag priority={c.priority} />
          <StatusBadge status={c.status} />
        </span>
      </button>
    </li>
  );
}

export function Dashboard({ items, onOpen, onDrill }: Props) {
  const t = today();
  const stats = computeStats(items, t);
  const in14 = addDays(t, 14);

  const upcoming = sortRecords(
    items.filter(
      (c) =>
        c.status !== 'Sent' &&
        c.status !== 'Cancelled' &&
        c.scheduledDate &&
        c.scheduledDate <= in14,
    ),
    'date',
    false,
  ).slice(0, 8);

  const recent = sortRecords(
    items.filter((c) => c.status === 'Sent'),
    'date',
    true,
  ).slice(0, 6);

  const noDate = items.filter(
    (c) => !c.scheduledDate && c.status !== 'Sent' && c.status !== 'Cancelled',
  ).length;

  return (
    <div className="dashboard">
      <section className="tiles">
        <Tile label="Sent this month" value={stats.sentThisMonth} note={stats.reachThisMonth ? `${stats.reachThisMonth.toLocaleString()} reached` : undefined} />
        <Tile label="Due in next 7 days" value={stats.upcoming7} onClick={() => onDrill({ from: t, to: addDays(t, 7) })} />
        <Tile label="Awaiting approval" value={stats.awaitingApproval} onClick={() => onDrill({ status: 'In review' })} />
        <Tile
          label="Overdue"
          value={stats.overdue}
          tone={stats.overdue ? 'bad' : undefined}
          note={stats.overdue ? 'Past scheduled date, not sent' : 'All on track'}
          onClick={() => onDrill({ overdueOnly: true })}
        />
        <Tile label="Total logged" value={stats.total} onClick={() => onDrill({})} />
      </section>

      <section className="panel panel-wide">
        <header className="panel-head">
          <h2>Coming up</h2>
          <span className="muted">Overdue and next 14 days</span>
        </header>
        {upcoming.length ? (
          <ul className="item-list">
            {upcoming.map((c) => (
              <ItemRow key={c.id} c={c} onOpen={onOpen} showDate={c.scheduledDate} />
            ))}
          </ul>
        ) : (
          <p className="empty-small">Nothing scheduled in the next two weeks.</p>
        )}
        {noDate > 0 && (
          <p className="panel-foot muted">
            {noDate} open {noDate === 1 ? 'item has' : 'items have'} no scheduled date yet.
          </p>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Pipeline</h2>
        </header>
        <BarList
          rows={stats.byStatus.map((s) => ({ label: s.status, count: s.count }))}
          onPick={(label) => onDrill({ status: label as never })}
        />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>By channel</h2>
          <span className="muted">Excludes cancelled</span>
        </header>
        <BarList
          rows={stats.byChannel.map((r) => ({ label: r.channel, count: r.count }))}
          onPick={(label) => onDrill({ channel: label as never })}
        />
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Sent per month</h2>
        </header>
        <MonthlyColumns rows={stats.monthly} />
      </section>

      <section className="panel panel-wide">
        <header className="panel-head">
          <h2>Recently sent</h2>
        </header>
        {recent.length ? (
          <ul className="item-list">
            {recent.map((c) => (
              <ItemRow key={c.id} c={c} onOpen={onOpen} showDate={c.sentDate} />
            ))}
          </ul>
        ) : (
          <p className="empty-small">Nothing marked as sent yet.</p>
        )}
      </section>
    </div>
  );
}
