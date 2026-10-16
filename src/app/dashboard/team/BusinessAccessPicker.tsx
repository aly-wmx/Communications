"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { setBusinessAccess } from "./actions";

/**
 * The businesses (GoHighLevel sub-accounts) one teammate can open, as a dropdown
 * of tick boxes in their Team row. Admins see every business. "In GHL" marks a
 * business whose sub-account lists them but which they can't open here yet.
 */
export function BusinessAccessPicker({
  member,
  isAdmin,
  businesses,
  granted,
  suggested,
}: {
  member: { id: string; name: string };
  isAdmin: boolean;
  businesses: Array<{ id: string; name: string }>;
  /** Business ids they can open. */
  granted: string[];
  /** Business ids GoHighLevel suggests (they're in that sub-account). */
  suggested: string[];
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  // Fixed to the button, so the table's scroll area can't clip it on the last rows.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [has, setHas] = useState(() => new Set(granted));
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  // A refreshed page (e.g. after "Grant all suggested") brings new grants.
  const [lastGranted, setLastGranted] = useState(granted.join());
  if (granted.join() !== lastGranted) {
    setLastGranted(granted.join());
    setHas(new Set(granted));
  }

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    // It's pinned to where the button was; close rather than float away when the page moves.
    const moved = () => setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [open]);

  if (isAdmin) return <p className="px-2 py-1 text-sm text-zinc-600">All businesses</p>;

  const names = businesses.filter((b) => has.has(b.id)).map((b) => b.name);
  const waiting = suggested.filter((id) => !has.has(id)).length;

  function toggle(businessId: string, name: string) {
    const grant = !has.has(businessId);
    const flip = (s: Set<string>) => {
      const next = new Set(s);
      if (grant) next.add(businessId);
      else next.delete(businessId);
      return next;
    };
    setHas(flip);
    startTransition(async () => {
      const result = await setBusinessAccess({ memberId: member.id, businessId, grant });
      if (!result.ok) {
        setHas((s) => {
          const back = new Set(s);
          if (grant) back.delete(businessId);
          else back.add(businessId);
          return back;
        });
        return toast(result.error, "error");
      }
      toast(grant ? `${member.name} can now open ${name}` : `${member.name} can no longer open ${name}`);
    });
  }

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => {
          const r = button.current?.getBoundingClientRect();
          // Open below the button, or above it when there isn't room.
          if (r) setAt({ top: r.bottom + 4 + 260 > window.innerHeight ? Math.max(8, r.top - 264) : r.bottom + 4, left: Math.min(r.left, window.innerWidth - 296) });
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Businesses ${member.name} can open: ${names.join(", ") || "none"}`}
        className="flex min-h-9 w-full items-center justify-between gap-2 rounded border border-transparent px-2 py-1 text-left text-sm hover:bg-zinc-100"
      >
        <span className={names.length ? "text-zinc-900" : "font-medium text-amber-700"}>{names.join(", ") || "No business"}</span>
        <span className="flex shrink-0 items-center gap-1">
          {waiting > 0 && <StatusPill tone="warning">{waiting} in GHL</StatusPill>}
          <ChevronDown aria-hidden className="size-4 text-zinc-500" />
        </span>
      </button>

      {open && at && (
        <div
          id={listId}
          role="group"
          aria-label={`Businesses for ${member.name}`}
          style={{ top: at.top, left: at.left }}
          className="fixed z-50 max-h-64 w-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1.5 shadow-xl"
        >
          <p className="px-2 pb-1.5 pt-1 text-xs text-zinc-500">They only see, and get alerts for, the businesses ticked here.</p>
          {businesses.map((b) => (
            <label key={b.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={has.has(b.id)}
                disabled={pending}
                onChange={() => toggle(b.id, b.name)}
                className="size-4 accent-navy"
              />
              <span className="flex-1 text-sm text-zinc-900">{b.name}</span>
              {!has.has(b.id) && suggested.includes(b.id) && <StatusPill tone="warning">In GHL</StatusPill>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
