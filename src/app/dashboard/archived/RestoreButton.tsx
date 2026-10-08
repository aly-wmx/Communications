"use client";

import { useState, useTransition } from "react";
import { restoreClient } from "../clients/actions";

export function RestoreButton({ clientId }: { clientId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await restoreClient({ clientId });
            setError(r.ok ? (r.warning ?? null) : r.error);
          })
        }
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
      >
        {pending ? "Restoring…" : "Restore"}
      </button>
      {error && <span className="mt-1 text-[11px] text-amber-700">{error}</span>}
    </span>
  );
}
