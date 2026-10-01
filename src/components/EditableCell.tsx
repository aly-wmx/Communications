"use client";

import { useEffect, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";

// Flashes briefly after a successful save, then clears itself — the
// original tool's fields saved silently unless something failed, so a
// field that *did* save looked identical to one that hadn't been touched
// yet. People double-edited fields unsure if the first edit took.
function useSavedFlash() {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timeout = setTimeout(() => setSaved(false), 1200);
    return () => clearTimeout(timeout);
  }, [saved]);

  return [saved, setSaved] as const;
}

interface EditableTextCellProps {
  value: string;
  onSave: (value: string) => Promise<ActionResult>;
  placeholder?: string;
  type?: "text" | "date";
}

// Shared by every module's editable tables (Social Tracker, KPIs, Stack,
// Tasks & Projects) — same "edit, save on blur, show the specific error
// and revert on failure" behavior everywhere, so it lives once.
export function EditableTextCell({ value, onSave, placeholder, type = "text" }: EditableTextCellProps) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useSavedFlash();

  function commit(next: string) {
    if (next === value) return;
    setError(null);
    startTransition(async () => {
      const result = await onSave(next);
      if (!result.ok) {
        setError(result.error);
        setDraft(value);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <div>
      <input
        type={type}
        className={`w-full rounded border bg-transparent px-2 py-1 text-sm transition-colors hover:bg-zinc-100 focus:border-zinc-400 focus:bg-white focus:outline-none disabled:opacity-50 ${
          saved ? "border-[#3F7A5C]" : "border-transparent"
        }`}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          if (type === "date") commit(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        disabled={pending}
      />
      {error && <p className="px-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface EditableSelectCellProps {
  value: string;
  options: readonly { value: string; label: string }[];
  onSave: (value: string) => Promise<ActionResult>;
}

export function EditableSelectCell({ value, options, onSave }: EditableSelectCellProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);
  const [saved, setSaved] = useSavedFlash();

  function handleChange(next: string) {
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const result = await onSave(next);
      if (!result.ok) {
        setError(result.error);
        setCurrent(previous);
      } else {
        setSaved(true);
      }
    });
  }

  return (
    <div>
      <select
        className={`w-full rounded border bg-transparent px-2 py-1 text-sm transition-colors hover:bg-zinc-100 focus:border-zinc-400 focus:bg-white focus:outline-none disabled:opacity-50 ${
          saved ? "border-[#3F7A5C]" : "border-transparent"
        }`}
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="px-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
