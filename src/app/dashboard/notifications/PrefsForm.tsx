"use client";

import { useState, useTransition } from "react";
import { saveMyNotificationPrefs, sendTestNotification } from "../escalations/actions";

export interface Prefs {
  slack: boolean;
  email: boolean;
  new_messages: boolean;
  reminders: boolean;
}

export function PrefsForm({ initial, canSlack, canEmail }: { initial: Prefs; canSlack: string; canEmail: string }) {
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
          The 🔔 bell and pop-ups show everything. Only <strong className="font-semibold text-zinc-700">escalations</strong> also go out by
          Slack and email — new messages, reminders, pick-ups and mentions stay in the portal.
        </p>
      </div>
      <div className="divide-y divide-zinc-100">
        {row("slack", "Slack direct messages", "Escalations sent to you.", canSlack)}
        {row("email", "Email (sent through GoHighLevel)", "Escalations sent to you, at your sign-in email.", canEmail)}
      </div>
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
