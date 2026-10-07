"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { smsSegments } from "@/lib/comms/outbound";
import { sendReply } from "../../messaging/actions";

/** Reply box: text or email through GoHighLevel. Enter sends, Shift+Enter adds a line. */
export function Composer({ clientId, hasPhone, hasEmail }: { clientId: string; hasPhone: boolean; hasEmail: boolean }) {
  const [channel, setChannel] = useState<"SMS" | "Email">(hasPhone || !hasEmail ? "SMS" : "Email");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  if (!hasPhone && !hasEmail) {
    return (
      <footer className="border-t border-zinc-200 bg-white px-4 py-3 text-center text-xs text-zinc-500">
        This client has no phone number or email to reply to.
      </footer>
    );
  }

  const canSend = message.trim().length > 0 && (channel === "SMS" || subject.trim().length > 0) && !pending;
  const segments = channel === "SMS" ? smsSegments(message) : 0;

  function send() {
    if (!canSend) return;
    setError(null);
    startTransition(async () => {
      const result = await sendReply({ clientId, channel, message, subject: channel === "Email" ? subject : undefined });
      if (result.ok) {
        setMessage("");
        setSubject("");
        box.current?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  return (
    <footer className="border-t border-zinc-200 bg-white px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1 text-xs">
        {(["SMS", "Email"] as const).map((c) => {
          const available = c === "SMS" ? hasPhone : hasEmail;
          return (
            <button
              key={c}
              type="button"
              disabled={!available || pending}
              onClick={() => setChannel(c)}
              title={available ? undefined : `No ${c === "SMS" ? "phone number" : "email"} for this client`}
              className={`rounded-full px-2.5 py-0.5 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                channel === c ? "bg-[#1C2B47] text-white" : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {c === "SMS" ? "💬 Text" : "✉ Email"}
            </button>
          );
        })}
        <span className="ml-auto text-zinc-400">
          {channel === "SMS" && message
            ? `${[...message].length} chars · ${segments} SMS${segments > 1 ? " segments" : ""}`
            : "Sent through GoHighLevel"}
        </span>
      </div>

      {channel === "Email" && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          aria-label="Email subject"
          disabled={pending}
          className="mb-2 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
        />
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(6, Math.max(1, message.split("\n").length))}
          placeholder={channel === "SMS" ? "Type a text…" : "Write your email…"}
          aria-label="Message"
          disabled={pending}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-zinc-200 bg-[#F7F6F2] px-4 py-2 text-sm focus:border-zinc-400 focus:bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[#B08D57] text-white shadow-sm hover:brightness-110 disabled:opacity-40"
        >
          {pending ? "…" : "➤"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
      <p className="mt-1 text-[10px] text-zinc-400">Enter to send · Shift+Enter for a new line</p>
    </footer>
  );
}
