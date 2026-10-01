import { ComingSoon } from "@/components/ComingSoon";
import { requireAdminPage } from "@/lib/auth";

export default async function SettingsPage() {
  await requireAdminPage();
  return (
    <ComingSoon
      title="Settings"
      description="The escalation matrix and connections to other tools."
      phase={3}
      features={[
        "Escalation matrix: reminder and escalation times, urgent fast-track, business hours",
        "Slack connection for escalation alerts",
        "GoHighLevel connection status: last message received, lag warning",
      ]}
    />
  );
}
