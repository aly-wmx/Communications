"use client";

import { useRef, useState, useTransition } from "react";
import { MentionTextarea } from "@/components/MentionTextarea";
import { smsSegments } from "@/lib/comms/outbound";
import { sendReply } from "../../messaging/actions";
import { addTeamNote } from "../../team-chat/actions";

/**
 * Reply box: text or email to the client through GoHighLevel, or a team-only
 * note (yellow, never sent) with @mentions. Enter sends, Shift+Enter adds a line.
 */
export function Composer({
  clientId,
  hasPhone,
  hasEmail,
  canSend,
  team,
}: {
  clientId: string;
  hasPhone: boolean;
  hasEmail: boolean;
  canSend: boolean;
  team: Array<{ id: string; name: string }>;
}) {
  const [mode, setMode] = useState<"client" | "note">(canSend && (hasPhone || hasEmail) ? "client" : "note");
  const [channel, setChannel] = useState<"SMS" | "Email">(hasPhone || !hasEmail ? "SMS" : "Email");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  const clientReachable = canSend && (hasPhone || hasEmail);
  const isNote = mode === "note";
  const ready = message.trim().length > 0 && (isNote || channel === "SMS" || subject.trim().length > 0) && !pending;
  const segments = !isNote && channel === "SMS" ? smsSegments(message) : 0;

  function send() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = isNote
        ? await addTeamNote({ clientId, body: message })
        : await sendReply({ clientId, channel, message, subject: channel === "Email" ? subject : undefined });
      if (result.ok) {
        setMessage("");
        setSubject("");
        box.current?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <footer className={`border-t border-zinc-200 px-3 py-2.5 ${isNote ? "bg-amber-50" : "bg-white"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        <div className="mr-2 flex rounded-full bg-zinc-100 p-0.5" role="radiogroup" aria-label="Who is this for">
          <button
            type="button"
            role="radio"
            aria-checked={!isNote}
            disabled={!clientReachable}
            title={clientReachable ? undefined : "This client has no phone number or email"}
            onClick={() => setMode("client")}
            className={`rounded-full px-2.5 py-0.5 font-semibold disabled:opacity-40 ${!isNote ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}
          >
            Client
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isNote}
            onClick={() => setMode("note")}
            className={`rounded-full px-2.5 py-0.5 font-semibold ${isNote ? "bg-amber-200 text-amber-950 shadow-sm" : "text-zinc-500"}`}
          >
            🔒 Team note
          </button>
        </div>
        {!isNote && (["SMS", "Email"] as const).map((c) => {
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
          {isNote
            ? "Only your team sees this · type @ to mention someone"
            : channel === "SMS" && message
              ? `${[...message].length} chars · ${segments} SMS${segments > 1 ? " segments" : ""}`
              : "Sent through GoHighLevel"}
        </span>
      </div>

      {!isNote && channel === "Email" && (
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
        <MentionTextarea
          ref={box}
          value={message}
          onValueChange={setMessage}
          onSubmit={send}
          team={team}
          rows={Math.min(6, Math.max(1, message.split("\n").length))}
          placeholder={isNote ? "Note for the team… (@ to mention)" : channel === "SMS" ? "Type a text…" : "Write your email…"}
          aria-label={isNote ? "Team note" : "Message"}
          disabled={pending}
          className={`max-h-40 min-h-[2.5rem] resize-none rounded-2xl border px-4 py-2 text-sm focus:outline-none ${
            isNote ? "border-amber-300 bg-white focus:border-amber-500" : "border-zinc-200 bg-[#F7F6F2] focus:border-zinc-400 focus:bg-white"
          }`}
        />
        <button
          type="button"
          onClick={send}
          disabled={!ready}
          aria-label="Send"
          className={`grid size-10 shrink-0 place-items-center rounded-full text-white shadow-sm hover:brightness-110 disabled:opacity-40 ${isNote ? "bg-amber-500" : "bg-[#B08D57]"}`}
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
