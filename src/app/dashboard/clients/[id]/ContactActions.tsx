"use client";

import { useState, useTransition } from "react";
import type { QueueAction } from "@/lib/validation/queue";
import { queueAction } from "../../queue/actions";

export interface OpenContact {
  id: string;
  channel: string;
  status: string;
  summary: string;
  receivedLabel: string;
  assigneeId: string;
}

/** The client's open queue items, with the same buttons as the Client Queue. */
export function ContactActions({ contacts, team }: { contacts: OpenContact[]; team: Array<{ id: string; name: string }> }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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
    <section className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Waiting on us</h2>
      {contacts.map((c) => {
        const busy = pendingId === c.id;
        return (
          <div key={c.id} className={`space-y-2 rounded-md bg-white p-3 ${busy ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-800">{c.summary || <em className="text-zinc-400">No message text</em>}</p>
              <p className="text-xs text-zinc-500">
                {c.channel} · {c.receivedLabel}
                {c.status === "Waiting on client" && " · waiting on client"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
            {c.status === "Open" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run({ action: "responded", contactId: c.id })}
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
              >
                Responded
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ action: "resolve", contactId: c.id })}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
            >
              Resolve
            </button>
            </div>
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
