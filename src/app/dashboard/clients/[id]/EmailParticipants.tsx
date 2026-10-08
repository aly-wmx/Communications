"use client";

import { useState } from "react";

/** Everyone on this client's email threads (from, to, cc), with quick email and copy. */
export function EmailParticipants({
  people,
  clientEmail,
}: {
  people: Array<{ name: string; email: string; count: number }>;
  clientEmail: string;
}) {
  const [copied, setCopied] = useState("");
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? people : people.slice(0, 6);

  async function copy(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(email);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      // Clipboard blocked; the address is still visible to copy by hand.
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Email participants</h2>
      <p className="mt-0.5 text-[11px] text-zinc-500">Everyone on this client&apos;s emails (from, to and cc).</p>
      <ul className="mt-2 space-y-1.5">
        {shown.map((p) => (
          <li key={p.email} className="flex items-start justify-between gap-2 text-sm">
            <span className="min-w-0">
              {p.name && <span className="block truncate font-medium text-zinc-800">{p.name}</span>}
              <a href={`mailto:${p.email}`} className="block truncate text-xs text-[#1C2B47] underline-offset-2 hover:underline">
                {p.email}
              </a>
              <span className="text-[10px] text-zinc-400">
                {p.email === clientEmail.toLowerCase() ? "client · " : ""}
                on {p.count} email{p.count === 1 ? "" : "s"}
              </span>
            </span>
            <button type="button" onClick={() => void copy(p.email)} className="shrink-0 text-[11px] font-semibold text-[#B08D57] hover:underline">
              {copied === p.email ? "Copied" : "Copy"}
            </button>
          </li>
        ))}
      </ul>
      {people.length > 6 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 text-xs font-semibold text-[#B08D57] hover:underline">
          {showAll ? "Show fewer" : `Show all ${people.length}`}
        </button>
      )}
    </section>
  );
}
