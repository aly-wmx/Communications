import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { awaitingPickup, sortQueue } from "@/lib/comms/contacts";
import { loadQueue } from "@/lib/comms/load";
import { needsEscalation } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";
import { EscalationsView, type View } from "./EscalationsView";

const RESOLVED_DAYS = 7;

export default async function EscalationsPage({ searchParams }: PageProps<"/dashboard/escalations">) {
  const me = await getSessionMember();
  const { current } = await getBusinessContext();
  if (!me || !current) return null;
  const sp = await searchParams;
  const view: View = sp.view === "kanban" ? "kanban" : "table";

  const supabase = await createClient();
  const [{ contacts, sla }, { data: clientRows }, { data: team }] = await Promise.all([
    loadQueue(current.id),
    supabase.from("clients").select("id, name").eq("business_id", current.id),
    supabase.from("team_members").select("id, name, escalation").order("name"),
  ]);
  const now = new Date();
  const open = contacts.filter((c) => c.status !== "Resolved");
  const since = now.getTime() - RESOLVED_DAYS * 24 * 60 * 60 * 1000;
  const resolved = contacts
    .filter((c) => c.status === "Resolved" && c.escalations.length > 0 && c.resolvedAt && new Date(c.resolvedAt).getTime() >= since)
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt))
    .slice(0, 50);

  const tab = (v: View, label: string) => (
    <Link
      href={v === "kanban" ? "/dashboard/escalations?view=kanban" : "/dashboard/escalations"}
      aria-current={view === v ? "page" : undefined}
      className={`rounded-md px-3 py-1 text-sm font-medium ${view === v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escalations"
        description={`Clients who waited past the target (${sla.escalateMinutes} min${sla.businessHours.enabled ? " of business time" : ""}). Managers get a Slack message and an email; whoever says “I’ve got it” takes it.`}
      />
      <nav aria-label="View" className="inline-flex gap-1 rounded-lg bg-zinc-100 p-1">
        {tab("table", "Table")}
        {tab("kanban", "Kanban")}
      </nav>
      <EscalationsView
        view={view}
        needs={sortQueue(open.filter((c) => needsEscalation(c, sla, now)), sla, now)}
        awaiting={sortQueue(open.filter(awaitingPickup), sla, now)}
        picked={sortQueue(open.filter((c) => c.escalations.length > 0 && !awaitingPickup(c)), sla, now)}
        resolved={resolved}
        clients={Object.fromEntries((clientRows ?? []).map((c) => [c.id, c.name]))}
        team={team ?? []}
        meId={me.memberId}
        sla={sla}
      />
    </div>
  );
}
