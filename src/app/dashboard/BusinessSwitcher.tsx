"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { Business } from "@/lib/business";
import { selectBusiness } from "./actions";
import { useNavProgress } from "./NavProgress";

export function BusinessSwitcher({ businesses, currentId }: { businesses: Business[]; currentId: string }) {
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<Business | null>(null);
  const { start, done, setSwitching } = useNavProgress();
  const current = businesses.find((b) => b.id === currentId);

  // The page refreshes in place (no new URL), so the bar ends when the switch does.
  const switching = useRef(false);
  useEffect(() => {
    // Only when a switch this started has finished; never while another screen is loading.
    if (!pending && switching.current) {
      switching.current = false;
      setSwitching(false);
      done();
    }
  }, [pending, done, setSwitching]);

  function choose(id: string) {
    setTarget(businesses.find((b) => b.id === id) ?? null);
    switching.current = true;
    setSwitching(true);
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

    </div>
  );
}
