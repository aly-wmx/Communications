"use client";

import { useState, useTransition } from "react";
import { saveMyNotificationPrefs, sendTestNotification } from "../escalations/actions";

export interface Prefs {
  slack: boolean;
  email: boolean;
  new_messages: boolean;
  reminders: boolean;
}

const KIND_LABEL: Record<string, string> = {
  escalation: "escalations",
  picked_up: "pick-ups",
  mention: "mentions and reply flags",
  reminder: "reminders",
  new_message: "new client messages",
};
const ORDER = Object.keys(KIND_LABEL);

/** "escalations, pick-ups and mentions" */
function list(kinds: string[]): string {
  const words = ORDER.filter((k) => kinds.includes(k)).map((k) => KIND_LABEL[k]);
  if (!words.length) return "nothing";
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function PrefsForm({
  initial,
  canSlack,
  canEmail,
  rules,
}: {
  initial: Prefs;
  canSlack: string;
  canEmail: string;
  /** Set by an admin in Settings → Notifications. */
  rules: { email: string[]; dm: string[] };
}) {
  const outside = [...rules.email, ...rules.dm];
  const [prefs, setPrefs] = useState(initial);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setMessage(null);
    startTransition(async () => {
      const r = await saveMyNotificationPrefs(next);
      if (!r.ok) {
        setPrefs(prefs);
        setMessage({ text: r.error, ok: false });
      }
    });
  }

  function test() {
    setMessage(null);
    startTransition(async () => {
      const r = await sendTestNotification();
      setMessage(r.ok ? { text: "Test sent — check Slack, your inbox, and the 🔔 bell. Results appear below.", ok: true } : { text: r.error, ok: false });
    });
  }

  const row = (key: keyof Prefs, label: string, hint: string, disabledReason = "") => (
    <label className={`flex items-start gap-3 py-2 ${disabledReason ? "opacity-60" : ""}`}>
      <input type="checkbox" checked={prefs[key]} onChange={() => toggle(key)} disabled={pending} className="mt-1 size-4 accent-[#B08D57]" />
      <span>
        <span className="block text-sm font-medium text-zinc-900">{label}</span>
        <span className="block text-xs text-zinc-500">{disabledReason || hint}</span>
      </span>
    </label>
  );

  return (
    <section className="max-w-2xl space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">How to reach you</h2>
        <p className="text-xs text-zinc-500">
          The 🔔 bell and pop-ups show everything. An admin chooses what also goes out by Slack and email (Settings → Notifications).
        </p>
      </div>
      <div className="divide-y divide-zinc-100">
        {row("slack", "Slack direct messages", `${cap(list(rules.dm))}.`, canSlack)}
        {row("email", "Email (sent through GoHighLevel)", `${cap(list(rules.email))}, to your sign-in email.`, canEmail)}
      </div>
      {(outside.includes("new_message") || outside.includes("reminder")) && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Also send me</h3>
          <div className="divide-y divide-zinc-100">
            {outside.includes("new_message") &&
              row("new_messages", "New client messages assigned to me", "A heads-up when a client texts, emails or calls and it's yours.")}
            {outside.includes("reminder") && row("reminders", "Reminders", "When a client assigned to me is about to go overdue.")}
          </div>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-[#3F7A5C]" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <button type="button" onClick={test} disabled={pending} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-50">
        Send me a test notification
      </button>
    </section>
  );
}
