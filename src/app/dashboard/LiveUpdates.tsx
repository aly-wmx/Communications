"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { incomingAlert, type AlertRow, type IncomingAlert } from "@/lib/comms/alerts";
import { NotificationBell } from "./NotificationBell";

export interface Toast extends IncomingAlert {
  clientName: string;
  businessName: string;
  link?: string;
  /** When it arrived, shown on the card. */
  at: string;
  /** Hovered, focused or expanded: stays until closed instead of timing out. */
  pinned?: boolean;
}

const NOTIFICATION_LABEL: Record<string, string> = {
  escalation: "Escalation",
  reminder: "Reminder",
  picked_up: "Picked up",
  mention: "Mentioned you",
};

const SOUND_KEY = "wmx-comms:sound";
const SETTINGS_EVENT = "wmx-comms:alert-settings";

/** Re-read alert settings when they change in this tab or another one. */
function subscribeSettings(onChange: () => void) {
  window.addEventListener(SETTINGS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Two short tones; no audio file needed. Browsers only allow this after the page has been clicked once. */
function chime(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const tones = urgent ? [880, 660, 880] : [660, 880];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.start(t);
      osc.stop(t + 0.15);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // No audio available (or not allowed yet) — the pop-up still shows.
  }
}

/**
 * Keeps every open portal tab live: listens for contact changes over Supabase
 * realtime (RLS applies, so only team members receive anything), refreshes the
 * page data, and alerts on new client messages.
 */
export function LiveUpdates({
  meId,
  teamNames,
  businessNames,
  currentBusinessId,
}: {
  meId: string;
  teamNames: Record<string, string>;
  businessNames: Record<string, string>;
  currentBusinessId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const onClientsPage = useRef(false);
  useEffect(() => {
    onClientsPage.current = pathname.startsWith("/dashboard/clients") || pathname.startsWith("/dashboard/inbox");
  }, [pathname]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [connected, setConnected] = useState(false);
  const sound = useSyncExternalStore(subscribeSettings, readSound, () => true);
  const permission = useSyncExternalStore(subscribeSettings, readPermission, () => "default" as const);
  const seen = useRef(new Set<string>());
  const refreshTimer = useRef<number | undefined>(undefined);
  // Latest props for the realtime callbacks, without resubscribing on every render.
  const props = useRef({ meId, teamNames, businessNames, currentBusinessId, sound });
  useEffect(() => {
    props.current = { meId, teamNames, businessNames, currentBusinessId, sound };
  }, [meId, teamNames, businessNames, currentBusinessId, sound]);

  const dismiss = useCallback((key: string) => setToasts((list) => list.filter((t) => t.key !== key)), []);
  /** Timed close: skipped once someone is reading it. */
  const expire = useCallback((key: string) => setToasts((list) => list.filter((t) => t.key !== key || t.pinned)), []);
  const pin = useCallback(
    (key: string) => setToasts((list) => list.map((t) => (t.key === key && !t.pinned ? { ...t, pinned: true } : t))),
    [],
  );

  useEffect(() => {
    const supabase = createClient();

    const refreshSoon = (delay = 400) => {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => router.refresh(), delay);
    };
    // Thread messages arrive in bulk during the history copy: only the Clients screens
    // show them, and a short pause batches a burst into one refresh.
    const refreshForMessages = () => {
      if (onClientsPage.current) refreshSoon(2500);
    };

    const alertFor = async (alert: IncomingAlert) => {
      if (seen.current.has(alert.key)) return;
      seen.current.add(alert.key);

      // The contact only carries a shortened preview; show the client's full latest message.
      const [{ data: client }, { data: latest }] = await Promise.all([
        supabase.from("clients").select("name, business_id").eq("id", alert.clientId).maybeSingle(),
        supabase
          .from("messages")
          .select("body")
          .eq("client_id", alert.clientId)
          .eq("direction", "inbound")
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const p = props.current;
      const clientName = client?.name ?? "A client";
      const businessName =
        client && client.business_id !== p.currentBusinessId ? (p.businessNames[client.business_id] ?? "") : "";
      const preview = alert.body.replace(/…$/, "");
      const body = latest?.body && (!preview || latest.body.startsWith(preview.slice(0, 40))) ? latest.body : alert.body;
      const toast: Toast = { ...alert, body, clientName, businessName, link: `/dashboard/clients/${alert.clientId}`, at: new Date().toISOString() };

      setToasts((list) => [toast, ...list].slice(0, 4));
      window.setTimeout(() => expire(alert.key), alert.urgent ? 30_000 : 15_000);
      if (p.sound) chime(alert.urgent);

      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        const n = new Notification(`${alert.urgent ? "URGENT · " : ""}${alert.headline} — ${clientName}`, {
          body: [businessName, alert.body].filter(Boolean).join(" · ").slice(0, 180),
          tag: alert.key,
        });
        n.onclick = () => {
          window.focus();
          router.push("/dashboard/inbox?view=waiting");
          n.close();
        };
      }
    };

    const channel = supabase.channel("live:contacts");

    const start = async () => {
      // Realtime checks RLS with the signed-in person's token.
      const { data } = await supabase.auth.getSession();
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, (payload) => {
          refreshSoon(1000);
          if (payload.eventType === "DELETE") return;
          const p = props.current;
          const alert = incomingAlert(payload.eventType, payload.new as AlertRow, p.meId, p.teamNames);
          if (alert) void alertFor(alert);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => refreshSoon(1000))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refreshForMessages)
        .on("postgres_changes", { event: "*", schema: "public", table: "team_notes" }, refreshForMessages)
        .subscribe((status) => {
          setConnected(status === "SUBSCRIBED");
          // Catch up on anything missed while disconnected.
          if (status === "SUBSCRIBED") refreshSoon();
        });
    };
    void start();

    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      auth.subscription.unsubscribe();
      window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [router, expire]);

  /** Escalations, reminders, pick-ups and mentions pop up too (new messages already have their own alert). */
  const onNotification = useCallback(
    (n: { id: string; kind: string; title: string; body: string; link: string; urgent: boolean }) => {
      if (!NOTIFICATION_LABEL[n.kind] || seen.current.has(n.id)) return;
      seen.current.add(n.id);
      const toast: Toast = {
        key: n.id,
        contactId: "",
        clientId: "",
        urgent: n.urgent,
        headline: NOTIFICATION_LABEL[n.kind],
        body: n.body,
        clientName: n.title,
        businessName: "",
        link: n.link,
        at: new Date().toISOString(),
      };
      setToasts((list) => [toast, ...list].slice(0, 4));
      window.setTimeout(() => expire(n.id), n.urgent ? 30_000 : 15_000);
      if (props.current.sound) chime(n.urgent);
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
        const desk = new Notification(n.title, { body: n.body.slice(0, 180), tag: n.id });
        desk.onclick = () => {
          window.focus();
          router.push(n.link || "/dashboard/escalations");
          desk.close();
        };
      }
    },
    [expire, router],
  );

  function toggleSound() {
    const next = !sound;
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // Private window or blocked storage — the setting just won't stick.
    }
    window.dispatchEvent(new Event(SETTINGS_EVENT));
    if (next) chime(false);
  }

  async function enableDesktop() {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission();
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  }

  return (
    <>
      <NotificationBell onIncoming={onNotification} />
      <div className="space-y-1.5 px-4 pb-3 pt-2 text-xs">
        <p className="flex items-center gap-1.5 text-zinc-500">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${connected ? "bg-[#3F7A5C]" : "bg-zinc-300"}`}
          />
          {connected ? "Live — new messages appear instantly" : "Connecting…"}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <button type="button" onClick={toggleSound} className="text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline">
            Sound {sound ? "on" : "off"}
          </button>
          {permission === "default" && (
            <button
              type="button"
              onClick={enableDesktop}
              className="font-semibold text-[#B08D57] underline-offset-2 hover:underline"
            >
              Turn on desktop alerts
            </button>
          )}
          {permission === "denied" && <span className="text-zinc-400">Desktop alerts blocked in browser</span>}
        </div>
      </div>

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-[26rem]"
      >
        {toasts.map((t) => (
          <ToastCard key={t.key} toast={t} onPin={() => pin(t.key)} onDismiss={() => dismiss(t.key)} />
        ))}
      </div>
    </>
  );
}

const LONG = 220;

export function ToastCard({ toast: t, onPin, onDismiss }: { toast: Toast; onPin: () => void; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const long = t.body.length > LONG || t.body.split("\n").length > 4;
  const time = new Date(t.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div
      role="status"
      onMouseEnter={onPin}
      onFocus={onPin}
      className={`pointer-events-auto rounded-lg border border-l-4 bg-white p-3 shadow-lg ${
        t.urgent ? "border-red-300 border-l-red-600" : "border-zinc-200 border-l-[#B08D57]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {t.urgent && <span className="text-red-700">Urgent · </span>}
          {t.headline}
          {t.businessName && <span className="font-normal normal-case"> · {t.businessName}</span>}
          <span className="font-normal normal-case text-zinc-500"> · {time}</span>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-lg leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        >
          ×
        </button>
      </div>
      <p className="break-words text-sm font-semibold text-zinc-900">{t.clientName}</p>
      {t.body && (
        <p
          className={`mt-1 whitespace-pre-wrap break-words text-sm leading-snug text-zinc-700 ${
            expanded ? "max-h-72 overflow-y-auto pr-1" : long ? "line-clamp-4" : ""
          }`}
        >
          {t.body}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <Link href={t.link || "/dashboard/inbox?view=waiting"} onClick={onDismiss} className="text-xs font-semibold text-[#8A6A3A] hover:underline">
          {t.link ? "Open →" : "Open inbox →"}
        </Link>
        {long && (
          <button
            type="button"
            onClick={() => {
              onPin();
              setExpanded((e) => !e);
            }}
            aria-expanded={expanded}
            className="text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
          >
            {expanded ? "Show less" : "Show full message"}
          </button>
        )}
      </div>
    </div>
  );
}
