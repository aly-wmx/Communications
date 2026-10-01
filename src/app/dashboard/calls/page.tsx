import { ComingSoon } from "@/components/ComingSoon";

export default function CallsPage() {
  return (
    <ComingSoon
      title="Call Log"
      description="Calls, missed calls and voicemails — replaces the call-log spreadsheet."
      phase={2}
      features={[
        "Log calls by hand, or have them arrive from GoHighLevel automatically",
        "Missed calls and voicemails go straight into the client queue",
        "Search and filter by client, person and date",
      ]}
    />
  );
}
