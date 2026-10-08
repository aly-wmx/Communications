"use client";

import { useState, useTransition } from "react";
import { saveSignInAccess } from "./actions";

/** Admin: which email domains can join with Google, and who's blocked. */
export function SignInAccess({ domains: initialDomains, blocked: initialBlocked }: { domains: string[]; blocked: string[] }) {
  const [domains, setDomains] = useState(initialDomains);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(nextDomains: string[], nextBlocked: string[]) {
    setMessage(null);
    startTransition(async () => {
      const r = await saveSignInAccess({ domains: nextDomains, blocked: nextBlocked });
      if (r.ok) {
        setDomains(nextDomains);
        setBlocked(nextBlocked);
        setDraft("");
        setMessage({ text: "Saved.", ok: true });
      } else {
        setMessage({ text: r.error, ok: false });
      }
    });
  }

  return (
    <section className="max-w-3xl space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Allowed sign-in domains</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Anyone who signs in with <strong>Google</strong> using an address on these domains joins automatically as a{" "}
          <strong>Coordinator</strong> — admins get a notification and can change their role on the Team page. Password sign-in still needs to be added on Team first.
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {domains.length === 0 && <li className="text-sm text-zinc-500">None — only people on the Team list can sign in.</li>}
        {domains.map((d) => (
          <li key={d} className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-sm">
            @{d}
            <button
              type="button"
              disabled={pending}
              onClick={() => save(domains.filter((x) => x !== d), blocked)}
              aria-label={`Remove ${d}`}
              className="text-zinc-400 hover:text-red-600"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) save([...domains, draft.trim()], blocked);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. watermarkdesignbuild.com"
          aria-label="Add a domain"
          className="w-72 rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
        />
        <button type="submit" disabled={pending || !draft.trim()} className="rounded-md bg-[#1C2B47] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
          Add domain
        </button>
      </form>

      {blocked.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Blocked from joining automatically</h3>
          <p className="text-xs text-zinc-500">People you removed from the team. Unblock to let them join again with Google.</p>
          <ul className="mt-2 space-y-1">
            {blocked.map((b) => (
              <li key={b} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-1.5 text-sm">
                {b}
                <button type="button" disabled={pending} onClick={() => save(domains, blocked.filter((x) => x !== b))} className="text-xs font-semibold text-[#B08D57] hover:underline">
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-[#3F7A5C]" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
