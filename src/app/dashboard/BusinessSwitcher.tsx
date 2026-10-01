"use client";

import { useTransition } from "react";
import type { Business } from "@/lib/business";
import { selectBusiness } from "./actions";

export function BusinessSwitcher({ businesses, currentId }: { businesses: Business[]; currentId: string }) {
  const [pending, startTransition] = useTransition();
  const current = businesses.find((b) => b.id === currentId);

  return (
    <div className="border-b border-zinc-200 px-4 py-3">
      <label htmlFor="business" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        Business
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: current?.color }} />
        <select
          id="business"
          value={currentId}
          disabled={pending || businesses.length < 2}
          onChange={(e) => startTransition(() => selectBusiness(e.target.value))}
          className="w-full truncate rounded-md border border-transparent bg-transparent py-1 text-sm font-semibold text-[#1C2B47] hover:border-zinc-200 focus:border-zinc-400 focus:outline-none disabled:cursor-default disabled:hover:border-transparent"
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
