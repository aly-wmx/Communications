import { PageHeader } from "@/components/PageHeader";
import { requireAdminPage } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { BusinessList } from "./BusinessList";

export default async function BusinessesPage() {
  await requireAdminPage();
  const { businesses } = await getBusinessContext();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Businesses"
        description="Each business keeps its own clients, queue and announcements. Switch between them from the sidebar."
      />
      <BusinessList businesses={businesses} />
    </div>
  );
}
