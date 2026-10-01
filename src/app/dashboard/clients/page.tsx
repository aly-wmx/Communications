import { ComingSoon } from "@/components/ComingSoon";

export default function ClientsPage() {
  return (
    <ComingSoon
      title="Clients"
      description="Every client, who owns them, and whether they're waiting on us."
      phase={2}
      features={[
        "Client directory with owner, project and contact details",
        "Filter for clients without a response in 1, 3 or 7+ days",
        "Full contact history per client",
      ]}
    />
  );
}
