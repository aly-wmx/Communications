"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { matchesFilter, sortQueue, type QueueFilter } from "@/lib/comms/contacts";
import { formatMinutes, needsEscalation, slaState } from "@/lib/comms/sla";
import type { ClientContact, SlaSettings } from "@/lib/comms/types";
import type { QueueAction } from "@/lib/validation/queue";
import { queueAction } from "./actions";

export interface QueueClient {
  name: string;
  project: string;
  phone: string;
}

const FILTERS: Array<[QueueFilter, string]> = [
  ["waiting", "Waiting on us"],
  ["escalate", "Needs escalation"],
  ["overdue", "Overdue"],
  ["client", "Waiting on client"],
  ["resolved", "Resolved"],
  ["all", "All"],
];

const STAGE = {
  ok: { label: "On time", cls: "bg-emerald-50 text-emerald-800", icon: "●" },
  reminder: { label: "Due soon", cls: "bg-amber-50 text-amber-800", icon: "◔" },
  breach: { label: "Overdue", cls: "bg-red-50 text-red-700", icon: "!" },
  responded: { label: "Responded", cls: "bg-zinc-100 text-zinc-600", icon: "✓" },
  paused: { label: "Paused", cls: "bg-zinc-100 text-zinc-600", icon: "‖" },
} as const;

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function ago(iso: string, now: Date) {
  return `${formatMinutes(Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)))} ago`;
}

function SlaPill({ c, sla, now }: { c: ClientContact; sla: SlaSettings; now: Date }) {
  const st = slaState(c, sla, now);
  const s = STAGE[st.stage];
  const time = st.stage === "paused" ? "" : st.stage === "responded" ? `in ${formatMinutes(st.waitedMinutes)}` : formatMinutes(st.waitedMinutes);
  const title =
    st.minutesToNext != null ? `${formatMinutes(st.minutesToNext)} until ${st.stage === "ok" ? "reminder" : "escalation"}` : undefined;
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
      {time && <span className="font-normal tabular-nums">{time}</span>}
    </span>
  );
}

export function QueueList({
  contacts,
  sla,
  clients,
  team,
  meId,
}: {
  contacts: ClientContact[];
  sla: SlaSettings;
  clients: Record<string, QueueClient>;
  team: Array<{ id: string; name: string }>;
  meId: string;
}) {
  const now = useNow();
  const [filter, setFilter] = useState<QueueFilter>("waiting");
  const [mine, setMine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(([f]) => [f, contacts.filter((c) => matchesFilter(c, f, sla, now)).length])),
    [contacts, sla, now],
  );
  const rows = useMemo(
    () =>
      sortQueue(
        contacts.filter((c) => matchesFilter(c, filter, sla, now) && (!mine || c.assigneeId === meId)),
        sla,
        now,
      ),
    [contacts, filter, mine, meId, sla, now],
  );

  function run(action: QueueAction) {
    setError(null);
    setPendingId(action.contactId);
    startTransition(async () => {
      const result = await queueAction(action);
      if (!result.ok) setError(result.error);
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Queue filter" className="flex flex-wrap gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-2.5 py-1 text-sm ${
                filter === key ? "bg-[#B08D5712] font-semibold text-[#1C2B47]" : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {label} <span className="text-xs tabular-nums text-zinc-400">{counts[key]}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-zinc-600">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-[#B08D57]" />
          Only mine
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {filter === "waiting" ? "Nobody is waiting on a response." : "Nothing here."}
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200 bg-white">
          {rows.map((c) => {
            const client = clients[c.clientId];
            const flagged = needsEscalation(c, sla, now);
            const busy = pendingId === c.id;
            return (
              <li
                key={c.id}
                className={`grid gap-3 px-4 py-3 md:grid-cols-[10rem_minmax(0,1fr)_9rem_auto] md:items-center ${
                  flagged ? "bg-red-50/60 shadow-[inset_3px_0_0_#B91C1C]" : ""
                } ${busy ? "opacity-60" : ""}`}
              >
                <div>
                  <SlaPill c={c} sla={sla} now={now} />
                </div>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-zinc-900">
                    {client?.name ?? "Unknown client"}
                    {client?.project && <span className="font-normal text-zinc-500">· {client.project}</span>}
                    {c.priority === "Urgent" && (
                      <span className="rounded bg-red-100 px-1.5 text-[11px] font-semibold text-red-700">Urgent</span>
                    )}
                    {c.escalations.length > 0 && (
                      <span className="rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">Escalated</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-zinc-700">{c.summary || <em className="text-zinc-400">No message text</em>}</p>
                  <p className="text-xs text-zinc-500">
                    {c.channel} · received {ago(c.receivedAt, now)}
                    {c.source === "ghl" && " · via GoHighLevel"}
                    {client?.phone && (
                      <>
                        {" · "}
                        <a href={`tel:${client.phone}`} className="underline-offset-2 hover:underline">
                          {client.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <select
                  aria-label="Assigned to"
                  value={c.assigneeId}
                  disabled={busy}
                  onChange={(e) => run({ action: "assign", contactId: c.id, assigneeId: e.target.value })}
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="">Unassigned</option>
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 md:justify-end">
                  {c.status === "Open" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run({ action: "responded", contactId: c.id })}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
                    >
                      Responded
                    </button>
                  )}
                  {c.status !== "Resolved" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run({ action: "resolve", contactId: c.id })}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
                    >
                      Resolve
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run({ action: "reopen", contactId: c.id })}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
                    >
                      Reopen
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
