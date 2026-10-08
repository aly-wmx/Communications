"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  urgent: boolean;
  created_at: string;
  read_at: string | null;
}

const ICON: Record<string, string> = { escalation: "🚨", reminder: "⏰", new_message: "💬", picked_up: "✅", mention: "@" };

function ago(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/** Your notifications, live. RLS means each person only ever receives their own. */
export function NotificationBell({ onIncoming }: { onIncoming?: (n: Item) => void }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const incoming = useRef(onIncoming);
  useEffect(() => {
    incoming.current = onIncoming;
  }, [onIncoming]);

  const unread = items.filter((i) => !i.read_at).length;

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, urgent, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (active && data) setItems(data);
    };
    const channel = supabase.channel("live:notifications");
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      await load();
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
          const n = payload.new as Item;
          setItems((list) => [n, ...list.filter((i) => i.id !== n.id)].slice(0, 30));
          incoming.current?.(n);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, (payload) => {
          const n = payload.new as Item;
          setItems((list) => list.map((i) => (i.id === n.id ? { ...i, read_at: n.read_at } : i)));
        })
        .subscribe();
    })();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markRead = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((list) => list.map((i) => (ids.includes(i.id) ? { ...i, read_at: now } : i)));
    await createClient().from("notifications").update({ read_at: now }).in("id", ids).is("read_at", null);
  }, []);

  return (
    <div className="relative px-3 pt-3" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="flex w-full items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <span>🔔 Notifications</span>
        {unread > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">{unread}</span>}
      </button>

      {open && (
        <div className="absolute left-3 right-3 z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl lg:left-full lg:right-auto lg:top-0 lg:ml-2 lg:w-96">
          <div className="sticky top-0 flex items-center justify-between border-b border-zinc-100 bg-white px-3 py-2">
            <p className="text-sm font-semibold text-zinc-900">Notifications</p>
            <div className="flex gap-3 text-xs">
              {unread > 0 && (
                <button type="button" onClick={() => void markRead(items.filter((i) => !i.read_at).map((i) => i.id))} className="text-[#B08D57] hover:underline">
                  Mark all read
                </button>
              )}
              <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="text-zinc-500 hover:underline">
                Settings
              </Link>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void markRead([n.id]);
                      setOpen(false);
                      router.push(n.link || "/dashboard/inbox?view=waiting");
                    }}
                    className={`flex w-full gap-2 px-3 py-2.5 text-left hover:bg-zinc-50 ${n.read_at ? "" : "bg-[#B08D570d]"}`}
                  >
                    <span aria-hidden className="mt-0.5 text-sm">
                      {ICON[n.kind] ?? "•"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read_at ? "text-zinc-700" : "font-semibold text-zinc-900"}`}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-zinc-500">{n.body}</span>}
                      <span className="block text-[11px] text-zinc-400">{ago(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#B08D57]" aria-label="unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
