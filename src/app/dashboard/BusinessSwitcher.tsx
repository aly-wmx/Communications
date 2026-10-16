"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { Business } from "@/lib/business";
import { selectBusiness } from "./actions";
import { useNavProgress } from "./NavProgress";

export function BusinessSwitcher({ businesses, currentId }: { businesses: Business[]; currentId: string }) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Business | null>(null);
  const { start, done } = useNavProgress();
  const current = businesses.find((b) => b.id === currentId);

  // The page refreshes in place (no new URL), so the bar ends when the switch does.
  const switching = useRef(false);
  useEffect(() => {
    // Only when a switch this started has finished; never while another screen is loading.
    if (!pending && switching.current) {
      switching.current = false;
      done();
    }
  }, [pending, done]);

  function choose(id: string) {
    setTarget(businesses.find((b) => b.id === id) ?? null);
    switching.current = true;
    start();
    startTransition(() => selectBusiness(id));
  }

  return (
    <div className="border-b border-zinc-200 px-4 py-3">
      <label htmlFor="business" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Business
      </label>
      <div className="mt-1 flex items-center gap-2">
        {pending ? (
          <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-gold-ink" />
        ) : (
          <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: current?.color }} />
        )}
        <select
          id="business"
          value={pending && target ? target.id : currentId}
          disabled={pending || businesses.length < 2}
          onChange={(e) => choose(e.target.value)}
          className="w-full truncate rounded-md border border-transparent bg-transparent py-1 text-sm font-semibold text-navy hover:border-zinc-200 focus:border-zinc-400 focus:outline-none disabled:cursor-default disabled:hover:border-transparent"
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Until the new business loads, the page still shows the old one: cover it so it isn't mistaken for current. */}
      {pending && (
        <div role="status" className="fixed inset-0 z-40 grid place-items-center bg-page/70 backdrop-blur-[1px] lg:left-60">
          <p className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-navy shadow-lg">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Switching to {target?.name ?? "the business"}…
          </p>
        </div>
      )}
    </div>
  );
}
