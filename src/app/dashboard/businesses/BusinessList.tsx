"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableTextCell } from "@/components/EditableCell";
import type { Business } from "@/lib/business";
import { addBusiness, updateBusinessField } from "./actions";
import { onRadioKeys } from "@/lib/radio-keys";

/** What the Businesses page shows about a business's GoHighLevel sub-account (worked out on the server; no tokens). */
export interface GhlConnection {
  locationId: string;
  /** Uses GHL_LOCATION_ID from Vercel rather than a location set here. */
  inherited: boolean;
  status: string;
  ok: boolean;
}

const SWATCHES = ["#1C2B47", "#2B4438", "#B08D57", "#7A2E3A", "#3F5E8C", "#5B4B8A"];

function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Colour" onKeyDown={(e) => !disabled && onRadioKeys(e, SWATCHES, value, onChange)}>
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          tabIndex={value === c ? 0 : -1}
          aria-label={c}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={`size-6 rounded-full border-2 disabled:opacity-50 ${value === c ? "border-zinc-900" : "border-white ring-1 ring-zinc-200"}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function BusinessRow({ business, ghl }: { business: Business; ghl?: GhlConnection }) {
  const [color, setColor] = useState(business.color);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleColor(next: string) {
    const prev = color;
    setColor(next);
    setError(null);
    startTransition(async () => {
      const result = await updateBusinessField({ id: business.id, field: "color", value: next });
      if (!result.ok) {
        setColor(prev);
        setError(result.error);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-4 border-b border-zinc-100 px-3 py-3 last:border-0">
      <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-48 flex-1">
        <EditableTextCell
          value={business.name}
          onSave={(value) => updateBusinessField({ id: business.id, field: "name", value })}
        />
      </div>
      <ColorPicker value={color} onChange={handleColor} disabled={pending} />
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 pl-7">
        <span className="text-xs font-medium text-zinc-600">GoHighLevel location ID</span>
        <div className="w-64">
          <EditableTextCell
            value={ghl?.locationId ?? ""}
            placeholder={ghl?.inherited ? "Using GHL_LOCATION_ID from Vercel" : "Not connected"}
            onSave={(value) => updateBusinessField({ id: business.id, field: "ghl_location_id", value })}
          />
        </div>
        {ghl && <span className={`text-xs ${ghl.ok ? "text-[#3F7A5C]" : "text-amber-700"}`}>{ghl.status}</span>}
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function BusinessList({ businesses, ghl }: { businesses: Business[]; ghl: Record<string, GhlConnection> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[1]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addBusiness({ name, color });
      if (result.ok) setName("");
      else setError(result.error);
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      <ul className="rounded-md border border-zinc-200 bg-white">
        {businesses.map((b) => (
          <BusinessRow key={b.id} business={b} ghl={ghl[b.id]} />
        ))}
      </ul>

      <form onSubmit={handleAdd} className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Add a business</h2>
        <div className="flex flex-wrap items-center gap-4">
          <Input
            aria-label="Business name"
            placeholder="e.g. Manolo Roofing"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
          />
          <ColorPicker value={color} onChange={setColor} />
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Adding…" : "Add business"}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
