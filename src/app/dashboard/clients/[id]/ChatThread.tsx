"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RecordingPlayer } from "./RecordingPlayer";
import { channelStyle, type Attachment } from "@/lib/comms/channels";
import type { EmailMeta } from "@/lib/comms/email-meta";

export interface ChatMessage {
  id: string;
  direction: string;
  channel: string;
  body: string;
  sentByUser: boolean;
  occurredAt: string;
  attachments: Attachment[];
  /** Set for team-only notes (who wrote it). */
  noteAuthor?: string;
  /** "Aly · via Portal", "Reid · via GoHighLevel", "Automated · GHL workflow", "via GoHighLevel"… */
  sender?: string;
  /** For team notes: who's been asked to reply to the client. */
  flaggedFor?: string;
  /** Emails: From / To / Cc / Subject. */
  emailMeta?: EmailMeta | null;
}

/** The email's header lines, like an email client. */
function EmailHeader({ meta, light }: { meta: EmailMeta; light: boolean }) {
  const row = (label: string, value: string) =>
    value ? (
      <p className="flex gap-1.5">
        <span className={`w-11 shrink-0 ${light ? "text-white/60" : "text-zinc-400"}`}>{label}</span>
        <span className="min-w-0 break-words">{value}</span>
      </p>
    ) : null;
  return (
    <div className={`mb-2 space-y-0.5 border-b pb-2 text-[11px] ${light ? "border-white/20 text-white/90" : "border-zinc-200 text-zinc-600"}`}>
      {meta.subject && <p className={`text-[13px] font-semibold ${light ? "text-white" : "text-zinc-900"}`}>{meta.subject}</p>}
      {row("From", meta.from)}
      {row("To", meta.to.join(", "))}
      {row("Cc", meta.cc.join(", "))}
      {row("Bcc", meta.bcc.join(", "))}
    </div>
  );
}

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

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

/** One attachment: photo thumbnail, inline video/audio player, or a download chip. */
function AttachmentItem({ src, a, light }: { src: string; a: Attachment; light: boolean }) {
  // Links without a file type (e.g. Facebook) are tried as a photo first, then offered as a link.
  const [failed, setFailed] = useState(false);
  const chip = (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex max-w-full items-center gap-1 truncate rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline ${
        light ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-700"
      }`}
    >
      📎 {a.kind === "unknown" ? "Open attachment" : a.name}
    </a>
  );
  if (failed || a.kind === "file") return chip;
  if (a.kind === "video") {
    return <video src={src} controls preload="metadata" playsInline className="max-h-72 max-w-full rounded-lg bg-black" onError={() => setFailed(true)} />;
  }
  if (a.kind === "audio") {
    return <audio src={src} controls preload="none" className="h-9 w-64 max-w-full" onError={() => setFailed(true)} />;
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- streamed through the portal, not a static asset */}
      <img src={src} alt={a.name} loading="lazy" onError={() => setFailed(true)} className="max-h-60 max-w-full rounded-lg object-cover" />
    </a>
  );
}

function Attachments({ messageId, items, light }: { messageId: string; items: Attachment[]; light: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((a, i) => (
        <AttachmentItem key={i} src={`/api/media/${encodeURIComponent(messageId)}/${i}`} a={a} light={light} />
      ))}
    </div>
  );
}

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
                !a.noteAuthor &&
                !m.noteAuthor &&
                !CALL_CHANNELS.has(a.channel) &&
                a.direction === m.direction &&
                a.sender === m.sender &&
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

                  {m.noteAuthor ? (
                    <div className="flex justify-center py-1.5">
                      <div className="w-full max-w-[85%] rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-[14px] shadow-sm">
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800" title={fullDate(m.occurredAt)}>
                          🔒 Team note · {m.noteAuthor} · {time(m.occurredAt)}
                        </p>
                        {m.flaggedFor && (
                          <p className="mb-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-800">
                            🚩 Flagged for {m.flaggedFor} to reply
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-zinc-900">
                          {m.body.split(/(@[A-Z][\w]*(?: [A-Z][\w]*)?)/g).map((part, k) =>
                            part.startsWith("@") ? (
                              <strong key={k} className="text-amber-900">
                                {part}
                              </strong>
                            ) : (
                              part
                            ),
                          )}
                        </p>
                      </div>
                    </div>
                  ) : isCall ? (
                    <div className="flex justify-center py-1.5">
                      <span
                        className={`flex flex-wrap items-center justify-center gap-2 rounded-2xl px-3 py-1 text-xs ${
                          m.channel === "Missed call"
                            ? "bg-red-50 font-semibold text-red-700"
                            : m.channel === "Voicemail"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-white text-zinc-600 shadow-sm"
                        }`}
                      >
                        <span>
                          {m.channel === "Voicemail" ? "📼" : out ? "↗" : "📞"} {m.body} · {time(m.occurredAt)}
                        </span>
                        {m.channel === "Voicemail" && <RecordingPlayer messageId={m.id} label="Play voicemail" />}
                        {m.channel === "Call" && /completed|answered/i.test(m.body) && (
                          <RecordingPlayer messageId={m.id} label="Recording" />
                        )}
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
                              : `border-l-4 bg-white text-zinc-900 ${channelStyle(m.channel).border}`
                          } rounded-2xl ${
                            // Grouped bubbles: tighter corners where they meet, a small "tail" on the last one.
                            out
                              ? `${first ? "" : "rounded-tr-md"} ${last ? "rounded-br-sm" : "rounded-br-md"}`
                              : `${first ? "" : "rounded-tl-md"} ${last ? "rounded-bl-sm" : "rounded-bl-md"}`
                          }`}
                        >
                          {/* Every bubble says where it came from, so texts and emails are easy to tell apart. */}
                          <p className="mb-1">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                out && !automated ? "bg-white/15 text-white" : channelStyle(m.channel).tag
                              }`}
                            >
                              <span aria-hidden>{channelStyle(m.channel).icon}</span>
                              {m.channel === "Text" ? "Text message" : channelStyle(m.channel).label}
                            </span>
                          </p>
                          {m.emailMeta && (m.emailMeta.from || m.emailMeta.to.length || m.emailMeta.subject) && (
                            <EmailHeader meta={m.emailMeta} light={out && !automated} />
                          )}
                          {(m.body || !m.attachments.length) && (
                            <p className="whitespace-pre-wrap break-words">
                              {m.body || (
                                <em className="opacity-70">
                                  {m.channel === "Email" ? "Email — open in GoHighLevel to read it" : "(no text)"}
                                </em>
                              )}
                            </p>
                          )}
                          <Attachments messageId={m.id} items={m.attachments} light={out && !automated} />
                        </div>
                        {last && (
                          <p className="mt-1 px-1 text-[10px] text-zinc-400" title={fullDate(m.occurredAt)}>
                            {m.sender && (
                              <span className={`font-semibold ${out && !automated ? "text-[#1C2B47]" : "text-zinc-500"}`}>{m.sender} · </span>
                            )}
                            {!m.sender && automated && <span className="font-semibold text-zinc-500">Automated · </span>}
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
