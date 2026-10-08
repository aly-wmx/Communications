"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { escalateContact } from "./actions";

export interface EscalationMember {
  id: string;
  name: string;
  escalation: boolean;
}

/**
 * "Escalate" with a short note; managers who receive escalations are ticked by default.
 * With `hideTrigger` it renders only the dialog, opened on mount (used when a card is dragged onto "Awaiting pickup").
 */
export function EscalateButton({
  contactId,
  clientName,
  team,
  meId,
  className = "",
  highlight = false,
  hideTrigger = false,
  onClose,
}: {
  contactId: string;
  clientName: string;
  team: EscalationMember[];
  meId: string;
  className?: string;
  highlight?: boolean;
  hideTrigger?: boolean;
  onClose?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const defaults = team.filter((t) => t.escalation && t.id !== meId).map((t) => t.id);
  const [ids, setIds] = useState<string[]>(defaults);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (hideTrigger) dialog.current?.showModal();
  }, [hideTrigger]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ids.length) return setError("Choose at least one person to notify.");
    setError(null);
    startTransition(async () => {
      const result = await escalateContact({ contactId, note, recipientIds: ids });
      if (!result.ok) return setError(result.error);
      setNote("");
      dialog.current?.close();
    });
  }

  return (
    <>
      {!hideTrigger && (
      <button
        type="button"
        onClick={() => {
          setIds(defaults);
          setError(null);
          dialog.current?.showModal();
        }}
        className={
          className ||
          `rounded-md px-2.5 py-1 text-xs font-semibold ${
            highlight ? "bg-red-700 text-white hover:bg-red-800" : "border border-zinc-300 text-zinc-700 hover:border-zinc-400"
          }`
        }
      >
        Escalate
      </button>
      )}
      <dialog
        ref={dialog}
        onClose={() => {
          setError(null);
          onClose?.();
        }}
        aria-label={`Escalate ${clientName}`}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 p-0 shadow-xl backdrop:bg-black/40"
      >
        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Escalate {clientName}</h2>
            <p className="mt-1 text-sm text-zinc-600">They&apos;ll get a Slack message and an email, and it appears on the Escalations page.</p>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-semibold text-zinc-600">Notify</legend>
            {team
              .filter((t) => t.id !== meId)
              .map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    checked={ids.includes(t.id)}
                    onChange={(e) => setIds(e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id))}
                    className="accent-[#B08D57]"
                  />
                  {t.name}
                  {t.escalation && <span className="text-[11px] text-zinc-400">manager</span>}
                </label>
              ))}
          </fieldset>
          <label className="block text-xs font-semibold text-zinc-600">
            Why it needs attention (optional)
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Client upset about the tile delay"
              className="mt-1 w-full resize-y rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-normal focus:border-zinc-400 focus:outline-none"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="rounded-md bg-red-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50">
              {pending ? "Escalating…" : "Escalate"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
