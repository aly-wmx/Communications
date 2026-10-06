import { redirect } from "next/navigation";
import { checkSession } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { queueStats } from "@/lib/comms/contacts";
import { loadQueue } from "@/lib/comms/load";
import { ROLE_LABELS } from "@/lib/roles";
import { WmxWordmark } from "@/components/wmx-wordmark";
import { signOut } from "./actions";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { DashboardNav } from "./DashboardNav";
import { LiveUpdates } from "./LiveUpdates";
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

  let needsEscalation = 0;
  if (current) {
    const { contacts, sla } = await loadQueue(current.id);
    needsEscalation = queueStats(contacts, sla, new Date()).needsEscalation;
  }

  return (
    <div className="flex min-h-screen bg-[#F5F3EE]">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-4">
          <WmxWordmark />
        </div>

        {current && <BusinessSwitcher businesses={businesses} currentId={current.id} />}

        <DashboardNav role={member.role} queueBadge={needsEscalation} />

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
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto px-6 py-6">{children}</main>
    </div>
  );
}
