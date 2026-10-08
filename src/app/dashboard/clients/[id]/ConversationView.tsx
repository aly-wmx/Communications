import { notFound } from "next/navigation";
import { getSessionMember } from "@/lib/auth";
import { canSendMessages } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { ChatThread, type ChatMessage } from "./ChatThread";
import { parseAttachments } from "@/lib/comms/channels";
import { senderLabel } from "@/lib/comms/sender";
import { ClientDetails } from "./ClientDetails";
import { ArchiveControls } from "./ArchiveControls";
import { Composer } from "./Composer";
import { ContactActions, type OpenContact } from "./ContactActions";
import { StagePicker } from "./StagePicker";
import { isStage } from "@/lib/stages";

const PAGE_SIZE = 300;

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function initials(name: string) {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * One client's conversation: chat (with reply box) plus the side panel of
 * details, stage, archive controls and waiting-on-us items. Used on its own
 * page and inside the Inbox.
 *
 * `basePath` is where paging links point (e.g. "/dashboard/clients/ID" or
 * "/dashboard/inbox?view=mine&c=ID"); `before` pages back through long histories.
 */
export async function ConversationView({ clientId: id, before, basePath }: { clientId: string; before: string; basePath: string }) {
  const supabase = await createClient();
  const me = await getSessionMember();

  let threadQuery = supabase
    .from("messages")
    .select("id, direction, channel, body, sent_by_user, occurred_at, conversation_id, attachments, source, ghl_user_id")
    .eq("client_id", id)
    .order("occurred_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) threadQuery = threadQuery.lt("occurred_at", before);

  const [{ data: client }, { data: newest }, { count }, { data: open }, { data: team }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, project, phone, email, owner_id, notes, archived_at, archive_reason, archived_by, stage")
      .eq("id", id)
      .maybeSingle(),
    threadQuery,
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabase
      .from("contacts")
      .select("id, channel, status, summary, received_at, assignee_id, escalations")
      .eq("client_id", id)
      .neq("status", "Resolved")
      .order("received_at"),
    supabase.from("team_members").select("id, name, escalation").order("name"),
  ]);
  if (!client) notFound();
  const { data: notes } = await supabase
    .from("team_notes")
    .select("id, author_id, body, created_at, flagged_for")
    .eq("client_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: stageHistory } = await supabase
    .from("client_stage_history")
    .select("to_stage, changed_by, changed_at")
    .eq("client_id", id)
    .order("changed_at", { ascending: false })
    .limit(5);

  const page = newest ?? [];
  const ghlIds = [...new Set(page.map((m) => m.ghl_user_id).filter(Boolean))];
  const { data: ghlUsers } = ghlIds.length
    ? await supabase.from("ghl_users").select("id, name").in("id", ghlIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const ghlName = (gid: string) => (ghlUsers ?? []).find((u) => u.id === gid)?.name;
  const hasOlder = page.length > PAGE_SIZE;
  const rows = page.slice(0, PAGE_SIZE).reverse();
  const messages: ChatMessage[] = rows.map((m) => ({
    id: m.id,
    direction: m.direction,
    channel: m.channel,
    body: m.body,
    sentByUser: m.sent_by_user,
    occurredAt: m.occurred_at,
    attachments: parseAttachments(m.attachments),
    sender: senderLabel({ direction: m.direction, source: m.source, sentByUser: m.sent_by_user, ghlUserId: m.ghl_user_id }, ghlName),
  }));
  // Team notes sit in the same timeline (within the window of messages shown).
  const windowStart = hasOlder ? rows[0]?.occurred_at : "";
  const nameFor = (authorId: string | null) => (team ?? []).find((t) => t.id === authorId)?.name ?? "Former teammate";
  for (const n of notes ?? []) {
    if (windowStart && n.created_at < windowStart) continue;
    if (before && n.created_at >= before) continue;
    messages.push({
      id: `note:${n.id}`,
      direction: "note",
      channel: "Note",
      body: n.body,
      sentByUser: true,
      occurredAt: n.created_at,
      attachments: [],
      noteAuthor: n.author_id === me?.memberId ? "You" : nameFor(n.author_id),
      flaggedFor: n.flagged_for ? (n.flagged_for === me?.memberId ? "you" : nameFor(n.flagged_for)) : undefined,
    });
  }
  messages.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const total = count ?? messages.length;
  const sep = basePath.includes("?") ? "&" : "?";
  const olderHref = hasOlder ? `${basePath}${sep}before=${encodeURIComponent(rows[0].occurred_at)}` : undefined;
  const newerHref = before ? basePath : undefined;

  // Open the same conversation in GoHighLevel to reply there.
  const locationId = process.env.GHL_LOCATION_ID ?? "";
  const conversationId = page.find((m) => m.conversation_id)?.conversation_id ?? "";
  const ghlHref =
    locationId && conversationId
      ? `https://app.gohighlevel.com/v2/location/${locationId}/conversations/conversations/${conversationId}`
      : "";

  const nameOf = (id?: string) => (team ?? []).find((t) => t.id === id)?.name ?? "someone";
  const openContacts: OpenContact[] = (open ?? []).map((c) => {
    const escalations = (c.escalations as Array<{ acknowledgedById?: string; acknowledgedAt?: string }> | null) ?? [];
    const lastPicked = [...escalations].reverse().find((e) => e.acknowledgedAt);
    return {
      id: c.id,
      channel: c.channel,
      status: c.status,
      summary: c.summary,
      receivedLabel: `received ${when(c.received_at)}`,
      assigneeId: c.assignee_id ?? "",
      awaitingPickup: escalations.some((e) => !e.acknowledgedAt),
      pickedUpLabel: lastPicked ? `Picked up by ${nameOf(lastPicked.acknowledgedById)} · ${when(lastPicked.acknowledgedAt!)}` : "",
    };
  });
  const waiting = openContacts.some((c) => c.status === "Open");

  return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
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

          {me && (
            <Composer
              clientId={client.id}
              hasPhone={Boolean(client.phone)}
              hasEmail={Boolean(client.email)}
              canSend={canSendMessages(me.role)}
              team={(team ?? []).filter((t) => t.id !== me.memberId)}
            />
          )}
        </section>

        {/* Side panel */}
        <aside className="w-full shrink-0 space-y-4 overflow-y-auto xl:w-80">
          <StagePicker
            key={client.stage ?? "none"}
            clientId={client.id}
            stage={isStage(client.stage) ? client.stage : null}
            history={(stageHistory ?? []).map(
              (h) => `${h.to_stage ?? "No stage"} · ${nameOf(h.changed_by)} · ${new Date(h.changed_at).toLocaleDateString()}`,
            )}
          />
          <ClientDetails
            client={{
              id: client.id,
              name: client.name,
              project: client.project,
              phone: client.phone,
              email: client.email,
              ownerId: client.owner_id ?? "",
              notes: client.notes,
            }}
            team={team ?? []}
            isAdmin={me?.role === "admin"}
          />

          <ArchiveControls
            clientId={client.id}
            clientName={client.name}
            archivedReason={(client.archive_reason as "spam" | "archived" | null) ?? null}
            archivedLabel={
              client.archived_at ? `By ${nameOf(client.archived_by)} on ${new Date(client.archived_at).toLocaleDateString()}.` : ""
            }
          />

          {openContacts.length > 0 ? (
            <ContactActions contacts={openContacts} team={team ?? []} meId={me?.memberId ?? ""} clientName={client.name} />
          ) : (
            <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 shadow-sm">
              Nothing waiting on us for this client.
            </section>
          )}
        </aside>
      </div>
  );
}
