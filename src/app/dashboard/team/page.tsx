import { PageHeader } from "@/components/PageHeader";
import { requireAdminPage } from "@/lib/auth";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { TeamTable } from "./TeamTable";

export default async function TeamPage() {
  const me = await requireAdminPage();
  const supabase = await createClient();
  const { data: members } = await supabase.from("team_members").select("*").order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Who can sign in, what they can do, and who gets escalations. Anyone with an email here can sign in with Google or a password; clear the email to take access away."
      />

      <TeamTable members={members ?? []} meId={me.memberId} />

      <div className="grid max-w-4xl gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-md border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1C2B47]">{ROLE_LABELS[r]}</p>
            <p className="mt-1 text-xs text-zinc-600">{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>
      <p className="max-w-2xl text-xs text-zinc-500">
        Slack member ID: in Slack, open the person&apos;s profile → ⋯ → Copy member ID. Used to mention them in
        escalation alerts.
      </p>
    </div>
  );
}
