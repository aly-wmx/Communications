/** The placeholder shown while a page loads: page loads (loading.tsx) and business switches use the same one. */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-7 w-48 animate-pulse rounded-md bg-zinc-200/70" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-zinc-200/60" />
      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-zinc-200/70" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-zinc-200/70" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
