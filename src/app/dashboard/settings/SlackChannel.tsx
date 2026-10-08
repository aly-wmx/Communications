"use client";

import { useState, useTransition } from "react";
import { saveSlackChannel, testSlackChannel } from "./actions";

/** Admin: the team Slack channel. What gets posted there is chosen under Notifications. */
export function SlackChannel({ channelId, connected }: { channelId: string; connected: boolean }) {
  const [id, setId] = useState(channelId);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = id !== channelId;

  return (
    <section className="max-w-3xl space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Slack team channel</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Channel posts go here and tag the people involved. Choose which notifications are posted in the Notifications section above.
        </p>
        {!connected && <p className="mt-1 text-xs text-amber-700">Slack isn&apos;t connected yet — add SLACK_BOT_TOKEN in Vercel.</p>}
      </div>
      <label className="block text-xs text-zinc-600">
        Channel ID
        <input
          value={id}
          onChange={(e) => setId(e.target.value.trim())}
          placeholder="C0C7KR2UH9U"
          className="mt-1 block w-56 rounded-md border border-zinc-300 px-3 py-1.5 font-mono text-sm uppercase focus:border-zinc-400 focus:outline-none"
        />
        <span className="mt-1 block text-[11px] text-zinc-500">In Slack: open the channel → channel name → About → Channel ID at the bottom.</span>
      </label>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-[#3F7A5C]" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveSlackChannel({ channelId: id });
              setMessage(r.ok ? { text: "Saved.", ok: true } : { text: r.error, ok: false });
            })
          }
          className="rounded-md bg-[#1C2B47] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          disabled={pending || dirty || !channelId}
          title={dirty ? "Save first" : undefined}
          onClick={() =>
            startTransition(async () => {
              const r = await testSlackChannel();
              setMessage(r.ok ? { text: "Test posted — check the channel.", ok: true } : { text: r.error, ok: false });
            })
          }
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-40"
        >
          Send test to channel
        </button>
      </div>
    </section>
  );
}
