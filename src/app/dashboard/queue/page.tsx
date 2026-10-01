import { ComingSoon } from "@/components/ComingSoon";

export default function QueuePage() {
  return (
    <ComingSoon
      title="Client Queue"
      description="Every client call, text and message waiting on a response."
      phase={2}
      features={[
        "Live wait timer per contact, turning amber then red against the escalation matrix",
        "Assign, mark responded and resolve in one click",
        "Escalate button that notifies the managers",
        "Filters: waiting on us, needs escalation, overdue, escalated, waiting on client",
      ]}
    />
  );
}
