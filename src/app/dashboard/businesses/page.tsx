import { PageHeader } from "@/components/PageHeader";
import { requireAdminPage } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { ghlStatusLine, loadGhlHealth } from "@/lib/comms/ghl-health";
import { createClient } from "@/lib/supabase/server";
import { BusinessList, type GhlConnection } from "./BusinessList";

export default async function BusinessesPage() {
  await requireAdminPage();
  const { businesses } = await getBusinessContext();

  // Worked out here so only the location id and a status line reach the browser, never a token.
  const ghl: Record<string, GhlConnection> = {};
  for (const h of await loadGhlHealth(await createClient())) {
    const { text, ok } = ghlStatusLine(h);
    ghl[h.businessId] = { locationId: h.locationId, inherited: h.inherited, status: text, ok };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Businesses"
        description="Each business keeps its own clients, queue and announcements, and its own GoHighLevel sub-account. Switch between them from the sidebar."
      />
      <BusinessList businesses={businesses} ghl={ghl} />
    </div>
  );
}
