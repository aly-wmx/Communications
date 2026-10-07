"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { searchClients, startConversation, type ClientPick } from "../messaging/actions";

/** "+ New conversation": message an existing client, or a new person (created as a GHL contact). */
export function NewConversation() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientPick[]>([]);
  const [picked, setPicked] = useState<ClientPick | null>(null);
  const [person, setPerson] = useState({ name: "", phone: "", email: "", project: "" });
  const [channel, setChannel] = useState<"SMS" | "Email">("SMS");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Type-ahead search, debounced.
  useEffect(() => {
    if (mode !== "existing" || picked || query.trim().length < 2) return;
    const t = window.setTimeout(() => {
      void searchClients(query).then(setResults);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, mode, picked]);

  const hasPhone = mode === "new" ? Boolean(person.phone.trim()) : Boolean(picked?.hasPhone);
  const hasEmail = mode === "new" ? Boolean(person.email.trim()) : Boolean(picked?.hasEmail);

  function open() {
    setError(null);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const common = { channel, message, subject: channel === "Email" ? subject : undefined };
    const payload =
      mode === "existing"
        ? { mode, clientId: picked?.id ?? "", ...common }
        : { mode, ...person, ...common };
    if (mode === "existing" && !picked) return setError("Choose a client first.");
    startTransition(async () => {
      const result = await startConversation(payload);
      if (!result.ok) return setError(result.error);
      close();
      router.push(`/dashboard/clients/${result.clientId}`);
    });
  }

  const input = "w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none";

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-md bg-[#1C2B47] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-125"
      >
        + New conversation
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 p-0 shadow-xl backdrop:bg-black/40"
        aria-label="New conversation"
      >
        <form onSubmit={submit} className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">New conversation</h2>
            <button type="button" onClick={close} aria-label="Close" className="text-xl text-zinc-400 hover:text-zinc-700">
              ×
            </button>
          </div>

          <div role="tablist" className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 text-sm">
            {(
              [
                ["existing", "Existing client"],
                ["new", "New person"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={`flex-1 rounded-md py-1 ${mode === key ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            picked ? (
              <div className="flex items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm">
                <div>
                  <p className="font-semibold text-zinc-900">{picked.name}</p>
                  <p className="text-xs text-zinc-500">{picked.detail || "No contact details"}</p>
                </div>
                <button type="button" onClick={() => setPicked(null)} className="text-xs font-semibold text-[#B08D57] hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, phone or email…"
                  aria-label="Find a client"
                  className={input}
                />
                {query.trim().length >= 2 && (
                  <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border border-zinc-200">
                    {results.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-zinc-500">No matching clients — use “New person”.</li>
                    ) : (
                      results.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPicked(r);
                              setChannel(r.hasPhone ? "SMS" : "Email");
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                          >
                            <span className="font-semibold text-zinc-900">{r.name}</span>
                            <span className="block text-xs text-zinc-500">{r.detail}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={input} placeholder="Full name *" aria-label="Full name" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
              <input className={input} placeholder="Project / job" aria-label="Project" value={person.project} onChange={(e) => setPerson({ ...person, project: e.target.value })} />
              <input className={input} type="tel" placeholder="Mobile phone" aria-label="Phone" value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} />
              <input className={input} type="email" placeholder="Email" aria-label="Email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
              <p className="text-xs text-zinc-500 sm:col-span-2">They&apos;ll be added as a contact in GoHighLevel (or matched if they already exist).</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-1 text-xs">
              {(["SMS", "Email"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  disabled={c === "SMS" ? !hasPhone && mode === "existing" : !hasEmail && mode === "existing"}
                  className={`rounded-full px-2.5 py-0.5 font-semibold disabled:opacity-40 ${channel === c ? "bg-[#1C2B47] text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
                >
                  {c === "SMS" ? "💬 Text" : "✉ Email"}
                </button>
              ))}
            </div>
            {channel === "Email" && (
              <input className={input} placeholder="Subject" aria-label="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            )}
            <textarea
              rows={4}
              className={`${input} resize-y`}
              placeholder={channel === "SMS" ? "Type the text…" : "Write the email…"}
              aria-label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:border-zinc-400">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !message.trim()}
              className="rounded-md bg-[#B08D57] px-4 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
