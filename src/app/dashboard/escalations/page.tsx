import { ComingSoon } from "@/components/ComingSoon";

export default function EscalationsPage() {
  return (
    <ComingSoon
      title="Escalations"
      description="Contacts that went past the response target, and who is handling them."
      phase={3}
      features={[
        "Open escalations with who raised them and how long ago",
        "Slack message and email to the managers when something escalates",
        "Managers mark an escalation as picked up",
        "Automatic escalation when a contact passes the matrix threshold",
      ]}
    />
  );
}
