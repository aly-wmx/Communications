"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { formatMinutes, slaState } from "@/lib/comms/sla";
import type { ClientContact, SlaSettings } from "@/lib/comms/types";
import { queueAction } from "../queue/actions";
import { acknowledgeEscalation } from "./actions";
import { EscalateButton, type EscalationMember } from "./EscalateButton";

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

const ago = (iso: string, now: Date) => `${formatMinutes(Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)))} ago`;

export function EscalationList({
  needs,
  awaiting,
  picked,
  clients,
  team,
  meId,
  sla,
}: {
  needs: ClientContact[];
  awaiting: ClientContact[];
  picked: ClientContact[];
  clients: Record<string, string>;
  team: EscalationMember[];
  meId: string;
  sla: SlaSettings;
}) {
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const name = (id?: string) => (id ? (team.find((t) => t.id === id)?.name ?? "Someone") : "Automatic");

  function act(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(id);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      setBusy(null);
    });
  }

  const row = (c: ClientContact, kind: "needs" | "awaiting" | "picked") => {
    const last = c.escalations.at(-1);
    const waited = slaState(c, sla, now).waitedMinutes;
    return (
      <li key={c.id} className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${busy === c.id ? "opacity-60" : ""}`}>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
            <Link href={`/dashboard/clients/${c.clientId}`} className="hover:text-[#B08D57] hover:underline">
              {clients[c.clientId] ?? "Unknown client"}
            </Link>
            {c.priority === "Urgent" && <span className="rounded bg-red-100 px-1.5 text-[11px] text-red-700">Urgent</span>}
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">waited {formatMinutes(waited)}</span>
          </p>
          <p className="truncate text-sm text-zinc-700">{c.summary || <em className="text-zinc-400">No message text</em>}</p>
          <p className="text-xs text-zinc-500">
            {c.channel} · assigned to {c.assigneeId ? name(c.assigneeId) : "nobody"}
            {last && kind !== "needs" && (
              <>
                {" · "}escalated {ago(last.at, now)} by {name(last.byId)}
                {last.notifiedIds.length > 0 && ` to ${last.notifiedIds.map((id) => name(id)).join(", ")}`}
                {last.note && ` — “${last.note}”`}
              </>
            )}
            {kind === "picked" && last?.acknowledgedAt && (
              <span className="font-semibold text-[#3F7A5C]">
                {" · "}picked up by {name(last.acknowledgedById)} {ago(last.acknowledgedAt, now)}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {kind === "needs" && (
            <EscalateButton contactId={c.id} clientName={clients[c.clientId] ?? "this client"} team={team} meId={meId} highlight />
          )}
          {kind === "awaiting" && (
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => act(c.id, () => acknowledgeEscalation({ contactId: c.id }))}
              className="rounded-md bg-[#3F7A5C] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"
            >
              I&apos;ve got it
            </button>
          )}
          <Link
            href={`/dashboard/clients/${c.clientId}`}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
          >
            Open conversation
          </Link>
          <button
            type="button"
            disabled={busy === c.id}
            onClick={() => act(c.id, () => queueAction({ action: "resolve", contactId: c.id }))}
            className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
          >
            Resolve
          </button>
        </div>
      </li>
    );
  };

  const section = (title: string, hint: string, list: ClientContact[], kind: "needs" | "awaiting" | "picked", tone: string) => (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 text-sm font-semibold text-zinc-900">
        <span className={`size-2 rounded-full ${tone}`} aria-hidden />
        {title} <span className="text-xs font-normal text-zinc-500">{list.length}</span>
      </h2>
      <p className="text-xs text-zinc-500">{hint}</p>
      {list.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-white p-4 text-center text-sm text-zinc-500">Nothing here.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-md border border-zinc-200 bg-white">{list.map((c) => row(c, kind))}</ul>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {section("Waiting for someone to pick up", "Escalated, but nobody has said “I’ve got it” yet.", awaiting, "awaiting", "bg-red-600")}
      {section(
        "Past the target, not escalated",
        "Over the escalation time with no escalation yet — usually older messages from before automatic escalation was switched on.",
        needs,
        "needs",
        "bg-amber-500",
      )}
      {section("Picked up, still open", "Someone has it; resolve once the client is sorted.", picked, "picked", "bg-[#3F7A5C]")}
    </div>
  );
}
