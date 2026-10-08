import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getSessionMember } from "@/lib/auth";
import { ACTIONS, PAGES, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, isRole, type ActionAccess, type Role } from "@/lib/roles";
import { DEPARTMENTS } from "@/lib/stages";
import { createClient } from "@/lib/supabase/server";

const KIND_LABEL: Record<string, string> = {
  escalation: "escalations",
  picked_up: "pick-ups",
  mention: "mentions and reply flags",
  reminder: "reminders",
  new_message: "new client messages",
};
const kinds = (list: string[]) => {
  const words = Object.keys(KIND_LABEL).filter((k) => list.includes(k)).map((k) => KIND_LABEL[k]);
  return words.length ? words.join(", ") : "nothing";
};

function Mark({ yes, label }: { yes: boolean; label?: string }) {
  return yes ? (
    <span className="inline-flex items-center gap-1 font-semibold text-[#3F7A5C]">
      <span aria-hidden>✓</span>
      {label ?? <span className="sr-only">Yes</span>}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-zinc-500">
      <span aria-hidden>—</span>
      {label ?? <span className="sr-only">No</span>}
    </span>
  );
}

/** Everyone: what their role and Team settings let them see and do. Admins can look at anyone's (?member=). */
export default async function AccessPage({ searchParams }: PageProps<"/dashboard/access">) {
  const me = await getSessionMember();
  if (!me) return null;
  const sp = await searchParams;
  const supabase = await createClient();

  const wanted = typeof sp.member === "string" && me.role === "admin" ? sp.member : me.memberId;
  const [{ data: member }, { data: admins }, { data: rules }, { data: prefs }, { data: auth }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, email, role, department, can_send, escalation, slack_user_id")
      .eq("id", wanted)
      .maybeSingle(),
    supabase.from("team_members").select("id, name").eq("role", "admin").order("name"),
    supabase.from("settings").select("email_kinds, dm_kinds").eq("id", 1).maybeSingle(),
    supabase.from("notification_prefs").select("slack, email").eq("member_id", wanted).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!member || !isRole(member.role)) {
    return <p className="text-sm text-zinc-600">That team member wasn&apos;t found.</p>;
  }

  const role: Role = member.role;
  const self = member.id === me.memberId;
  const who = self ? "You" : member.name;
  const has = (a: ActionAccess) =>
    a.roles.includes(role) && (a.needs === "can_send" ? member.can_send : a.needs === "escalation" ? member.escalation : true);
  const signIn = self
    ? [...new Set((auth.user?.identities ?? []).map((i) => (i.provider === "google" ? "Google" : i.provider === "email" ? "Password" : i.provider)))]
    : [];
  const department = member.department ? DEPARTMENTS[member.department as keyof typeof DEPARTMENTS]?.label : "";
  const open = PAGES.filter((p) => p.roles.includes(role));
  const closed = PAGES.filter((p) => !p.roles.includes(role));
  const emailOn = prefs?.email ?? true;
  const slackOn = prefs?.slack ?? true;
  const compareRows: { label: string; roles: readonly Role[]; needs?: ActionAccess["needs"] }[] = [
    ...PAGES.filter((p) => p.roles.length < ROLES.length).map((p) => ({ label: `${p.label} page`, roles: p.roles })),
    ...ACTIONS,
  ];
  const adminNames = (admins ?? []).map((a) => a.name).join(", ") || "an admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title={self ? "My access" : `Access: ${member.name}`}
        description={
          self
            ? "What your role and Team settings let you see and do in the portal."
            : `What ${member.name} can see and do. Change their role or switches on the Team page.`
        }
      >
        {!self && (
          <Link href="/dashboard/team" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400">
            ← Team
          </Link>
        )}
      </PageHeader>

      <section aria-labelledby="summary" className="max-w-4xl rounded-lg border border-zinc-200 bg-white p-5">
        <h2 id="summary" className="sr-only">
          Summary
        </h2>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="rounded-full bg-[#1C2B47] px-3 py-1 text-sm font-semibold text-white">{ROLE_LABELS[role]}</span>
          <p className="text-sm text-zinc-700">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-zinc-500">Sign-in email</dt>
            <dd className="text-zinc-900">
              {member.email || "None — can't sign in"}
              {signIn.length > 0 && <span className="text-zinc-600"> · {signIn.join(" or ")}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-zinc-500">Department</dt>
            <dd className="text-zinc-900">{department || "All departments"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-zinc-500">Can message clients</dt>
            <dd>
              {member.can_send ? (
                <Mark yes label="Yes" />
              ) : (
                <span className="font-semibold text-amber-800">Not yet — waiting for an admin to turn on “Can send”</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-zinc-500">Receives escalations</dt>
            <dd>{member.escalation ? <Mark yes label="Yes" /> : <Mark yes={false} label="No" />}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold text-zinc-500">Notifications outside the portal</dt>
            <dd className="text-zinc-900">
              Email: {emailOn && member.email ? kinds(rules?.email_kinds ?? ["escalation"]) : "off"} · Slack DM:{" "}
              {slackOn && member.slack_user_id ? kinds(rules?.dm_kinds ?? ["escalation"]) : member.slack_user_id ? "off" : "no Slack member ID yet"}
              {self && (
                <Link href="/dashboard/notifications" className="ml-2 text-xs font-semibold text-[#8A6A3A] hover:underline">
                  Change →
                </Link>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="pages" className="max-w-4xl space-y-3">
        <h2 id="pages" className="text-sm font-semibold text-zinc-900">
          Pages
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#3F7A5C]">{who} can open</h3>
            <ul className="mt-2 space-y-2">
              {open.map((p) => (
                <li key={p.href} className="text-sm">
                  <Link href={p.href} className="font-medium text-zinc-900 hover:text-[#8A6A3A] hover:underline">
                    {p.label}
                  </Link>
                  <p className="text-xs text-zinc-600">{p.description}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Admins only</h3>
            {closed.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">{self ? "You" : member.name} can open every page.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {closed.map((p) => (
                  <li key={p.href} className="text-sm">
                    <span className="font-medium text-zinc-700">
                      <span aria-hidden>🔒 </span>
                      {p.label}
                    </span>
                    <p className="text-xs text-zinc-600">{p.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="actions" className="max-w-4xl space-y-3">
        <h2 id="actions" className="text-sm font-semibold text-zinc-900">
          What {self ? "you" : member.name} can do
        </h2>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {ACTIONS.map((a) => {
            const yes = has(a);
            const byRole = a.roles.includes(role);
            const why = !byRole
              ? `${a.roles.map((r) => ROLE_LABELS[r]).join(" and ")} only`
              : a.needs === "can_send" && !member.can_send
                ? "Needs “Can send” on the Team page"
                : a.needs === "escalation" && !member.escalation
                  ? "Needs “Escalations” ticked on the Team page"
                  : "";
            return (
              <li key={a.label} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 w-5 shrink-0 text-center">
                  <Mark yes={yes} />
                </span>
                <div className="min-w-0">
                  <p className={`text-sm ${yes ? "font-medium text-zinc-900" : "text-zinc-600"}`}>{a.label}</p>
                  {(why || (yes && a.note)) && <p className="text-xs text-zinc-600">{why || a.note}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="compare" className="max-w-4xl space-y-3">
        <h2 id="compare" className="text-sm font-semibold text-zinc-900">
          All roles compared
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-600">
                <th className="px-4 py-2 font-semibold">Page or action</th>
                {ROLES.map((r) => (
                  <th key={r} className={`w-28 px-2 py-2 text-center font-semibold ${r === role ? "bg-[#B08D57]/10 text-zinc-900" : ""}`}>
                    {ROLE_LABELS[r]}
                    {r === role && <span className="block text-[10px] font-normal text-zinc-600">{self ? "you" : member.name}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {compareRows.map(
                (row) => (
                  <tr key={row.label}>
                    <td className="px-4 py-2 text-zinc-800">
                      {row.label}
                      {row.needs && (
                        <span className="block text-[11px] text-zinc-600">
                          {row.needs === "can_send" ? "Also needs “Can send” on the Team page" : "For people with “Escalations” ticked"}
                        </span>
                      )}
                    </td>
                    {ROLES.map((r) => (
                      <td key={r} className={`px-2 py-2 text-center ${r === role ? "bg-[#B08D57]/10" : ""}`}>
                        <Mark yes={row.roles.includes(r)} />
                      </td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-600">Every other page is open to all three roles.</p>
      </section>

      <p className="max-w-4xl text-sm text-zinc-600">
        Need more access? Ask {me.role === "admin" && self ? "another admin" : adminNames}
        {me.role === "admin" && self ? (
          <>
            , or change roles and switches on the{" "}
            <Link href="/dashboard/team" className="font-semibold text-[#8A6A3A] hover:underline">
              Team page
            </Link>
            .
          </>
        ) : (
          "."
        )}
      </p>
    </div>
  );
}
