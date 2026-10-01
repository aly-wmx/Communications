import { ComingSoon } from "@/components/ComingSoon";

export default function ReportsPage() {
  return (
    <ComingSoon
      title="Reports"
      description="How quickly clients are getting answers."
      phase={4}
      features={[
        "Share of contacts answered within the response target, by week",
        "First-response time per person",
        "Escalation trends and slowest-to-answer clients",
      ]}
    />
  );
}
