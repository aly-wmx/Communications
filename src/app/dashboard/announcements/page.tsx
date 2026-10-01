import { ComingSoon } from "@/components/ComingSoon";

export default function AnnouncementsPage() {
  return (
    <ComingSoon
      title="Announcements"
      description="Outgoing notices, newsletters and bulk client notifications."
      phase={4}
      features={[
        "Plan, schedule and log outgoing communications",
        "Calendar of what's going out",
        "Bulk client notifications sent through GoHighLevel",
        "Saved message templates",
      ]}
    />
  );
}
