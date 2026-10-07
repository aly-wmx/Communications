import { redirect } from "next/navigation";
import { checkSession } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { awaitingPickup, queueStats } from "@/lib/comms/contacts";
import { loadQueue } from "@/lib/comms/load";
import { ROLE_LABELS } from "@/lib/roles";
import { WmxWordmark } from "@/components/wmx-wordmark";
import { signOut } from "./actions";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { DashboardNav } from "./DashboardNav";
import { LiveUpdates } from "./LiveUpdates";
import { SidebarShell } from "./SidebarShell";
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
  const { data: team } = await supabase.from("team_members").select("id, name");
  const teamNames = Object.fromEntries((team ?? []).map((t) => [t.id, t.name]));
  const businessNames = Object.fromEntries(businesses.map((b) => [b.id, b.name]));

  let waitingOnUs = 0;
  let escalationBadge = 0;
  if (current) {
    const { contacts, sla } = await loadQueue(current.id);
    const stats = queueStats(contacts, sla, new Date());
    waitingOnUs = stats.waiting;
    escalationBadge = stats.needsEscalation + contacts.filter(awaitingPickup).length;
  }

  return (
    <div className="min-h-screen bg-[#F5F3EE] lg:flex">
      <SidebarShell brand={<WmxWordmark />}>
        {current && <BusinessSwitcher businesses={businesses} currentId={current.id} />}

        <DashboardNav role={member.role} queueBadge={waitingOnUs} escalationBadge={escalationBadge} />

        <div className="mt-auto border-t border-zinc-200 pt-3">
          <LiveUpdates
            meId={member.memberId}
            teamNames={teamNames}
            businessNames={businessNames}
            currentBusinessId={current?.id ?? ""}
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

      <main className="min-w-0 flex-1 overflow-x-auto px-4 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
