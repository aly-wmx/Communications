import { useState } from 'react';
import { toDateKey, today } from '../../lib/dates';
import { effectiveDate, isOverdue } from '../../lib/records';
import type { Communication } from '../../lib/types';

interface Props {
  items: Communication[];
  onOpen: (c: Communication) => void;
  onNewOn: (date: string) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Calendar({ items, onOpen, onNewOn }: Props) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const t = today();

  const first = new Date(cursor.y, cursor.m, 1);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateKey(new Date(cursor.y, cursor.m, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);

  const byDay = new Map<string, Communication[]>();
  for (const c of items) {
    const d = effectiveDate(c);
    if (!d || c.status === 'Cancelled') continue;
    byDay.set(d, [...(byDay.get(d) ?? []), c]);
  }

  const move = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="calendar">
      <div className="cal-head">
        <button type="button" className="btn btn-small" onClick={() => move(-1)} aria-label="Previous month">
          ‹
        </button>
        <h2>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <button type="button" className="btn btn-small" onClick={() => move(1)} aria-label="Next month">
          ›
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}
        >
          Today
        </button>
        <span className="muted cal-hint">Click an empty part of a day to log a communication on it.</span>
      </div>
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday" role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((key, i) =>
          key ? (
            <div
              key={key}
              className={`cal-day ${key === t ? 'is-today' : ''}`}
              role="gridcell"
              onClick={(e) => {
                if (e.target === e.currentTarget) onNewOn(key);
              }}
            >
              <span className="cal-num">{Number(key.slice(8))}</span>
              {(byDay.get(key) ?? []).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`cal-item cal-${c.status === 'Sent' ? 'sent' : isOverdue(c) ? 'overdue' : 'planned'}`}
                  onClick={() => onOpen(c)}
                  title={`${c.title} — ${c.channel}, ${c.status}`}
                >
                  {c.title}
                </button>
              ))}
            </div>
          ) : (
            <div key={`pad-${i}`} className="cal-day cal-pad" />
          ),
        )}
      </div>
      <p className="cal-legend muted">
        <span className="cal-item cal-sent">Sent</span>
        <span className="cal-item cal-planned">Planned</span>
        <span className="cal-item cal-overdue">Overdue</span>
      </p>
    </div>
  );
}
