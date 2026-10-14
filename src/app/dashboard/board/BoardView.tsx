"use client";

import { useRef, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarClock, Siren, Ticket } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { formatStamp } from "@/lib/format-time";
import { conversationHref } from "@/lib/links";
import { COLUMN_LABELS, COLUMNS, PRIORITY_LABELS, type BoardCard, type Column } from "@/lib/tickets";
import { RESOLVE_REASONS } from "@/lib/validation/queue";
import { queueAction } from "../queue/actions";
import { updateTicket } from "./actions";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Tickets and client conversation items as four columns. Drag a card, or use
 * "Move to…" (phones, keyboards). Moves show at once and roll back with a message
 * if the server refuses (e.g. a coordinator assigning someone else).
 */
export function BoardView({
  columns,
  team,
  meId,
  timeZone,
}: {
  columns: Record<Column, BoardCard[]>;
  team: Array<{ id: string; name: string }>;
  meId: string;
  timeZone: string;
}) {
  const toast = useToast();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [moved, setMoved] = useState<Record<string, Column>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState<BoardCard | null>(null);
  const [over, setOver] = useState<Column | null>(null);
  const [resolving, setResolving] = useState<BoardCard | null>(null);
  const resolveDialog = useRef<HTMLDialogElement>(null);

  const nameOf = (id: string | null) => team.find((t) => t.id === id)?.name ?? "";
  const ticketHref = (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("t", id);
    return `${pathname}?${p}`;
  };

  // Cards with an in-flight move appear in their new column straight away.
  const all = COLUMNS.flatMap((col) => columns[col]);
  const view = Object.fromEntries(COLUMNS.map((col) => [col, all.filter((c) => (moved[c.id] ?? c.column) === col)])) as Record<Column, BoardCard[]>;

  /** Run the server steps for a move one after another; any failure rolls the card back. */
  function run(card: BoardCard, to: Column, steps: Array<() => Promise<Result>>) {
    setBusy(card.id);
    setMoved((m) => ({ ...m, [card.id]: to }));
    startTransition(async () => {
      for (const step of steps) {
        const result = await step();
        if (!result.ok) {
          toast(result.error, "error");
          break;
        }
      }
      // The refreshed board from the server is now the truth (moved or not).
      setMoved((m) => {
        const rest = { ...m };
        delete rest[card.id];
        return rest;
      });
      setBusy(null);
    });
  }

  function move(card: BoardCard, to: Column) {
    const from = moved[card.id] ?? card.column;
    if (from === to) return;
    if (card.kind === "ticket") {
      return run(card, to, [() => updateTicket({ id: card.id, field: "status", value: to })]);
    }
    // Client items: their own statuses mapped onto the columns (see contactColumn).
    const id = card.id;
    const reopen = () => queueAction({ action: "reopen", contactId: id });
    if (to === "done") return openResolve(card);
    if (to === "waiting") return run(card, to, [() => queueAction({ action: "wait", contactId: id })]);
    if (to === "in_progress") {
      return run(card, to, [
        ...(from !== "todo" ? [reopen] : []),
        ...(card.assigneeId ? [] : [() => queueAction({ action: "assign", contactId: id, assigneeId: meId })]),
      ]);
    }
    // To do: open and nobody on it yet.
    return run(card, to, [
      ...(from === "waiting" || from === "done" ? [reopen] : []),
      ...(card.assigneeId ? [() => queueAction({ action: "assign", contactId: id, assigneeId: "" })] : []),
    ]);
  }

  function openResolve(card: BoardCard) {
    setResolving(card);
    resolveDialog.current?.showModal();
  }
  function finishResolve(reason: string | null) {
    resolveDialog.current?.close();
    const card = resolving;
    setResolving(null);
    if (card && reason !== null) {
      run(card, "done", [() => queueAction({ action: "resolve", contactId: card.id, reason: reason || undefined })]);
    }
  }

  // ---------- drag and drop ----------
  function onDragStart(e: DragEvent, card: BoardCard) {
    e.dataTransfer.setData("text/plain", card.id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(card);
  }
  function onDragOver(e: DragEvent, to: Column) {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (over !== to) setOver(to);
  }
  function onDrop(e: DragEvent, to: Column) {
    e.preventDefault();
    const card = dragging;
    setDragging(null);
    setOver(null);
    if (card) move(card, to);
  }

  const assignee = (id: string | null) =>
    id ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
        <Avatar name={nameOf(id) || "?"} size="sm" />
        {id === meId ? "You" : nameOf(id) || "Former teammate"}
      </span>
    ) : (
      <span className="text-xs text-zinc-500">Unassigned</span>
    );

  const card = (c: BoardCard, col: Column) => (
    <li
      key={`${c.kind}:${c.id}`}
      draggable={busy !== c.id}
      onDragStart={(e) => onDragStart(e, c)}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      className={`rounded-lg border bg-white p-3 shadow-sm ${busy === c.id ? "opacity-60" : ""} ${
        c.kind === "ticket" ? "border-zinc-200" : "border-l-4 border-zinc-200 border-l-sky-400"
      }`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {c.kind === "ticket" ? (
          <StatusPill tone="brand">
            <Ticket aria-hidden className="size-3" /> Ticket
          </StatusPill>
        ) : (
          <StatusPill tone="neutral">
            <ChannelIcon channel={c.channel} className="size-3" /> Client {c.channel.toLowerCase()}
          </StatusPill>
        )}
        {c.kind === "ticket" && c.due === "overdue" && <StatusPill tone="danger">Overdue</StatusPill>}
        {c.kind === "ticket" && c.priority !== "normal" && (
          <StatusPill tone={c.priority === "urgent" ? "solid-danger" : "warning"}>{PRIORITY_LABELS[c.priority]}</StatusPill>
        )}
        {c.kind === "client" && c.escalated && (
          <StatusPill tone="solid-danger">
            <Siren aria-hidden className="size-3" /> Escalated
          </StatusPill>
        )}
        {c.kind === "client" && c.urgent && <StatusPill tone="solid-danger">Urgent</StatusPill>}
      </div>

      {c.kind === "ticket" ? (
        <Link href={ticketHref(c.id)} scroll={false} className="block text-sm font-semibold text-zinc-900 hover:underline" draggable={false}>
          {c.title}
        </Link>
      ) : (
        <Link href={conversationHref(c.clientId)} className="block text-sm font-semibold text-zinc-900 hover:underline" draggable={false}>
          {c.clientName}
        </Link>
      )}
      {c.kind === "client" ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">{c.title}</p>
      ) : (
        c.clientName && (
          <Link href={conversationHref(c.clientId!)} className="mt-0.5 block text-xs text-gold-ink hover:underline" draggable={false}>
            {c.clientName}
          </Link>
        )
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {assignee(c.assigneeId)}
        {c.kind === "ticket" && c.dueAt && (
          <span className={`inline-flex items-center gap-1 text-xs ${c.due === "overdue" ? "font-semibold text-red-700" : c.due === "due_soon" ? "font-semibold text-amber-800" : "text-zinc-500"}`}>
            <CalendarClock aria-hidden className="size-3.5" />
            {c.due === "due_soon" ? "Due soon · " : ""}
            {formatStamp(c.dueAt, timeZone, "day")}
          </span>
        )}
        {c.kind === "client" && c.waitedLabel && col !== "done" && (
          <StatusPill tone={c.overdue ? "danger" : "neutral"}>
            {c.overdue ? "Overdue · " : ""}waiting {c.waitedLabel}
          </StatusPill>
        )}
      </div>

      <select
        value=""
        disabled={busy === c.id}
        aria-label={`Move ${c.kind === "ticket" ? c.title : c.clientName} to`}
        onChange={(e) => e.target.value && move(c, e.target.value as Column)}
        className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-base text-zinc-700 sm:py-1 sm:text-xs"
      >
        <option value="">Move to…</option>
        {COLUMNS.filter((to) => to !== col).map((to) => (
          <option key={to} value={to}>
            {COLUMN_LABELS[to]}
          </option>
        ))}
      </select>
    </li>
  );

  return (
    <>
      <p className="text-xs text-zinc-500">
        Drag a card to another column, or use “Move to…”. Client items move with the conversation: Waiting means waiting on the client, Done resolves it.
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <section
            key={col}
            aria-label={COLUMN_LABELS[col]}
            onDragOver={(e) => onDragOver(e, col)}
            onDragLeave={() => over === col && setOver(null)}
            onDrop={(e) => onDrop(e, col)}
            className={`flex min-h-40 flex-col rounded-xl border p-2 transition-colors ${over === col ? "border-gold bg-gold/10" : "border-zinc-200 bg-zinc-50"}`}
          >
            <h2 className="flex items-center justify-between px-1.5 pb-2 pt-1 text-sm font-semibold text-zinc-800">
              {COLUMN_LABELS[col]}
              <span className="text-xs font-medium tabular-nums text-zinc-500">{view[col].length}</span>
            </h2>
            {view[col].length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-zinc-500">{col === "done" ? "Nothing finished this week yet." : "Nothing here."}</p>
            ) : (
              <ul className="flex flex-col gap-2">{view[col].map((c) => card(c, col))}</ul>
            )}
          </section>
        ))}
      </div>

      <dialog
        ref={resolveDialog}
        aria-labelledby="resolve-title"
        onCancel={(e) => {
          e.preventDefault();
          finishResolve(null);
        }}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      >
        <div className="p-5">
          <h2 id="resolve-title" className="text-base font-semibold text-zinc-900">
            Resolve {resolving?.clientName ?? "this item"}?
          </h2>
          <p className="mt-1 text-sm text-zinc-600">The reason is saved to its history.</p>
          <div className="mt-4 flex flex-col gap-2">
            {RESOLVE_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => finishResolve(r)} className="min-h-10 rounded-md border border-zinc-300 px-3 text-left text-sm text-zinc-800 hover:border-zinc-400 sm:min-h-9">
                {r}
              </button>
            ))}
            <button type="button" onClick={() => finishResolve("")} className="min-h-10 rounded-md bg-navy px-3 text-sm font-semibold text-white hover:bg-navy-hover sm:min-h-9">
              Resolve without a reason
            </button>
            <button type="button" onClick={() => finishResolve(null)} className="min-h-10 rounded-md px-3 text-sm text-zinc-600 hover:text-zinc-900 sm:min-h-9">
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
