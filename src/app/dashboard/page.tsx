import Link from "next/link";
import { ChannelTag } from "@/components/ChannelTag";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { loadQueue } from "@/lib/comms/load";
import { buildOverview, dayKey, describeChange } from "@/lib/comms/overview";
import { formatMinutes } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";
import { BarList, ColumnChart } from "./reports/Charts";

const mins = (m: number | null) => (m == null ? "—" : formatMinutes(m));

function greeting(hour: number) {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** A number that links to the items behind it. */
function StatCard({ href, label, value, hint, tone = "neutral" }: { href: string; label: string; value: number | string; hint?: string; tone?: "neutral" | "alert" | "good" }) {
  const ring = tone === "alert" ? "border-red-200 bg-red-50/60" : tone === "good" ? "border-emerald-200 bg-emerald-50/50" : "border-zinc-200 bg-white";
  return (
    <Link href={href} className={`group rounded-lg border p-4 transition-colors hover:border-[#B08D57] ${ring}`}>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "alert" ? "text-red-700" : "text-zinc-900"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
      <p className="mt-2 text-[11px] font-semibold text-[#B08D57] opacity-0 transition-opacity group-hover:opacity-100">View →</p>
    </Link>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function OverviewPage() {
  const me = await getSessionMember();
  const { current } = await getBusinessContext();
  if (!me || !current) return null;

  const supabase = await createClient();
  const { contacts, sla } = await loadQueue(current.id);
  const now = new Date();
  const tz = sla.timeZone || "UTC";
  const o = buildOverview(contacts, sla, now, me.memberId);

  // Today's calls and replies (business calendar).
  const todayStart = new Date(now.getTime() - 26 * 60 * 60_000).toISOString(); // generous window, filtered by day below
  const [{ data: team }, { data: clientRows }, { data: todayMsgs }, { data: flagged }] = await Promise.all([
    supabase.from("team_members").select("id, name, email, escalation, slack_user_id"),
    supabase.from("clients").select("id, name").eq("business_id", current.id),
    supabase
      .from("messages")
      .select("direction, channel, sent_by_user, occurred_at, clients!inner(business_id)")
      .eq("clients.business_id", current.id)
      .gte("occurred_at", todayStart),
    supabase.from("team_notes").select("client_id").eq("flagged_for", me.memberId).gte("created_at", new Date(now.getTime() - 14 * 86_400_000).toISOString()),
  ]);
  const todayKey = dayKey(now, tz);
  const today = (todayMsgs ?? []).filter((m) => dayKey(m.occurred_at, tz) === todayKey);
  const repliesToday = today.filter((m) => m.direction === "outbound" && m.sent_by_user && !["Call", "Missed call", "Voicemail"].includes(m.channel)).length;
  const missedToday = today.filter((m) => m.channel === "Missed call").length;
  const voicemailsToday = today.filter((m) => m.channel === "Voicemail").length;

  const openClientIds = new Set(contacts.filter((c) => c.status === "Open").map((c) => c.clientId));
  const flaggedForMe = new Set((flagged ?? []).map((f) => f.client_id).filter((id): id is string => Boolean(id) && openClientIds.has(id!))).size;

  const nameOf = (id: string) => (team ?? []).find((t) => t.id === id)?.name ?? "Unassigned";
  const clientName = (id: string) => (clientRows ?? []).find((c) => c.id === id)?.name ?? "Client";
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(now);
  const caughtUp = o.mine.waiting === 0 && o.mine.escalatedToMe === 0 && flaggedForMe === 0;

  const frt = describeChange(o.week.medianFirstResponse, "minutes");
  const within = describeChange(o.week.withinTargetPct, "percent");
  const volume = describeChange(o.week.contacts, "count");
  const changeTone = (g: boolean | null) => (g === true ? "text-emerald-700" : g === false ? "text-red-700" : "text-zinc-500");

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-500">{dateLabel}</p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {greeting(hour)}, {me.name.split(" ")[0]}
          </h1>
        </div>
        <Link href="/dashboard/inbox" className="rounded-md bg-[#1C2B47] px-4 py-2 text-sm font-semibold text-white hover:brightness-125">
          Open Inbox →
        </Link>
      </header>

      {/* 1. For you */}
      <Section title="For you">
        {caughtUp ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 text-sm text-emerald-900">
            <p className="font-semibold">✓ You&apos;re all caught up.</p>
            <p className="mt-0.5 text-emerald-800">Nothing is waiting on you, flagged for you, or escalated to you right now.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              href="/dashboard/inbox?view=mine"
              label="Waiting on you"
              value={o.mine.waiting}
              hint={o.mine.overdue ? `${o.mine.overdue} overdue` : "None overdue"}
              tone={o.mine.overdue ? "alert" : "neutral"}
            />
            <StatCard href="/dashboard/inbox?view=mine" label="Flagged for you to reply" value={flaggedForMe} hint="From team notes" tone={flaggedForMe ? "alert" : "neutral"} />
            <StatCard
              href="/dashboard/escalations"
              label="Escalated to you"
              value={o.mine.escalatedToMe}
              hint="Waiting for someone to say “I’ve got it”"
              tone={o.mine.escalatedToMe ? "alert" : "neutral"}
            />
          </div>
        )}
      </Section>

      {/* 2. Team right now */}
      <Section title="Team right now">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard href="/dashboard/inbox?view=waiting&dept=all" label="Clients waiting on us" value={o.team.waiting} />
          <StatCard href="/dashboard/inbox?view=waiting&dept=all&sort=waiting" label="Overdue" value={o.team.overdue} hint={`Past the ${formatMinutes(sla.escalateMinutes)} target`} tone={o.team.overdue ? "alert" : "good"} />
          <StatCard href="/dashboard/escalations" label="Escalations to pick up" value={o.team.awaitingPickup} hint={o.team.needsEscalation ? `${o.team.needsEscalation} more past target` : undefined} tone={o.team.awaitingPickup ? "alert" : "neutral"} />
          <StatCard href="/dashboard/inbox?view=waiting&dept=all" label="Unassigned" value={o.team.unassigned} hint="Nobody owns these yet" tone={o.team.unassigned ? "alert" : "neutral"} />
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* 3. Needs attention now */}
        <Section title="Needs attention now" action={<Link href="/dashboard/inbox?view=waiting&dept=all&sort=waiting" className="text-xs font-semibold text-[#B08D57] hover:underline">See all →</Link>}>
          {o.attention.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">Nobody is waiting on a reply. 🎉</p>
          ) : (
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
              {o.attention.map((a) => (
                <li key={a.contactId}>
                  <Link
                    href={`/dashboard/inbox?view=all&dept=all&c=${a.clientId}`}
                    className={`flex items-center gap-3 border-l-4 px-4 py-3 hover:bg-zinc-50 ${a.escalated || a.overdue ? "border-red-600" : "border-amber-400"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-zinc-900">
                        {clientName(a.clientId)}
                        {a.escalated && <span className="rounded-full bg-red-600 px-1.5 text-[10px] text-white">Escalated</span>}
                        {a.urgent && <span className="rounded bg-red-100 px-1.5 text-[10px] text-red-700">Urgent</span>}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-zinc-500">
                        <ChannelTag channel={a.channel} />
                        <span className="truncate">{a.summary || "No message text"}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold tabular-nums ${a.overdue ? "text-red-700" : "text-amber-700"}`}>{formatMinutes(a.waitedMinutes)}</p>
                      <p className="text-[11px] text-zinc-500">{a.assigneeId ? nameOf(a.assigneeId) : "Unassigned"}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 4. This week vs last week */}
        <Section title="This week vs last week" action={<Link href="/dashboard/reports?range=7d" className="text-xs font-semibold text-[#B08D57] hover:underline">Reports →</Link>}>
          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
            {[
              { label: "Median first response", value: mins(o.week.medianFirstResponse.current), change: frt },
              { label: "Answered within target", value: o.week.withinTargetPct.current == null ? "—" : `${o.week.withinTargetPct.current}%`, change: within },
              { label: "Client contacts", value: String(o.week.contacts.current ?? 0), change: volume },
            ].map((k) => (
              <div key={k.label} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-xs text-zinc-500">{k.label}</p>
                  <p className={`text-xs font-medium ${changeTone(k.change.good)}`}>
                    {k.change.good === true ? "▲ " : k.change.good === false ? "▼ " : ""}
                    {k.change.text}
                  </p>
                </div>
                <p className="text-2xl font-semibold tabular-nums text-zinc-900">{k.value}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* 5. Today, trend and workload */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Today">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["New client contacts", o.today.newContacts],
              ["Replies sent", repliesToday],
              ["Missed calls", missedToday],
              ["Voicemails", voicemailsToday],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-zinc-200 bg-white p-3">
                <p className="text-[11px] font-medium text-zinc-500">{label}</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900">{value}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Last 14 days">
          <ColumnChart
            title="Client contacts per day"
            unit="Contacts"
            points={o.trend.map((d) => {
              const label = new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
              return { label, value: d.contacts, display: String(d.contacts) };
            })}
          />
        </Section>
        <Section title="Workload">
          <BarList
            title="Open items per person"
            subtitle="Overdue shown beside each"
            rows={o.workload.map((w) => ({ label: nameOf(w.memberId), value: w.open, display: String(w.open), note: w.overdue ? `${w.overdue} overdue` : "on time" }))}
          />
        </Section>
      </div>

      {me.role === "admin" && <AdminHealth team={team ?? []} hasTimeZone={Boolean(sla.timeZone)} nowMs={now.getTime()} />}
    </div>
  );
}

/** Admins only, and only what needs fixing: integrations, failed notifications, unfinished setup. */
async function AdminHealth({
  team,
  hasTimeZone,
  nowMs,
}: {
  team: Array<{ name: string; email: string; escalation: boolean; slack_user_id: string }>;
  hasTimeZone: boolean;
  nowMs: number;
}) {
  const supabase = await createClient();
  const since = new Date(nowMs - 24 * 60 * 60_000).toISOString();
  const [{ data: sync }, { data: users }, { count: failed }] = await Promise.all([
    supabase.from("integration_state").select("value").eq("key", "ghl_sync").maybeSingle(),
    supabase.from("integration_state").select("value").eq("key", "ghl_users").maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", since).or("slack_status.eq.failed,email_status.eq.failed"),
  ]);
  const s = (sync?.value ?? {}) as { lastOkAt?: string; lastError?: string };
  const syncAge = s.lastOkAt ? Math.floor((nowMs - new Date(s.lastOkAt).getTime()) / 60_000) : null;
  const usersErr = (users?.value as { error?: string } | null)?.error;

  const issues: Array<{ text: string; href: string }> = [];
  if (syncAge == null || syncAge > 5) issues.push({ text: s.lastError ? `GoHighLevel sync failing: ${s.lastError}` : `GoHighLevel hasn't synced for ${syncAge == null ? "a while" : formatMinutes(syncAge)}`, href: "/dashboard/settings" });
  if (!process.env.SLACK_BOT_TOKEN) issues.push({ text: "Slack isn't connected, so escalations only go by email and the bell", href: "/dashboard/settings" });
  if (failed) issues.push({ text: `${failed} notification${failed === 1 ? "" : "s"} failed to deliver in the last 24 hours`, href: "/dashboard/notifications" });
  if (usersErr) issues.push({ text: usersErr, href: "/dashboard/settings" });
  if (!hasTimeZone) issues.push({ text: "Business time zone isn't set", href: "/dashboard/settings" });
  const noEmail = team.filter((t) => !t.email).map((t) => t.name);
  if (noEmail.length) issues.push({ text: `No sign-in email for ${noEmail.join(", ")}`, href: "/dashboard/team" });
  const managers = team.filter((t) => t.escalation);
  if (!managers.length) issues.push({ text: "Nobody receives escalations", href: "/dashboard/team" });
  const noSlack = managers.filter((t) => !t.slack_user_id).map((t) => t.name);
  if (noSlack.length) issues.push({ text: `No Slack ID for ${noSlack.join(", ")} (escalation recipients)`, href: "/dashboard/team" });

  return (
    <Section title="System health · admins">
      {issues.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">✓ Everything is connected and set up.</p>
      ) : (
        <ul className="divide-y divide-amber-100 rounded-lg border border-amber-200 bg-amber-50/60">
          {issues.map((i) => (
            <li key={i.text}>
              <Link href={i.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-50">
                <span>⚠ {i.text}</span>
                <span className="shrink-0 text-xs font-semibold text-[#B08D57]">Fix →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
