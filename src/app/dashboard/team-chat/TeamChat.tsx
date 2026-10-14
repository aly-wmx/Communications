"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MentionTextarea } from "@/components/MentionTextarea";
import { createClient } from "@/lib/supabase/client";
import { addTeamNote, deleteTeamNote } from "./actions";
import { formatStamp } from "@/lib/format-time";
import { useConfirm } from "@/components/ui/confirm";
import { SendHorizontal } from "lucide-react";

export interface ChannelMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}


function highlight(body: string) {
  return body.split(/(@[A-Z][\w]*(?: [A-Z][\w]*)?)/g).map((part, k) => (part.startsWith("@") ? <strong key={k}>{part}</strong> : part));
}

/** The team channel: chat bubbles, live, with @mentions. */
export function TeamChat({
  messages,
  meId,
  isAdmin,
  team,
  timeZone,
}: {
  messages: ChannelMessage[];
  meId: string;
  isAdmin: boolean;
  team: Array<{ id: string; name: string }>;
  /** The business's zone, so the server render and the browser print the same times. */
  timeZone: string;
}) {
  const time = (iso: string) => formatStamp(iso, timeZone);
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  // New posts from anyone show up without refreshing.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel("live:team-chat");
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "team_notes" }, () => router.refresh())
        .subscribe();
    })();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  function send() {
    if (!draft.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const r = await addTeamNote({ clientId: "", body: draft });
      if (!r.ok) return setError(r.error);
      setDraft("");
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-well px-4 py-4" role="log" aria-label="Team chat">
        {messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-500">No messages yet. Ask the team something — type @ to mention someone.</p>
        ) : (
          messages.map((m) => {
            const mine = m.authorId === meId;
            return (
              <div key={m.id} className={`group flex items-end gap-2 ${mine ? "justify-end" : ""}`}>
                {!mine && (
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy/10 text-[11px] font-bold text-navy">{initials(m.authorName)}</span>
                )}
                <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div className={`rounded-2xl px-3.5 py-2 text-[14px] shadow-sm ${mine ? "rounded-br-sm bg-navy text-white" : "rounded-bl-sm bg-white text-zinc-900"}`}>
                    <p className="whitespace-pre-wrap break-words">{highlight(m.body)}</p>
                  </div>
                  <p className="mt-1 flex items-center gap-2 px-1 text-[11px] text-zinc-500">
                    {!mine && <span className="font-semibold text-zinc-500">{m.authorName}</span>}
                    {time(m.createdAt)}
                    {(mine || isAdmin) && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!(await confirm({ title: "Delete this message?", confirmLabel: "Delete", tone: "danger" }))) return;
                          setError(null);
                          startTransition(async () => {
                            const result = await deleteTeamNote(m.id);
                            if (!result.ok) setError(result.error);
                          });
                        }}
                        // Always there on touch screens and for keyboards; on a mouse it appears on hover.
                        className="text-zinc-500 hover:text-red-600 focus:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      >
                        Delete
                      </button>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <footer className="border-t border-zinc-200 bg-white px-3 py-2.5">
        <div className="flex items-end gap-2">
          <MentionTextarea
            value={draft}
            onValueChange={setDraft}
            onSubmit={send}
            team={team.filter((t) => t.id !== meId)}
            rows={Math.min(5, Math.max(1, draft.split("\n").length))}
            placeholder="Message the team… (@ to mention)"
            aria-label="Message the team"
            disabled={pending}
            className="max-h-36 min-h-[2.5rem] resize-none rounded-2xl border border-zinc-200 bg-well px-4 py-2 text-base sm:text-sm focus:border-zinc-400 focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!draft.trim() || pending}
            aria-label="Send"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-ink text-white shadow-sm hover:brightness-110 disabled:opacity-40"
          >
            {pending ? "…" : <SendHorizontal aria-hidden className="size-4" />}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-red-600">
            {error}
          </p>
        )}
      </footer>
    </section>
  );
}
