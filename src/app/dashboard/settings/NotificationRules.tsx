"use client";

import { useState, useTransition } from "react";
import { saveNotificationRules } from "./actions";

const KINDS = [
  ["escalation", "Escalations", "A client waited past the target, or someone pressed Escalate. Goes to the people chosen."],
  ["picked_up", "Picked up", "Someone said “I’ve got it” — tells the others they can stand down."],
  ["mention", "Mentions & reply flags", "Someone @mentioned a teammate or flagged a client for them to reply to."],
  ["reminder", "Reminders", "A client assigned to someone is close to the escalation time."],
  ["new_message", "New client messages", "Every new text, email or call, to whoever it’s assigned to."],
] as const;

type Rules = { email: string[]; dm: string[]; channel: string[] };
const COLUMNS: { key: keyof Rules; label: string; hint: string }[] = [
  { key: "email", label: "Email", hint: "Through GoHighLevel, to each person’s sign-in email" },
  { key: "dm", label: "Slack DM", hint: "Direct message to each person (needs their Slack member ID on the Team page)" },
  { key: "channel", label: "Team channel", hint: "One post in the Slack team channel, tagging the people involved" },
];

const same = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

/** Admin: which notifications leave the portal, and how. The bell and pop-ups always show everything. */
export function NotificationRules({ initial, slackConnected }: { initial: Rules; slackConnected: boolean }) {
  const [rules, setRules] = useState<Rules>(initial);
  const [saved, setSaved] = useState<Rules>(initial);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = COLUMNS.some((c) => !same(rules[c.key], saved[c.key]));

  function toggle(col: keyof Rules, kind: string) {
    setMessage(null);
    setRules((r) => ({ ...r, [col]: r[col].includes(kind) ? r[col].filter((k) => k !== kind) : [...r[col], kind] }));
  }

  function save() {
    startTransition(async () => {
      const r = await saveNotificationRules(rules);
      if (r.ok) setSaved(rules);
      setMessage(r.ok ? { text: "Saved. New notifications follow these settings.", ok: true } : { text: r.error, ok: false });
    });
  }

  return (
    <section className="max-w-3xl space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Notifications</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Choose what goes out by email and Slack. Everything always shows in the portal&apos;s 🔔 bell and pop-ups. Each person can
          still turn email or Slack off for themselves on their Notifications page.
        </p>
        {!slackConnected && (
          <p className="mt-1 text-xs text-amber-700">Slack isn&apos;t connected yet — Slack DMs and channel posts start once SLACK_BOT_TOKEN is added in Vercel.</p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-600">
              <th className="py-2 pr-3 font-semibold">Notification</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="w-14 px-1 py-2 text-center text-[11px] font-semibold leading-tight sm:w-24 sm:px-2 sm:text-xs" title={c.hint}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {KINDS.map(([kind, label, hint]) => (
              <tr key={kind}>
                <td className="py-2.5 pr-3">
                  <span className="block font-medium text-zinc-900">{label}</span>
                  <span className="block text-xs text-zinc-500">{hint}</span>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-1 py-2.5 text-center sm:px-2">
                    <input
                      type="checkbox"
                      checked={rules[c.key].includes(kind)}
                      onChange={() => toggle(c.key, kind)}
                      disabled={pending}
                      aria-label={`${label} by ${c.label}`}
                      className="size-4 accent-[#B08D57]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-0.5 text-[11px] text-zinc-500">
        {COLUMNS.map((c) => (
          <li key={c.key}>
            <span className="font-semibold text-zinc-600">{c.label}:</span> {c.hint}.
          </li>
        ))}
      </ul>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-[#3F7A5C]" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="rounded-md bg-[#1C2B47] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setRules(saved)}
            disabled={pending}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400"
          >
            Undo changes
          </button>
        )}
      </div>
    </section>
  );
}
