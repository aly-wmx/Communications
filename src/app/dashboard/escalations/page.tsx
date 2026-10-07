import { PageHeader } from "@/components/PageHeader";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { awaitingPickup, sortQueue } from "@/lib/comms/contacts";
import { loadQueue } from "@/lib/comms/load";
import { needsEscalation } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";
import { EscalationList } from "./EscalationList";

export default async function EscalationsPage() {
  const me = await getSessionMember();
  const { current } = await getBusinessContext();
  if (!me || !current) return null;

  const supabase = await createClient();
  const [{ contacts, sla }, { data: clientRows }, { data: team }] = await Promise.all([
    loadQueue(current.id),
    supabase.from("clients").select("id, name").eq("business_id", current.id),
    supabase.from("team_members").select("id, name, escalation").order("name"),
  ]);
  const now = new Date();
  const open = contacts.filter((c) => c.status !== "Resolved");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escalations"
        description={`Clients who waited past the target (${sla.escalateMinutes} min${sla.businessHours.enabled ? " of business time" : ""}). Managers get a Slack message and an email; whoever says “I’ve got it” takes it.`}
      />
      <EscalationList
        awaiting={sortQueue(open.filter(awaitingPickup), sla, now)}
        needs={sortQueue(open.filter((c) => needsEscalation(c, sla, now)), sla, now)}
        picked={sortQueue(open.filter((c) => c.escalations.length > 0 && !awaitingPickup(c)), sla, now)}
        clients={Object.fromEntries((clientRows ?? []).map((c) => [c.id, c.name]))}
        team={team ?? []}
        meId={me.memberId}
        sla={sla}
      />
    </div>
  );
}
