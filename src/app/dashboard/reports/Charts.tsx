"use client";

import { useState } from "react";

/** Single-series charts for Reports. One validated hue; values on hover; a data table under each. */
const BAR = "#2a78d6";

export interface Point {
  label: string;
  value: number | null;
  /** Text shown in the tooltip and table, e.g. "12 contacts" or "84%". */
  display: string;
}

function DataTable({ title, points, unit }: { title: string; points: Point[]; unit: string }) {
  return (
    <details className="mt-2 text-xs text-zinc-600">
      <summary className="cursor-pointer select-none text-zinc-500 hover:text-zinc-800">Show data</summary>
      <table className="mt-1 w-full">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="py-0.5 font-medium">Period</th>
            <th className="py-0.5 text-right font-medium">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label} className="border-t border-zinc-100">
              <td className="py-0.5">{p.label}</td>
              <td className="py-0.5 text-right tabular-nums">{p.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Vertical columns over time (e.g. one per week). */
export function ColumnChart({ title, subtitle, points, max, unit }: { title: string; subtitle?: string; points: Point[]; max?: number; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(1, max ?? Math.max(0, ...points.map((p) => p.value ?? 0)));
  const last = points.length - 1;

  return (
    <figure className="rounded-lg border border-zinc-200 bg-white p-4">
      <figcaption>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </figcaption>
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">No data in this range.</p>
      ) : (
        <>
          <div className="relative mt-5 h-40" role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.display}`).join(", ")}`}>
            {/* Recessive guides at 0, 50% and 100% of the scale */}
            {[0, 0.5, 1].map((g) => (
              <div key={g} className="absolute inset-x-0 border-t border-zinc-100" style={{ bottom: `${g * 100}%` }}>
                <span className="absolute -top-2.5 right-0 bg-white pl-1 text-[10px] tabular-nums text-zinc-400">
                  {max === 100 ? `${Math.round(g * 100)}%` : Math.round(g * top)}
                </span>
              </div>
            ))}
            <div className="absolute inset-0 right-8 flex items-end gap-[2px]">
              {points.map((p, i) => (
                <div
                  key={p.label}
                  className="relative flex h-full flex-1 cursor-default items-end justify-center"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${p.label}: ${p.display}`}
                >
                  <div
                    className="relative w-full max-w-7 rounded-t-[4px] transition-opacity"
                    style={{
                      height: p.value == null ? 0 : `${Math.max(p.value > 0 ? 2 : 0, (p.value / top) * 100)}%`,
                      background: BAR,
                      opacity: hover === null || hover === i ? 1 : 0.45,
                    }}
                  >
                    {/* Label only the latest period directly; the rest are on hover and in the table. */}
                    {i === last && hover === null && p.value != null && (
                      <span className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-zinc-800">
                        {p.display}
                      </span>
                    )}
                  </div>
                  {hover === i && (
                    <div
                      className={`pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white shadow ${
                        i > points.length / 2 ? "right-0" : "left-0"
                      }`}
                    >
                      <span className="text-zinc-300">{p.label}</span> · <strong>{p.display}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="right-8 mt-1 flex justify-between pr-8 text-[10px] text-zinc-400">
            <span>{points[0].label}</span>
            {points.length > 1 && <span>{points[last].label}</span>}
          </div>
          <DataTable title={title} points={points} unit={unit} />
        </>
      )}
    </figure>
  );
}

/** Horizontal bars with category labels (e.g. contacts by channel). */
export function BarList({ title, subtitle, rows }: { title: string; subtitle?: string; rows: Array<Point & { note?: string }> }) {
  const top = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <figure className="rounded-lg border border-zinc-200 bg-white p-4">
      <figcaption>
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </figcaption>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No data in this range.</p>
      ) : (
        <ul className="mt-3 space-y-[2px]">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-1 text-sm hover:bg-zinc-50" title={`${r.label}: ${r.display}${r.note ? ` · ${r.note}` : ""}`}>
              <span className="truncate text-zinc-700">{r.label}</span>
              <span className="h-3">
                <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(1, ((r.value ?? 0) / top) * 100)}%`, background: BAR }} />
              </span>
              <span className="text-right tabular-nums text-zinc-800">
                {r.display}
                {r.note && <span className="ml-2 text-xs text-zinc-500">{r.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
