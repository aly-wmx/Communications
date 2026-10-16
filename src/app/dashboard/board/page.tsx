import { PageHeader } from "@/components/PageHeader";
import { NoBusiness } from "@/components/NoBusiness";
import { SegmentedLinks } from "@/components/ui/segmented";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { loadQueue } from "@/lib/comms/load";
import { canAssignTickets } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { businessTimeZone } from "@/lib/time-zone";
import { withAccess } from "@/lib/access";
import { buildBoard, DONE_DAYS, ticketFromRow, type BoardFilters, type TypeFilter } from "@/lib/tickets";
import { BoardView } from "./BoardView";
import { NewTicket } from "./NewTicket";
import { PersonFilter } from "./PersonFilter";
import { TicketPanel, type TicketEvent } from "./TicketPanel";

const ID_CHUNK = 150;
const chunks = <T,>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

export default async function BoardPage({ searchParams }: PageProps<"/dashboard/board">) {
  const me = await getSessionMember();
  if (!me) return null;
  const { current } = await getBusinessContext();
  if (!current) return <NoBusiness />;

  const sp = await searchParams;
  const type: TypeFilter = sp.type === "tickets" || sp.type === "client" ? sp.type : "all";
  const who = typeof sp.who === "string" && sp.who ? sp.who : "mine";
  const clientFilter = typeof sp.client === "string" ? sp.client : "";
  const openId = typeof sp.t === "string" && /^[0-9a-f-]{36}$/.test(sp.t) ? sp.t : "";
  const filters: BoardFilters = { type, who, clientId: clientFilter };

  const supabase = await createClient();
  const now = new Date();
  const doneSince = new Date(now.getTime() - DONE_DAYS * 24 * 60 * 60_000).toISOString();
  const [{ contacts, sla }, ticketsRes, teamRes, tz] = await Promise.all([
    loadQueue(current.id),
    supabase
      .from("tickets")
      .select("*")
      .eq("business_id", current.id)
      .or(`status.neq.done,done_at.gte.${doneSince}`)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("team_members").select("id, name").order("name"),
    businessTimeZone(),
  ]);
  if (ticketsRes.error) throw ticketsRes.error;
  const tickets = (ticketsRes.data ?? []).map(ticketFromRow);
  const team = teamRes.data ?? [];
  // Only people who can open this business can be given its tickets (names still come from the whole team).
  const assignable = await withAccess(supabase, current.id, team);

  // Names for the clients on the Board (and the open ticket's client).
  const recentContacts = contacts.filter((c) => c.status !== "Resolved" || (c.resolvedAt && c.resolvedAt >= doneSince));
  const ids = [...new Set([...tickets.map((t) => t.clientId), ...recentContacts.map((c) => c.clientId)].filter((x): x is string => Boolean(x)))];
  const nameRows = (
    await Promise.all(chunks(ids, ID_CHUNK).map(async (part) => (await supabase.from("clients").select("id, name").in("id", part)).data ?? []))
  ).flat();
  const clientNames = Object.fromEntries(nameRows.map((c) => [c.id, c.name]));

  const columns = buildBoard({ tickets, contacts: recentContacts, clientNames, filters, meId: me.memberId, sla, now });

  // The ticket opened with ?t= (from a card, or a notification's link).
  let open: { ticket: ReturnType<typeof ticketFromRow>; events: TicketEvent[]; clientName: string } | null = null;
  if (openId) {
    const [{ data: row }, { data: eventRows }] = await Promise.all([
      supabase.from("tickets").select("*").eq("id", openId).maybeSingle(),
      supabase.from("ticket_events").select("id, author_id, kind, body, created_at").eq("ticket_id", openId).order("created_at"),
    ]);
    if (row) {
      const ticket = ticketFromRow(row);
      let clientName = ticket.clientId ? (clientNames[ticket.clientId] ?? "") : "";
      if (ticket.clientId && !clientName) {
        clientName = (await supabase.from("clients").select("name").eq("id", ticket.clientId).maybeSingle()).data?.name ?? "";
      }
      open = {
        ticket,
        clientName,
        events: (eventRows ?? []).map((e) => ({ id: e.id, authorId: e.author_id, kind: e.kind, body: e.body, createdAt: e.created_at })),
      };
    }
  }

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(type !== "all" && { type }), ...(who !== "mine" && { who }), ...(clientFilter && { client: clientFilter }), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const q = p.toString();
    return `/dashboard/board${q ? `?${q}` : ""}`;
  };
  const canAssign = canAssignTickets(me.role);

  return (
    <div className="space-y-4">
      <PageHeader title="Board" description="Tickets and client items in one place: what's to do, in progress, waiting and done this week.">
        <NewTicket team={assignable} meId={me.memberId} canAssignOthers={canAssign} />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedLinks
          label="Show"
          items={[
            { href: href({ type: "" }), label: "Everything", current: type === "all" },
            { href: href({ type: "tickets" }), label: "Tickets", current: type === "tickets" },
            { href: href({ type: "client" }), label: "Client items", current: type === "client" },
          ]}
        />
        <SegmentedLinks
          label="Whose"
          items={[
            { href: href({ who: "" }), label: "Mine", current: who === "mine" },
            { href: href({ who: "team" }), label: "Everyone", current: who === "team" },
            { href: href({ who: "unassigned" }), label: "Unassigned", current: who === "unassigned" },
          ]}
        />
        <PersonFilter team={assignable.filter((t) => t.id !== me.memberId)} value={["mine", "team", "unassigned"].includes(who) ? "" : who} />
        {clientFilter && (
          <a href={href({ client: "" })} className="text-xs font-semibold text-gold-ink hover:underline">
            {clientNames[clientFilter] ?? "This client"} only · show all
          </a>
        )}
      </div>

      <BoardView columns={columns} team={team} meId={me.memberId} timeZone={tz} />

      {open && (
        <TicketPanel
          key={open.ticket.id}
          ticket={open.ticket}
          events={open.events}
          clientName={open.clientName}
          team={team}
          assignable={open.ticket.businessId === current.id ? assignable : await withAccess(supabase, open.ticket.businessId, team)}
          meId={me.memberId}
          canAssignOthers={canAssign}
          timeZone={tz}
          closeHref={href({})}
        />
      )}
    </div>
  );
}
