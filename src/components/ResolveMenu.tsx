"use client";

import { useEffect, useRef, useState } from "react";
import { RESOLVE_REASONS } from "@/lib/validation/queue";

/** "Resolve" in one click, or pick a reason that's saved to the contact's history. */
export function ResolveMenu({ onResolve, disabled }: { onResolve: (reason?: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const btn = "border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50";
  return (
    <div ref={box} className="relative inline-flex">
      <button type="button" disabled={disabled} onClick={() => onResolve()} className={`${btn} rounded-l-md`}>
        Resolve
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="Resolve with a reason"
        aria-expanded={open}
        className={`${btn} -ml-px rounded-r-md px-1.5`}
      >
        ▾
      </button>
      {open && (
        <ul className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg">
          {RESOLVE_REASONS.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onResolve(r);
                }}
                className="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50"
              >
                {r}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
