"use client";

import { useState, useTransition } from "react";
import { STAGES, STAGE_STYLE, type Stage } from "@/lib/stages";
import { setClientStage } from "../actions";

/** Where the client is in the journey; changes are kept in history and mirrored to GoHighLevel as a tag. */
export function StagePicker({ clientId, stage, history }: { clientId: string; stage: Stage | null; history: string[] }) {
  const [value, setValue] = useState<Stage | null>(stage);
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: Stage | null) {
    const prev = value;
    setValue(next);
    setMessage(null);
    startTransition(async () => {
      const r = await setClientStage({ clientId, stage: next });
      if (!r.ok) {
        setValue(prev);
        setMessage({ text: r.error, warn: false });
      } else if (r.warning) {
        setMessage({ text: r.warning, warn: true });
      }
    });
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stage</h2>
      <select
        aria-label="Client stage"
        value={value ?? ""}
        disabled={pending}
        onChange={(e) => change((e.target.value || null) as Stage | null)}
        className={`mt-2 w-full rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm font-semibold ${value ? STAGE_STYLE[value] : "bg-white text-zinc-500"}`}
      >
        <option value="">No stage yet</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {message && <p className={`mt-1.5 text-xs ${message.warn ? "text-amber-700" : "text-red-600"}`}>{message.text}</p>}
      {history.length > 0 && (
        <ol className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
          {history.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
