"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ChatMessage {
  id: string;
  direction: string;
  channel: string;
  body: string;
  sentByUser: boolean;
  occurredAt: string;
}

const CALL_CHANNELS = new Set(["Call", "Missed call", "Voicemail"]);
/** Messages from the same side within this gap share one bubble group. */
const GROUP_GAP_MS = 5 * 60_000;

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function initials(name: string) {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const CHANNEL_TAG: Record<string, string> = { Email: "✉ Email", "Portal message": "💬 Chat" };

/**
 * Messaging-app style thread: client on the left, team on the right, grouped
 * bubbles, pinned day dividers, calls as pills. Opens at the newest message and
 * follows new ones while you're at the bottom.
 */
export function ChatThread({
  messages,
  clientName,
  olderHref,
  newerHref,
}: {
  messages: ChatMessage[];
  clientName: string;
  olderHref?: string;
  newerHref?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastId = useRef<string | undefined>(undefined);
  const [unseen, setUnseen] = useState(false);

  const scrollToBottom = (smooth: boolean) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  // Open at the newest message (unless browsing an older page).
  useLayoutEffect(() => {
    if (!newerHref) scrollToBottom(false);
  }, [newerHref]);

  // A live refresh brought new messages: follow them if at the bottom, otherwise offer a jump.
  useEffect(() => {
    const newest = messages.at(-1)?.id;
    if (lastId.current && newest && newest !== lastId.current) {
      if (atBottom.current) scrollToBottom(true);
      else setUnseen(true);
    }
    lastId.current = newest;
  }, [messages]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setUnseen(false);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto bg-[#F7F6F2] px-3 py-4 sm:px-6"
        role="log"
        aria-label={`Conversation with ${clientName}`}
      >
        {olderHref && (
          <p className="mb-4 text-center">
            <a href={olderHref} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#B08D57] shadow-sm hover:underline">
              ↑ Load older messages
            </a>
          </p>
        )}

        {messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-500">No messages copied for this client yet.</p>
        ) : (
          <ol className="space-y-0.5">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const newDay = !prev || dayLabel(prev.occurredAt) !== dayLabel(m.occurredAt);
              const isCall = CALL_CHANNELS.has(m.channel);
              const out = m.direction === "outbound";
              const sameSide = (a?: ChatMessage) =>
                a &&
                !CALL_CHANNELS.has(a.channel) &&
                a.direction === m.direction &&
                dayLabel(a.occurredAt) === dayLabel(m.occurredAt) &&
                Math.abs(new Date(a.occurredAt).getTime() - new Date(m.occurredAt).getTime()) < GROUP_GAP_MS;
              const first = !sameSide(prev);
              const last = !sameSide(next);
              const automated = out && !m.sentByUser;

              return (
                <li key={m.id} className={first && !newDay ? "pt-2" : ""}>
                  {newDay && (
                    <div className="sticky top-0 z-10 flex justify-center py-2">
                      <span className="rounded-full bg-white/90 px-3 py-0.5 text-[11px] font-semibold text-zinc-500 shadow-sm backdrop-blur">
                        {dayLabel(m.occurredAt)}
                      </span>
                    </div>
                  )}

                  {isCall ? (
                    <div className="flex justify-center py-1.5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          m.channel === "Missed call"
                            ? "bg-red-50 font-semibold text-red-700"
                            : m.channel === "Voicemail"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-white text-zinc-600 shadow-sm"
                        }`}
                      >
                        {m.channel === "Voicemail" ? "📼" : out ? "↗" : "📞"} {m.body} · {time(m.occurredAt)}
                      </span>
                    </div>
                  ) : (
                    <div className={`flex items-end gap-2 ${out ? "justify-end" : "justify-start"}`}>
                      {!out && (
                        <span
                          aria-hidden
                          className={`grid size-7 shrink-0 place-items-center rounded-full bg-[#1C2B47]/10 text-[10px] font-bold text-[#1C2B47] ${
                            last ? "" : "invisible"
                          }`}
                        >
                          {initials(clientName)}
                        </span>
                      )}
                      <div className={`flex max-w-[78%] flex-col ${out ? "items-end" : "items-start"}`}>
                        <div
                          className={`px-3.5 py-2 text-[14px] leading-snug shadow-sm ${
                            out
                              ? automated
                                ? "border border-[#1C2B47]/15 bg-white text-zinc-700"
                                : "bg-[#1C2B47] text-white"
                              : "bg-white text-zinc-900"
                          } rounded-2xl ${
                            // Grouped bubbles: tighter corners where they meet, a small "tail" on the last one.
                            out
                              ? `${first ? "" : "rounded-tr-md"} ${last ? "rounded-br-sm" : "rounded-br-md"}`
                              : `${first ? "" : "rounded-tl-md"} ${last ? "rounded-bl-sm" : "rounded-bl-md"}`
                          }`}
                        >
                          {CHANNEL_TAG[m.channel] && (
                            <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${out && !automated ? "text-white/60" : "text-zinc-400"}`}>
                              {CHANNEL_TAG[m.channel]}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words">
                            {m.body || (
                              <em className="opacity-70">
                                {m.channel === "Email" ? "Email — open in GoHighLevel to read it" : "(no text)"}
                              </em>
                            )}
                          </p>
                        </div>
                        {last && (
                          <p className="mt-1 px-1 text-[10px] text-zinc-400">
                            {automated && <span className="font-semibold text-zinc-500">Automated · </span>}
                            {time(m.occurredAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {newerHref && (
          <p className="mt-4 text-center">
            <a href={newerHref} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#B08D57] shadow-sm hover:underline">
              Jump to latest ↓
            </a>
          </p>
        )}
      </div>

      {unseen && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom(true);
            setUnseen(false);
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[#B08D57] px-4 py-1.5 text-xs font-semibold text-white shadow-lg"
        >
          New messages ↓
        </button>
      )}
    </div>
  );
}
