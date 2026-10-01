import { createClient } from "@/lib/supabase/server";
import { contactFromRow, slaFromJson } from "./rows";
import type { ClientContact, SlaSettings } from "./types";

/** Every contact for one business, plus the escalation matrix. RLS limits this to team members. */
export async function loadQueue(businessId: string): Promise<{ contacts: ClientContact[]; sla: SlaSettings }> {
  const supabase = await createClient();
  const [{ data: rows }, { data: settings }] = await Promise.all([
    // The inner join filters by business; the joined column itself isn't needed.
    supabase.from("contacts").select("*, clients!inner(business_id)").eq("clients.business_id", businessId),
    supabase.from("settings").select("sla").eq("id", 1).maybeSingle(),
  ]);
  return {
    contacts: (rows ?? []).map((row) => contactFromRow(row)),
    sla: slaFromJson(settings?.sla),
  };
}
