"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import type { SlaSettings } from "@/lib/comms/types";
import { saveSla } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMMON_ZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Asia/Manila",
];

function minutesLabel(m: number) {
  if (m === 0) return "immediately";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function SlaForm({ initial, team }: { initial: SlaSettings; team: Array<{ id: string; name: string; escalation: boolean }> }) {
  const [v, setV] = useState<SlaSettings>(initial);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const zones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return [...COMMON_ZONES, ...all.filter((z) => !COMMON_ZONES.includes(z))];
  }, []);

  const num = (key: "reminderMinutes" | "escalateMinutes" | "urgentEscalateMinutes", value: string) =>
    setV({ ...v, [key]: Math.max(0, Math.round(Number(value) || 0)) });
  const bh = (patch: Partial<SlaSettings["businessHours"]>) => setV({ ...v, businessHours: { ...v.businessHours, ...patch } });

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveSla({ ...v, timeZone: v.timeZone ?? "" });
      setMessage(result.ok ? { text: "Saved. The queue and alerts use the new matrix now.", ok: true } : { text: result.error, ok: false });
    });
  }

  const managers = team.filter((t) => t.escalation).map((t) => t.name);
  const input = "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none";

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-5 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Escalation matrix</h2>
        <p className="mt-1 text-sm text-zinc-600">How long a client can wait for a first response before the queue warns, then escalates.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-zinc-600">
          Remind the assignee after (minutes)
          <input type="number" min={1} value={v.reminderMinutes} onChange={(e) => num("reminderMinutes", e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-xs text-zinc-600">
          Escalate after (minutes)
          <input type="number" min={1} value={v.escalateMinutes} onChange={(e) => num("escalateMinutes", e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="text-xs text-zinc-600">
          Escalate urgent after (minutes, 0 = immediately)
          <input type="number" min={0} value={v.urgentEscalateMinutes} onChange={(e) => num("urgentEscalateMinutes", e.target.value)} className={`${input} mt-1`} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-zinc-600">
          Business time zone
          <select value={v.timeZone ?? ""} onChange={(e) => setV({ ...v, timeZone: e.target.value })} className={`${input} mt-1`}>
            <option value="">Choose…</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          {!initial.timeZone && <span className="mt-1 block text-amber-700">Not set yet — wait times may be off until you choose one.</span>}
        </label>
        <label className="text-xs text-zinc-600">
          Default assignee for new messages
          <select value={v.defaultAssigneeId} onChange={(e) => setV({ ...v, defaultAssigneeId: e.target.value })} className={`${input} mt-1`}>
            <option value="">Unassigned</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-3 rounded-md border border-zinc-200 p-3">
        <legend className="px-1 text-xs font-semibold text-zinc-700">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.businessHours.enabled} onChange={(e) => bh({ enabled: e.target.checked })} className="accent-[#B08D57]" />
            Only count business hours
          </label>
        </legend>
        <p className="text-xs text-zinc-500">When on, a text at 9pm doesn&apos;t start ageing until opening time.</p>
        <div className={`flex flex-wrap items-end gap-4 ${v.businessHours.enabled ? "" : "pointer-events-none opacity-50"}`}>
          <label className="text-xs text-zinc-600">
            Opens
            <input type="time" value={v.businessHours.start} onChange={(e) => bh({ start: e.target.value })} className={`${input} mt-1 w-32`} />
          </label>
          <label className="text-xs text-zinc-600">
            Closes
            <input type="time" value={v.businessHours.end} onChange={(e) => bh({ end: e.target.value })} className={`${input} mt-1 w-32`} />
          </label>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {DAYS.map((d, i) => {
              const on = v.businessHours.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => bh({ days: on ? v.businessHours.days.filter((x) => x !== i) : [...v.businessHours.days, i].sort() })}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${on ? "bg-[#1C2B47] text-white" : "border border-zinc-300 text-zinc-500"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      </fieldset>

      <p className="rounded-md bg-[#B08D5712] p-3 text-sm text-zinc-800">
        A normal message turns <strong>amber after {minutesLabel(v.reminderMinutes)}</strong> and{" "}
        <strong>escalates after {minutesLabel(v.escalateMinutes)}</strong>
        {v.businessHours.enabled ? " of business time" : ""}. Urgent messages escalate <strong>{minutesLabel(v.urgentEscalateMinutes)}</strong>.
        Escalations go to {managers.length ? managers.join(" & ") : "nobody yet — tick “Escalations” on the Team page"}.
      </p>
      {v.reminderMinutes > v.escalateMinutes && <p className="text-xs text-amber-700">The reminder comes after escalation, so it will be skipped.</p>}

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-[#3F7A5C]" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!dirty || pending} className="rounded-md bg-[#1C2B47] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? "Saving…" : "Save matrix"}
        </button>
        {dirty && (
          <button type="button" onClick={() => setV(initial)} className="text-sm text-zinc-500 hover:text-zinc-900">
            Discard changes
          </button>
        )}
      </div>
    </form>
  );
}
