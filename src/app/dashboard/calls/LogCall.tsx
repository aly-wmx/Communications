"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { searchClients, type ClientPick } from "../messaging/actions";
import { logCall } from "./actions";

function localNow() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** "Log a call" for calls made outside GoHighLevel. */
export function LogCall() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientPick[]>([]);
  const [picked, setPicked] = useState<ClientPick | null>(null);
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [outcome, setOutcome] = useState<"connected" | "missed" | "voicemail" | "failed">("connected");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(localNow);
  const [error, setError] = useState<string | null>(null);
  // The call was logged but something after it didn't save; shown next to the button once the form closes.
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (picked || query.trim().length < 2) return;
    const t = window.setTimeout(() => void searchClients(query).then(setResults), 250);
    return () => window.clearTimeout(t);
  }, [query, picked]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked) return setError("Choose the client.");
    setError(null);
    startTransition(async () => {
      const r = await logCall({
        clientId: picked.id,
        direction,
        outcome,
        durationMinutes: Number(minutes) || 0,
        note,
        occurredAt: new Date(when).toISOString(),
      });
      if (!r.ok) return setError(r.error);
      setWarning("warning" in r ? r.warning : null);
      dialog.current?.close();
      setPicked(null);
      setQuery("");
      setNote("");
      setMinutes("");
    });
  }

  const input = "w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none";
  const seg = (on: boolean) => `flex-1 rounded-md py-1 text-sm ${on ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWhen(localNow());
          setError(null);
          setWarning(null);
          dialog.current?.showModal();
        }}
        className="rounded-md bg-[#1C2B47] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-125"
      >
        + Log a call
      </button>
      {warning && (
        <p role="status" className="max-w-xs text-xs text-amber-800">
          {warning}
        </p>
      )}
      <dialog ref={dialog} aria-label="Log a call" className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 p-0 shadow-xl backdrop:bg-black/40">
        <form onSubmit={submit} className="space-y-3 p-5">
          <h2 className="text-base font-semibold text-zinc-900">Log a call</h2>
          {picked ? (
            <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm">
              <span>
                <span className="font-semibold">{picked.name}</span>
                <span className="block text-xs text-zinc-500">{picked.detail}</span>
              </span>
              <button type="button" onClick={() => setPicked(null)} className="text-xs font-semibold text-[#B08D57] hover:underline">
                Change
              </button>
            </div>
          ) : (
            <div>
              <input autoFocus className={input} placeholder="Find the client…" aria-label="Client" value={query} onChange={(e) => setQuery(e.target.value)} />
              {query.trim().length >= 2 && (
                <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-zinc-200">
                  {results.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-zinc-500">No matching clients.</li>
                  ) : (
                    results.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => setPicked(r)} className="w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50">
                          {r.name} <span className="text-xs text-zinc-500">{r.detail}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          )}
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5" role="radiogroup" aria-label="Direction">
            <button type="button" role="radio" aria-checked={direction === "outbound"} onClick={() => setDirection("outbound")} className={seg(direction === "outbound")}>
              ↗ We called
            </button>
            <button type="button" role="radio" aria-checked={direction === "inbound"} onClick={() => setDirection("inbound")} className={seg(direction === "inbound")}>
              ↙ They called
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-0.5 sm:grid-cols-4" role="radiogroup" aria-label="Outcome">
            {(["connected", "missed", "voicemail", "failed"] as const).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)} className={seg(outcome === o)}>
                {o[0].toUpperCase() + o.slice(1)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-zinc-600">
              When
              <input type="datetime-local" className={`${input} mt-1`} value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
            <label className="text-xs text-zinc-600">
              Length (minutes)
              <input type="number" min={0} step="0.5" className={`${input} mt-1`} value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={outcome !== "connected"} />
            </label>
          </div>
          <textarea rows={2} className={`${input} resize-y`} placeholder="Notes (optional)" aria-label="Notes" value={note} onChange={(e) => setNote(e.target.value)} />
          {direction === "inbound" && (outcome === "missed" || outcome === "voicemail") && (
            <p className="text-xs text-amber-700">This also adds them to the queue so someone calls back.</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="rounded-md bg-[#B08D57] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {pending ? "Saving…" : "Log call"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
