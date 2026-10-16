import { PageHeader } from "@/components/PageHeader";
import { requireAdminPage } from "@/lib/auth";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, isRole, type Role } from "@/lib/roles";
import { suggestedAccess } from "@/lib/access-suggestions";
import { AccessMatrix } from "./AccessMatrix";
import { createClient } from "@/lib/supabase/server";
import { TeamTable } from "./TeamTable";
import { GhlUsers } from "./GhlUsers";
import { formatStamp } from "@/lib/format-time";
import { businessTimeZone } from "@/lib/time-zone";

export default async function TeamPage() {
  const me = await requireAdminPage();
  const supabase = await createClient();
  const [{ data: members }, { data: ghlUsers }, { data: usersState }, { data: businesses }, { data: grants }, { data: locations }] = await Promise.all([
    supabase.from("team_members").select("*").order("name"),
    supabase.from("ghl_users").select("id, name, email, phone").order("name"),
    supabase.from("integration_state").select("value").eq("key", "ghl_users").maybeSingle(),
    supabase.from("businesses").select("id, name").order("created_at"),
    supabase.from("team_member_businesses").select("member_id, business_id"),
    supabase.from("ghl_user_locations").select("ghl_user_id, business_id"),
  ]);
  const suggestions = suggestedAccess({ members: members ?? [], locations: locations ?? [], grants: grants ?? [] });
  // GoHighLevel users grouped by the business whose sub-account they're in (someone can be in several).
  const ghlGroups = (businesses ?? []).map((b) => ({
    businessId: b.id,
    name: b.name,
    userIds: (locations ?? []).filter((l) => l.business_id === b.id).map((l) => l.ghl_user_id),
  }));
  const ghlState = (usersState?.value ?? {}) as { refreshedAt?: string; error?: string };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="Who can sign in, what they can do, which businesses they can open, and who gets escalations. Anyone with an email here can sign in with Google or a password; clear the email to take access away."
      />

      <TeamTable members={members ?? []} meId={me.memberId} />

      <AccessMatrix
        businesses={businesses ?? []}
        members={(members ?? []).filter((m) => isRole(m.role)).map((m) => ({ id: m.id, name: m.name, role: m.role as Role }))}
        granted={(grants ?? []).map((g) => `${g.member_id}|${g.business_id}`)}
        suggested={suggestions.map((s) => `${s.memberId}|${s.businessId}`)}
      />

      {(ghlUsers?.length ?? 0) > 0 && (
        <GhlUsers
          users={ghlUsers ?? []}
          members={(members ?? []).map((m) => ({ id: m.id, name: m.name, ghl_user_id: m.ghl_user_id, role: m.role }))}
          groups={ghlGroups}
          granted={(grants ?? []).map((g) => `${g.member_id}|${g.business_id}`)}
          refreshedAt={ghlState.refreshedAt ? formatStamp(ghlState.refreshedAt, await businessTimeZone()) : ""}
          error={ghlState.error ?? ""}
        />
      )}

      <div className="grid max-w-4xl gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-md border border-zinc-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy">{ROLE_LABELS[r]}</p>
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
