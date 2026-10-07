import { PageHeader } from "@/components/PageHeader";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { loadQueue } from "@/lib/comms/load";
import { createClient } from "@/lib/supabase/server";
import { QueueList, type QueueClient } from "./QueueList";

export default async function QueuePage() {
  const member = await getSessionMember();
  const { current } = await getBusinessContext();
  if (!member || !current) return null;

  const supabase = await createClient();
  const [{ contacts, sla }, { data: clientRows }, { data: team }] = await Promise.all([
    loadQueue(current.id),
    supabase.from("clients").select("id, name, project, phone").eq("business_id", current.id),
    supabase.from("team_members").select("id, name, escalation").order("name"),
  ]);

  const clients: Record<string, QueueClient> = Object.fromEntries(
    (clientRows ?? []).map((c) => [c.id, { name: c.name, project: c.project, phone: c.phone }]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Queue"
        description="Every client call, text and message waiting on a response. Updates live — new GoHighLevel messages appear here as they arrive."
      />
      <QueueList contacts={contacts} sla={sla} clients={clients} team={team ?? []} meId={member.memberId} />
    </div>
  );
}
