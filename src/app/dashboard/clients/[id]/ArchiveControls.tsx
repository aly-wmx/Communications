"use client";

import { useState, useTransition } from "react";
import { archiveClient, restoreClient } from "../actions";

/** Archive / mark as spam, or the "Archived" banner with Restore. */
export function ArchiveControls({
  clientId,
  clientName,
  archivedReason,
  archivedLabel,
}: {
  clientId: string;
  clientName: string;
  archivedReason: "spam" | "archived" | null;
  archivedLabel: string;
}) {
  const [message, setMessage] = useState<{ text: string; tone: "error" | "warn" } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>) {
    setMessage(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setMessage({ text: r.error, tone: "error" });
      else if (r.warning) setMessage({ text: r.warning, tone: "warn" });
    });
  }

  const note = message && (
    <p role="status" className={`mt-2 text-xs ${message.tone === "error" ? "text-red-600" : "text-amber-700"}`}>
      {message.text}
    </p>
  );

  if (archivedReason) {
    return (
      <section className="rounded-xl border border-zinc-300 bg-zinc-100 p-4">
        <p className="text-sm font-semibold text-zinc-800">{archivedReason === "spam" ? "🚫 Marked as spam" : "🗄 Archived"}</p>
        <p className="mt-0.5 text-xs text-zinc-600">
          {archivedLabel} New messages are kept here but won&apos;t reopen the queue or alert anyone.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => restoreClient({ clientId }))}
          className="mt-3 rounded-md bg-[#1C2B47] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Restore to active
        </button>
        {note}
      </section>
    );
  }

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Archive ${clientName}? Their open items are resolved and they leave the active lists.`)) {
            run(() => archiveClient({ clientId, reason: "archived" }));
          }
        }}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
      >
        🗄 Archive
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Mark ${clientName} as spam? They move to the Archived folder, get a "spam" tag in GoHighLevel, and won't alert anyone again.`)) {
            run(() => archiveClient({ clientId, reason: "spam" }));
          }
        }}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-red-300 hover:text-red-700"
      >
        🚫 Mark as spam
      </button>
      {note}
    </section>
  );
}
