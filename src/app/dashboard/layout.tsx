import { redirect } from "next/navigation";
import { checkSession } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { awaitingPickup, clientsNeedingMe, queueStats } from "@/lib/comms/contacts";
import { loadOpenQueue } from "@/lib/comms/load";
import { ROLE_LABELS } from "@/lib/roles";
import { isDepartment } from "@/lib/stages";
import { WmxWordmark } from "@/components/wmx-wordmark";
import { signOut } from "./actions";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { DashboardNav } from "./DashboardNav";
import { LiveUpdates } from "./LiveUpdates";
import { SidebarShell } from "./SidebarShell";
import { Providers } from "./Providers";
import { MainContent } from "./NavProgress";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Every protected route goes through this check. RLS enforces the same
  // team-list rule in the database; this turns it into the right redirect.
  const result = await checkSession();
  if (result.status === "no-session") redirect("/login");
  if (result.status === "not-on-team") redirect("/auth/denied");
  const { member } = result;

  const { businesses, current } = await getBusinessContext();
  const supabase = await createClient();
  const { data: team } = await supabase.from("team_members").select("id, name, department");
  const myDepartment = team?.find((t) => t.id === member.memberId)?.department;
  const teamNames = Object.fromEntries((team ?? []).map((t) => [t.id, t.name]));
  const businessNames = Object.fromEntries(businesses.map((b) => [b.id, b.name]));

  let needsMeCount = 0;
  let myTickets = 0;
  let escalationBadge = 0;
  if (current) {
    // Only the sidebar badges: if they can't load, show the app without them rather than an error page.
    try {
      const { contacts, sla } = await loadOpenQueue(current.id);
      const stats = queueStats(contacts, sla, new Date());
      needsMeCount = clientsNeedingMe(contacts, member);
      const { count } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("business_id", current.id)
        .eq("assignee_id", member.memberId)
        .neq("status", "done");
      myTickets = count ?? 0;
      escalationBadge = stats.needsEscalation + contacts.filter(awaitingPickup).length;
    } catch (err) {
      console.error("sidebar badges unavailable", err);
    }
  }

  return (
    <Providers>
    <div className="min-h-screen bg-page lg:flex">
      <SidebarShell brand={<WmxWordmark />} businessName={businesses.length > 1 ? current?.name : undefined}>
        {current && <BusinessSwitcher businesses={businesses} currentId={current.id} />}

        <DashboardNav role={member.role} queueBadge={needsMeCount} boardBadge={myTickets} escalationBadge={escalationBadge} />

        <div className="mt-auto border-t border-zinc-200 pt-3">
          <LiveUpdates
            meId={member.memberId}
            teamNames={teamNames}
            businessNames={businessNames}
            currentBusinessId={current?.id ?? ""}
            myDepartment={isDepartment(myDepartment) ? myDepartment : null}
          />
        </div>

        <div className="border-t border-zinc-200 p-4">
          <p className="text-xs text-zinc-500">
            {member.name} · <span className="uppercase">{ROLE_LABELS[member.role]}</span>
          </p>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </SidebarShell>

      <main className="min-w-0 flex-1 overflow-x-auto px-4 py-4 sm:px-6 sm:py-6">
        <MainContent>{children}</MainContent>
      </main>
    </div>
    </Providers>
  );
}
