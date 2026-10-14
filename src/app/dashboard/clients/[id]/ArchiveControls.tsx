"use client";

import { useState, useTransition } from "react";
import { archiveClient, restoreClient } from "../actions";
import { useConfirm } from "@/components/ui/confirm";
import { Archive, Ban } from "lucide-react";

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
  const confirm = useConfirm();

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
        <p className="text-sm font-semibold text-zinc-800">{archivedReason === "spam" ? "Marked as spam" : "Archived"}</p>
        <p className="mt-0.5 text-xs text-zinc-600">
          {archivedLabel} New messages are kept here but won&apos;t show as waiting in the Inbox or alert anyone.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => restoreClient({ clientId }))}
          className="mt-3 rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
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
        onClick={async () => {
          const ok = await confirm({
            title: `Archive ${clientName}?`,
            body: "Their open items are resolved and they leave the Inbox. You can restore them from Archived.",
            confirmLabel: "Archive",
          });
          if (ok) run(() => archiveClient({ clientId, reason: "archived" }));
        }}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
      >
        <Archive aria-hidden className="size-3.5" /> Archive
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({
            title: `Mark ${clientName} as spam?`,
            body: "They move to Archived, get a \"spam\" tag in GoHighLevel, and won't alert anyone or be messaged again.",
            confirmLabel: "Mark as spam",
            tone: "danger",
          });
          if (ok) run(() => archiveClient({ clientId, reason: "spam" }));
        }}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-red-300 hover:text-red-700"
      >
        <Ban aria-hidden className="size-3.5" /> Mark as spam
      </button>
      {note}
    </section>
  );
}
