"use client";

import { useEffect, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { formatMinutes, slaState } from "@/lib/comms/sla";
import type { ClientContact, SlaSettings } from "@/lib/comms/types";
import { channelStyle } from "@/lib/comms/channels";
import { queueAction } from "../queue/actions";
import { acknowledgeEscalation } from "./actions";
import { EscalateButton, type EscalationMember } from "./EscalateButton";

export type Stage = "needs" | "awaiting" | "picked" | "resolved";
export type View = "table" | "kanban";

const STAGES: { key: Stage; title: string; hint: string; tone: string }[] = [
  { key: "needs", title: "Past target", hint: "Over the escalation time, not escalated yet.", tone: "bg-amber-500" },
  { key: "awaiting", title: "Awaiting pickup", hint: "Escalated; nobody has said “I’ve got it”.", tone: "bg-red-600" },
  { key: "picked", title: "Picked up", hint: "Someone has it; resolve once the client is sorted.", tone: "bg-[#3F7A5C]" },
  { key: "resolved", title: "Resolved", hint: "Escalations closed in the last 7 days.", tone: "bg-zinc-400" },
];
const stageInfo = (s: Stage) => STAGES.find((x) => x.key === s)!;

/** Where a card may be dropped from each column. Moving backwards (un-escalating) isn't a thing. */
const ALLOWED: Record<Stage, Stage[]> = {
  needs: ["awaiting", "resolved"],
  awaiting: ["picked", "resolved"],
  picked: ["awaiting", "resolved"],
  resolved: ["picked"],
};
const moveLabel: Record<Stage, string> = {
  needs: "",
  awaiting: "Escalate…",
  picked: "I’ve got it",
  resolved: "Resolve",
};

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

const ago = (iso: string, now: Date) => `${formatMinutes(Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)))} ago`;

export function EscalationsView({
  view,
  needs,
  awaiting,
  picked,
  resolved,
  clients,
  team,
  meId,
  sla,
}: {
  view: View;
  needs: ClientContact[];
  awaiting: ClientContact[];
  picked: ClientContact[];
  resolved: ClientContact[];
  clients: Record<string, string>;
  team: EscalationMember[];
  meId: string;
  sla: SlaSettings;
}) {
  const now = useNow();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Optimistic column while a move is saving, so the card lands where it was dropped.
  const [moved, setMoved] = useState<Record<string, Stage>>({});
  const [dragging, setDragging] = useState<{ id: string; from: Stage } | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [escalating, setEscalating] = useState<ClientContact | null>(null);
  const [, startTransition] = useTransition();

  const name = (id?: string) => (id ? (team.find((t) => t.id === id)?.name ?? "Someone") : "Automatic");
  const clientName = (c: ClientContact) => clients[c.clientId] ?? "Unknown client";

  const all: { c: ClientContact; stage: Stage }[] = [
    ...needs.map((c) => ({ c, stage: "needs" as const })),
    ...awaiting.map((c) => ({ c, stage: "awaiting" as const })),
    ...picked.map((c) => ({ c, stage: "picked" as const })),
    ...resolved.map((c) => ({ c, stage: "resolved" as const })),
  ].map((x) => ({ ...x, stage: moved[x.c.id] ?? x.stage }));
  const inStage = (s: Stage) => all.filter((x) => x.stage === s).map((x) => x.c);

  function run(c: ClientContact, to: Stage | null, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(c.id);
    if (to) setMoved((m) => ({ ...m, [c.id]: to }));
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      // On success the page has refreshed with the real column; either way drop the optimistic one.
      setMoved((m) => {
        const rest = { ...m };
        delete rest[c.id];
        return rest;
      });
      setBusy(null);
    });
  }

  function move(c: ClientContact, from: Stage, to: Stage) {
    if (from === to) return;
    if (!ALLOWED[from].includes(to)) {
      setError(
        to === "needs"
          ? "An escalation can't be undone. Resolve it once the client is sorted."
          : to === "picked"
            ? "Escalate it first, or just reply to the client and resolve it."
            : "That move isn't possible.",
      );
      return;
    }
    if (to === "awaiting") return setEscalating(c);
    if (to === "picked" && from === "awaiting") return run(c, to, () => acknowledgeEscalation({ contactId: c.id }));
    if (to === "resolved") return run(c, to, () => queueAction({ action: "resolve", contactId: c.id }));
    if (from === "resolved") return run(c, to, () => queueAction({ action: "reopen", contactId: c.id }));
  }

  // ---------- drag and drop ----------

  function onDragStart(e: DragEvent, c: ClientContact, from: Stage) {
    e.dataTransfer.setData("text/plain", c.id);
    e.dataTransfer.effectAllowed = "move";
    setDragging({ id: c.id, from });
  }
  function onDragOver(e: DragEvent, to: Stage) {
    if (!dragging || !ALLOWED[dragging.from].includes(to)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (over !== to) setOver(to);
  }
  function onDrop(e: DragEvent, to: Stage) {
    e.preventDefault();
    const d = dragging;
    setDragging(null);
    setOver(null);
    const item = d && all.find((x) => x.c.id === d.id);
    if (item) move(item.c, item.stage, to);
  }

  // ---------- shared bits ----------

  const escalatedLine = (c: ClientContact, stage: Stage) => {
    const last = c.escalations.at(-1);
    if (!last || stage === "needs") return null;
    return (
      <>
        Escalated {ago(last.at, now)} by {name(last.byId)}
        {last.notifiedIds.length > 0 && ` to ${last.notifiedIds.map((id) => name(id)).join(", ")}`}
        {last.acknowledgedAt && (
          <span className="font-semibold text-[#3F7A5C]">
            {" · "}picked up by {name(last.acknowledgedById)} {ago(last.acknowledgedAt, now)}
          </span>
        )}
      </>
    );
  };

  const waitedPill = (c: ClientContact, stage: Stage) =>
    stage === "resolved" ? (
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
        resolved {c.resolvedAt ? ago(c.resolvedAt, now) : ""}
      </span>
    ) : (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
        waited {formatMinutes(slaState(c, sla, now).waitedMinutes)}
      </span>
    );

  const moveSelect = (c: ClientContact, stage: Stage) => (
    <select
      value=""
      disabled={busy === c.id}
      aria-label={`Move ${clientName(c)} to`}
      onChange={(e) => e.target.value && move(c, stage, e.target.value as Stage)}
      className="rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs text-zinc-700"
    >
      <option value="">Move to…</option>
      {ALLOWED[stage].map((to) => (
        <option key={to} value={to}>
          {stageInfo(to).title}
          {stage === "resolved" ? " (reopen)" : ` — ${moveLabel[to]}`}
        </option>
      ))}
    </select>
  );

  // ---------- table ----------

  const table = (
    <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Waited</th>
            <th className="px-3 py-2">Channel</th>
            <th className="px-3 py-2">Assigned</th>
            <th className="px-3 py-2">Escalation</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {all.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                No escalations right now.
              </td>
            </tr>
          )}
          {STAGES.flatMap((s) => inStage(s.key).map((c) => ({ c, stage: s.key }))).map(({ c, stage }) => {
            const last = c.escalations.at(-1);
            return (
              <tr key={c.id} className={`align-top ${busy === c.id ? "opacity-60" : ""}`}>
                <td className="max-w-[260px] px-3 py-2.5">
                  <Link href={`/dashboard/clients/${c.clientId}`} className="font-semibold text-zinc-900 hover:text-[#B08D57] hover:underline">
                    {clientName(c)}
                  </Link>
                  {c.priority === "Urgent" && <span className="ml-2 rounded bg-red-100 px-1.5 text-[11px] text-red-700">Urgent</span>}
                  <p className="truncate text-xs text-zinc-600">{c.summary || <em className="text-zinc-500">No message text</em>}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800">
                    <span className={`size-2 rounded-full ${stageInfo(stage).tone}`} aria-hidden />
                    {stageInfo(stage).title}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{waitedPill(c, stage)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${channelStyle(c.channel).tag}`}>{c.channel}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-700">{c.assigneeId ? name(c.assigneeId) : "Nobody"}</td>
                <td className="max-w-[280px] px-3 py-2.5 text-xs text-zinc-600">
                  {escalatedLine(c, stage) ?? <span className="text-zinc-500">Not escalated</span>}
                  {last?.note && stage !== "needs" && <p className="mt-0.5 italic text-zinc-600">“{last.note}”</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <div className="flex justify-end gap-2">
                    {stage === "needs" && (
                      <EscalateButton contactId={c.id} clientName={clientName(c)} team={team} meId={meId} highlight />
                    )}
                    {stage === "awaiting" && (
                      <button
                        type="button"
                        disabled={busy === c.id}
                        onClick={() => move(c, stage, "picked")}
                        className="rounded-md bg-[#3F7A5C] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"
                      >
                        I&apos;ve got it
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => move(c, stage, stage === "resolved" ? "picked" : "resolved")}
                      className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
                    >
                      {stage === "resolved" ? "Reopen" : "Resolve"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // ---------- kanban ----------

  const board = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((s) => {
        const list = inStage(s.key);
        const canDrop = !!dragging && ALLOWED[dragging.from].includes(s.key);
        return (
          <section
            key={s.key}
            aria-label={s.title}
            onDragOver={(e) => onDragOver(e, s.key)}
            onDragLeave={() => over === s.key && setOver(null)}
            onDrop={(e) => onDrop(e, s.key)}
            className={`flex min-h-[220px] flex-col rounded-lg border p-2 transition-colors ${
              over === s.key
                ? "border-[#B08D57] bg-[#B08D57]/10"
                : canDrop
                  ? "border-dashed border-[#B08D57]/60 bg-zinc-50"
                  : dragging && dragging.from !== s.key
                    ? "border-zinc-200 bg-zinc-50 opacity-60"
                    : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <header className="px-1 pb-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <span className={`size-2 rounded-full ${s.tone}`} aria-hidden />
                {s.title}
                <span className="ml-auto rounded-full bg-white px-2 text-xs font-medium text-zinc-600">{list.length}</span>
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">{s.hint}</p>
            </header>
            <ul className="flex flex-1 flex-col gap-2">
              {list.length === 0 && (
                <li className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500">
                  {canDrop ? "Drop here" : "Nothing here"}
                </li>
              )}
              {list.map((c) => (
                <li
                  key={c.id}
                  draggable={busy !== c.id}
                  onDragStart={(e) => onDragStart(e, c, s.key)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  className={`cursor-grab rounded-md border-l-4 bg-white p-2.5 shadow-sm active:cursor-grabbing ${channelStyle(c.channel).border} ${
                    busy === c.id ? "opacity-60" : ""
                  } ${dragging?.id === c.id ? "opacity-40" : ""}`}
                >
                  <p className="flex items-start gap-2">
                    <Link
                      href={`/dashboard/clients/${c.clientId}`}
                      draggable={false}
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900 hover:text-[#B08D57] hover:underline"
                    >
                      {clientName(c)}
                    </Link>
                    {c.priority === "Urgent" && <span className="shrink-0 rounded bg-red-100 px-1.5 text-[11px] text-red-700">Urgent</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-700">{c.summary || <em className="text-zinc-500">No message text</em>}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {waitedPill(c, s.key)}
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${channelStyle(c.channel).tag}`}>{c.channel}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-600">
                    {c.assigneeId ? name(c.assigneeId) : "Unassigned"}
                    {c.escalations.at(-1) && s.key !== "needs" && <> · {escalatedLine(c, s.key)}</>}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {moveSelect(c, s.key)}
                    <Link
                      href={`/dashboard/clients/${c.clientId}`}
                      draggable={false}
                      className="text-xs font-semibold text-[#8A6A3A] hover:underline"
                    >
                      Open →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {view === "kanban" && (
        <p className="text-xs text-zinc-500">Drag a card to another column, or use “Move to…” on the card.</p>
      )}
      {view === "kanban" ? board : table}
      {escalating && (
        <EscalateButton
          key={escalating.id}
          contactId={escalating.id}
          clientName={clientName(escalating)}
          team={team}
          meId={meId}
          hideTrigger
          onClose={() => setEscalating(null)}
        />
      )}
    </div>
  );
}
