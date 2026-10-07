import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatThread, type ChatMessage } from "./ChatThread";
import { Composer } from "./Composer";
import { ContactActions, type OpenContact } from "./ContactActions";

const PAGE_SIZE = 300;

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function initials(name: string) {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default async function ClientThreadPage({ params, searchParams }: PageProps<"/dashboard/clients/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  // ?before=<ISO time> shows the page of messages before that point (for long histories).
  const beforeRaw = typeof sp.before === "string" ? sp.before : "";
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : "";
  const supabase = await createClient();

  let threadQuery = supabase
    .from("messages")
    .select("id, direction, channel, body, sent_by_user, occurred_at, conversation_id")
    .eq("client_id", id)
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) threadQuery = threadQuery.lt("occurred_at", before);

  const [{ data: client }, { data: newest }, { count }, { data: open }, { data: team }] = await Promise.all([
    supabase.from("clients").select("id, name, project, phone, email, owner_id").eq("id", id).maybeSingle(),
    threadQuery,
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabase
      .from("contacts")
      .select("id, channel, status, summary, received_at, assignee_id")
      .eq("client_id", id)
      .neq("status", "Resolved")
      .order("received_at"),
    supabase.from("team_members").select("id, name").order("name"),
  ]);
  if (!client) notFound();

  const page = newest ?? [];
  const hasOlder = page.length > PAGE_SIZE;
  const rows = page.slice(0, PAGE_SIZE).reverse();
  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    direction: m.direction,
    channel: m.channel,
    body: m.body,
    sentByUser: m.sent_by_user,
    occurredAt: m.occurred_at,
  }));
  const total = count ?? messages.length;
  const olderHref = hasOlder ? `/dashboard/clients/${id}?before=${encodeURIComponent(rows[0].occurred_at)}` : undefined;
  const newerHref = before ? `/dashboard/clients/${id}` : undefined;

  // Open the same conversation in GoHighLevel to reply there.
  const locationId = process.env.GHL_LOCATION_ID ?? "";
  const conversationId = page.find((m) => m.conversation_id)?.conversation_id ?? "";
  const ghlHref =
    locationId && conversationId
      ? `https://app.gohighlevel.com/v2/location/${locationId}/conversations/conversations/${conversationId}`
      : "";

  const openContacts: OpenContact[] = (open ?? []).map((c) => ({
    id: c.id,
    channel: c.channel,
    status: c.status,
    summary: c.summary,
    receivedLabel: `received ${when(c.received_at)}`,
    assigneeId: c.assignee_id ?? "",
  }));
  const waiting = openContacts.some((c) => c.status === "Open");
  const owner = (team ?? []).find((t) => t.id === client.owner_id)?.name;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-4">
      <Link href="/dashboard/clients" className="text-xs font-semibold text-[#B08D57] hover:underline">
        ← Clients
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Chat box */}
        <section className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1C2B47] text-sm font-bold text-white">
              {initials(client.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 truncate text-base font-semibold text-zinc-900">
                {client.name}
                {waiting && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Waiting on us</span>}
              </h1>
              <p className="truncate text-xs text-zinc-500">
                {[client.phone, client.email].filter(Boolean).join(" · ") || "No contact details"} · {total.toLocaleString()} message
                {total === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex gap-2">
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-400"
                >
                  📞 Call
                </a>
              )}
              {ghlHref && (
                <a
                  href={ghlHref}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#B08D57] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  Reply in GoHighLevel ↗
                </a>
              )}
            </div>
          </header>

          <ChatThread messages={messages} clientName={client.name} olderHref={olderHref} newerHref={newerHref} />

          <Composer clientId={client.id} hasPhone={Boolean(client.phone)} hasEmail={Boolean(client.email)} />
        </section>

        {/* Side panel */}
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto lg:w-80">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Client</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              {[
                ["Project", client.project],
                ["Phone", client.phone],
                ["Email", client.email],
                ["Owner", owner],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-16 shrink-0 text-zinc-500">{label}</dt>
                  <dd className="min-w-0 break-words text-zinc-800">{value || <span className="text-zinc-400">—</span>}</dd>
                </div>
              ))}
            </dl>
          </section>

          {openContacts.length > 0 ? (
            <ContactActions contacts={openContacts} team={team ?? []} />
          ) : (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 shadow-sm">
              Nothing waiting on us for this client.
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
