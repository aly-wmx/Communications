"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { EditableTextCell } from "@/components/EditableCell";
import { MentionTextarea } from "@/components/MentionTextarea";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { formatStamp, zonedDayKey } from "@/lib/format-time";
import { conversationHref } from "@/lib/links";
import { COLUMN_LABELS, COLUMNS, PRIORITIES, PRIORITY_LABELS, dueState, type Ticket } from "@/lib/tickets";
import type { TicketUpdate } from "@/lib/validation/tickets";
import { addTicketComment, updateTicket } from "./actions";

export interface TicketEvent {
  id: string;
  authorId: string | null;
  kind: string;
  body: string;
  createdAt: string;
}

const select =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-base focus:border-zinc-400 focus:outline-none sm:py-1.5 sm:text-sm";

/** One ticket, opened from the Board (?t=…) or a notification: every field editable, comments and history below. */
export function TicketPanel({
  ticket,
  events,
  clientName,
  team,
  assignable,
  meId,
  canAssignOthers,
  timeZone,
  closeHref,
}: {
  ticket: Ticket;
  events: TicketEvent[];
  clientName: string;
  /** Everyone, for names in the history. */
  team: Array<{ id: string; name: string }>;
  /** People who can open this business: the only ones it can be given to or who can be mentioned. */
  assignable: Array<{ id: string; name: string }>;
  meId: string;
  canAssignOthers: boolean;
  timeZone: string;
  closeHref: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  // Messages show inside the panel: a modal dialog sits above the page's toasts.
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const nameOf = (id: string | null) => team.find((t) => t.id === id)?.name ?? "Former teammate";
  const due = dueState(ticket, new Date());

  // Details: follows the saved text (e.g. a teammate's edit arriving live) unless you're typing in it,
  // and only saves when you changed it from what it was when you started.
  const [details, setDetails] = useState(ticket.details);
  const [editingFrom, setEditingFrom] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState(ticket.details);
  if (ticket.details !== lastSaved) {
    setLastSaved(ticket.details);
    if (editingFrom === null) setDetails(ticket.details);
  }

  // A real modal: focus stays inside, Escape closes, the page behind doesn't scroll.
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    heading.current?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = scroll;
    };
  }, []);

  const save = (change: Omit<TicketUpdate, "id">, done?: string) =>
    startTransition(async () => {
      try {
        const result = await updateTicket({ id: ticket.id, ...change });
        setStatus(result.ok ? (done ? { text: done, ok: true } : null) : { text: result.error, ok: false });
      } catch {
        setStatus({ text: "Couldn't reach the server. Check your connection and try again.", ok: false });
      }
    });

  function saveDetails() {
    if (editingFrom !== null && details !== editingFrom) save({ field: "details", value: details }, "Details saved");
    setEditingFrom(null);
  }

  /** Close, saving Details first if they were being edited. */
  function close() {
    saveDetails();
    router.push(closeHref, { scroll: false });
  }

  // Coordinators: themselves or nobody (plus whoever has it now, so the field can show it).
  const people = canAssignOthers ? assignable : assignable.filter((t) => t.id === meId || t.id === ticket.assigneeId);

  function post() {
    const body = comment.trim();
    if (!body) return;
    startTransition(async () => {
      try {
        const result = await addTicketComment({ ticketId: ticket.id, body });
        if (!result.ok) return setStatus({ text: result.error, ok: false });
        setComment("");
      } catch {
        setStatus({ text: "Couldn't post the comment. Check your connection and try again.", ok: false });
      }
    });
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="ticket-title"
      // Escape: close (the @mention list stops Escape first when it's open).
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // A click on the dimmed backdrop (outside the panel) closes it.
      onClick={(e) => e.target === dialog.current && close()}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-lg overflow-y-auto bg-white p-0 shadow-2xl backdrop:bg-black/30 open:flex open:flex-col"
    >
        <header className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="ticket-title" ref={heading} tabIndex={-1} className="sr-only">
              {ticket.title}
            </h2>
            <EditableTextCell value={ticket.title} onSave={(value) => updateTicket({ id: ticket.id, field: "title", value })} />
            <div className="mt-1.5 flex flex-wrap gap-1.5 px-2">
              <StatusPill tone="brand">{COLUMN_LABELS[ticket.status]}</StatusPill>
              {due === "overdue" && <StatusPill tone="danger">Overdue</StatusPill>}
              {due === "due_soon" && <StatusPill tone="warning">Due soon</StatusPill>}
              {ticket.priority !== "normal" && (
                <StatusPill tone={ticket.priority === "urgent" ? "solid-danger" : "warning"}>{PRIORITY_LABELS[ticket.priority]}</StatusPill>
              )}
            </div>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="grid size-10 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
            <X aria-hidden className="size-5" />
          </button>
        </header>
        {status && (
          <p role={status.ok ? "status" : "alert"} className={`border-b px-5 py-2 text-sm ${status.ok ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-red-100 bg-red-50 text-red-700"}`}>
            {status.text}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 border-b border-zinc-100 px-5 py-4">
          <label className="text-xs font-medium text-zinc-600">
            Status
            <select disabled={pending} value={ticket.status} onChange={(e) => save({ field: "status", value: e.target.value as Ticket["status"] })} className={`mt-1 ${select}`}>
              {COLUMNS.map((c) => (
                <option key={c} value={c}>
                  {COLUMN_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Assigned to
            <select
              disabled={pending}
              value={ticket.assigneeId ?? ""}
              onChange={(e) => save({ field: "assignee", value: e.target.value }, e.target.value ? `Assigned to ${e.target.value === meId ? "you" : nameOf(e.target.value)}` : "Unassigned")}
              className={`mt-1 ${select}`}
            >
              <option value="">Unassigned</option>
              {people.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id === meId ? `Me (${t.name})` : t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Due
            <input
              type="date"
              disabled={pending}
              defaultValue={ticket.dueAt ? zonedDayKey(ticket.dueAt, timeZone) : ""}
              // Saved when you leave the field: typing a year fires a change for every digit ("0002").
              onBlur={(e) => {
                const value = e.currentTarget.value;
                if (value !== (ticket.dueAt ? zonedDayKey(ticket.dueAt, timeZone) : "")) save({ field: "due", value });
              }}
              className={`mt-1 ${select}`}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Priority
            <select disabled={pending} value={ticket.priority} onChange={(e) => save({ field: "priority", value: e.target.value as Ticket["priority"] })} className={`mt-1 ${select}`}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          {!canAssignOthers && <p className="col-span-2 text-xs text-zinc-500">You can take this ticket yourself; a manager or admin can assign it to someone else.</p>}
          {ticket.clientId && (
            <p className="col-span-2 text-xs text-zinc-600">
              About{" "}
              <Link href={conversationHref(ticket.clientId)} className="font-semibold text-gold-ink hover:underline">
                {clientName || "a client"}
              </Link>{" "}
              ·{" "}
              <button type="button" onClick={() => save({ field: "client", value: "" }, "Unlinked the client")} className="text-zinc-500 hover:text-zinc-800 hover:underline">
                unlink
              </button>
            </p>
          )}
        </div>

        <div className="border-b border-zinc-100 px-5 py-4">
          <label htmlFor="ticket-details" className="text-xs font-medium text-zinc-600">
            Details
          </label>
          <textarea
            id="ticket-details"
            rows={4}
            maxLength={5000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            onFocus={() => setEditingFrom(details)}
            onBlur={saveDetails}
            placeholder="What needs doing, links, anything the next person should know."
            className={`mt-1 resize-y ${select}`}
          />
        </div>

        <section aria-label="Comments and history" className="flex-1 px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity</h3>
          <ol className="mt-3 space-y-3">
            {events.map((e) =>
              e.kind === "comment" ? (
                <li key={e.id} className="flex gap-2.5">
                  <Avatar name={nameOf(e.authorId)} size="sm" />
                  <div className="min-w-0 flex-1 rounded-lg bg-well px-3 py-2">
                    <p className="text-xs text-zinc-500">
                      <span className="font-semibold text-zinc-800">{nameOf(e.authorId)}</span> · {formatStamp(e.createdAt, timeZone)}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-zinc-900">{e.body}</p>
                  </div>
                </li>
              ) : (
                <li key={e.id} className="pl-8 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700">{nameOf(e.authorId)}</span> {e.body.charAt(0).toLowerCase() + e.body.slice(1)} ·{" "}
                  {formatStamp(e.createdAt, timeZone)}
                </li>
              ),
            )}
          </ol>
        </section>

        <footer className="sticky bottom-0 border-t border-zinc-200 bg-white px-5 py-3">
          <div className="flex items-end gap-2">
            <MentionTextarea
              value={comment}
              onValueChange={setComment}
              team={assignable.filter((t) => t.id !== meId)}
              onSubmit={post}
              rows={2}
              placeholder="Comment… type @ to mention someone"
              aria-label="Comment"
              className="max-h-40 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-base focus:border-zinc-400 focus:outline-none sm:text-sm"
            />
            <button
              type="button"
              disabled={pending || !comment.trim()}
              onClick={post}
              className="min-h-10 rounded-md bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-hover disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </footer>
    </dialog>
  );
}
