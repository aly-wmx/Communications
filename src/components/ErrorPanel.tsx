"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * What a page shows when loading it failed: a plain explanation, Try again, and a
 * reference that matches the server log. Used by the error.tsx boundaries.
 */
export function ErrorPanel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
      <p className="text-base font-semibold text-zinc-900">This page couldn&apos;t load</p>
      <p className="mt-2 text-sm text-zinc-600">
        Usually a dropped connection or a brief database hiccup. Nothing you entered was lost.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover"
        >
          Try again
        </button>
        <Link href="/dashboard" className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400">
          Go to Overview
        </Link>
      </div>
      {error.digest && <p className="mt-4 text-xs text-zinc-500">Reference: {error.digest}</p>}
    </div>
  );
}
