"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { PRIORITIES, PRIORITY_LABELS, type TicketPriority } from "@/lib/tickets";
import { searchClients, type ClientPick } from "../messaging/actions";
import { createTicket } from "./actions";

const field =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base focus:border-zinc-400 focus:outline-none sm:py-1.5 sm:text-sm";

/**
 * "New ticket": a dialog with the few things a ticket needs. Coordinators can
 * only give it to themselves (or nobody); managers and admins can pick anyone.
 */
export function NewTicket({
  team,
  meId,
  canAssignOthers,
  client,
  label = "New ticket",
  compact = false,
}: {
  team: Array<{ id: string; name: string }>;
  meId: string;
  canAssignOthers: boolean;
  /** Opened from a client's conversation: the ticket is about them. */
  client?: { id: string; name: string };
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", details: "", assigneeId: meId, dueDate: "", priority: "normal" as TicketPriority });
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(client ?? null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ClientPick[]>([]);

  // Client search as you type (current business only), after a short pause.
  useEffect(() => {
    if (picked || query.trim().length < 2) return;
    const t = window.setTimeout(() => void searchClients(query).then(setMatches), 250);
    return () => window.clearTimeout(t);
  }, [query, picked]);

  function open() {
    setError(null);
    setForm({ title: "", details: "", assigneeId: meId, dueDate: "", priority: "normal" });
    setPicked(client ?? null);
    setQuery("");
    setMatches([]);
    dialog.current?.showModal();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTicket({ ...form, clientId: picked?.id ?? "" });
      if (!result.ok) return setError(result.error);
      dialog.current?.close();
      const who = form.assigneeId === meId ? "you" : (team.find((t) => t.id === form.assigneeId)?.name ?? "nobody yet");
      toast(`Ticket created${form.assigneeId ? ` and assigned to ${who}` : ""}`);
      router.refresh();
    });
  }

  const people = canAssignOthers ? team : team.filter((t) => t.id === meId);

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          compact
            ? "inline-flex items-center gap-1 text-xs font-semibold text-gold-ink hover:underline"
            : "inline-flex min-h-10 items-center gap-1.5 rounded-md bg-navy px-3.5 text-sm font-semibold text-white hover:bg-navy-hover sm:min-h-9"
        }
      >
        <Plus aria-hidden className="size-4" /> {label}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 shadow-xl backdrop:bg-black/40"
      >
        <form onSubmit={submit} className="space-y-3 p-5">
          <h2 id={titleId} className="text-base font-semibold text-zinc-900">
            New ticket{client ? ` for ${client.name}` : ""}
          </h2>

          <label className="block text-xs font-medium text-zinc-700">
            Title <span className="text-red-600">*</span>
            <input
              required
              autoFocus
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Send revised drawings"
              className={`mt-1 ${field}`}
            />
          </label>

          <label className="block text-xs font-medium text-zinc-700">
            Details
            <textarea
              rows={3}
              maxLength={5000}
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              className={`mt-1 resize-y ${field}`}
            />
          </label>

          {!client && (
            <div className="text-xs font-medium text-zinc-700">
              Client <span className="font-normal text-zinc-500">(optional)</span>
              {picked ? (
                <p className="mt-1 flex items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900">
                  {picked.name}
                  <button type="button" onClick={() => setPicked(null)} className="text-xs font-semibold text-gold-ink hover:underline">
                    Change
                  </button>
                </p>
              ) : (
                <div className="relative mt-1">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, phone or email" aria-label="Client" className={field} />
                  {query.trim().length >= 2 && matches.length > 0 && (
                    <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg">
                      {matches.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setPicked({ id: m.id, name: m.name })}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                          >
                            <span className="font-medium text-zinc-900">{m.name}</span>
                            {m.detail && <span className="ml-2 text-xs text-zinc-500">{m.detail}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-zinc-700">
              Assign to
              <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className={`mt-1 ${field}`}>
                <option value="">Unassigned</option>
                {people.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id === meId ? "Me" : t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Due
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={`mt-1 ${field}`} />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              Priority
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })} className={`mt-1 ${field}`}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!canAssignOthers && <p className="text-xs text-zinc-500">Only managers and admins can assign a ticket to someone else.</p>}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => dialog.current?.close()} className="min-h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 sm:min-h-9">
              Cancel
            </button>
            <button type="submit" disabled={pending || !form.title.trim()} className="min-h-10 rounded-md bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-hover disabled:opacity-50 sm:min-h-9">
              {pending ? "Creating…" : "Create ticket"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
