"use client";

import { useState, useTransition, type FormEvent } from "react";
import { updateClient } from "../actions";

export interface ClientInfo {
  id: string;
  name: string;
  project: string;
  phone: string;
  email: string;
  ownerId: string;
  notes: string;
}

/** Client details in the side panel, with inline editing. */
export function ClientDetails({ client, team }: { client: ClientInfo; team: Array<{ id: string; name: string }> }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(client);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "warn" | "ok" } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof ClientInfo, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ownerName = team.find((t) => t.id === client.ownerId)?.name;

  function start() {
    setForm(client);
    setMessage(null);
    setEditing(true);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateClient({ clientId: client.id, ...form });
      if (!result.ok) return setMessage({ text: result.error, tone: "error" });
      setEditing(false);
      setMessage(result.warning ? { text: result.warning, tone: "warn" } : { text: "Saved.", tone: "ok" });
    });
  }

  const input = "w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-400 focus:outline-none";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Client</h2>
        {!editing && (
          <button type="button" onClick={start} className="text-xs font-semibold text-[#B08D57] hover:underline">
            ✎ Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-2">
          {(
            [
              ["name", "Name", "text"],
              ["project", "Project / job", "text"],
              ["phone", "Phone", "tel"],
              ["email", "Email", "email"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="block text-xs text-zinc-600">
              {label}
              <input type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} className={`${input} mt-0.5`} />
            </label>
          ))}
          <label className="block text-xs text-zinc-600">
            Owner
            <select value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={`${input} mt-0.5 bg-white`}>
              <option value="">Default assignee</option>
              {team.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-600">
            Notes
            <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${input} mt-0.5 resize-y`} />
          </label>
          <p className="text-[11px] text-zinc-500">Name, phone and email are also updated in GoHighLevel.</p>
          {message?.tone === "error" && (
            <p role="alert" className="text-xs text-red-600">
              {message.text}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:border-zinc-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-[#1C2B47] px-3 py-1 text-xs font-semibold text-white hover:brightness-125 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="mt-2 space-y-1.5 text-sm">
            {[
              ["Project", client.project],
              ["Phone", client.phone],
              ["Email", client.email],
              ["Owner", ownerName],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-16 shrink-0 text-zinc-500">{label}</dt>
                <dd className="min-w-0 break-words text-zinc-800">{value || <span className="text-zinc-400">—</span>}</dd>
              </div>
            ))}
          </dl>
          {client.notes && <p className="mt-3 whitespace-pre-wrap rounded-md bg-zinc-50 p-2 text-xs text-zinc-700">{client.notes}</p>}
          {message && (
            <p
              role="status"
              className={`mt-2 text-xs ${message.tone === "warn" ? "text-amber-700" : message.tone === "ok" ? "text-[#3F7A5C]" : "text-red-600"}`}
            >
              {message.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}
