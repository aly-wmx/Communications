import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getBusinessContext } from "@/lib/business";
import { getSessionMember } from "@/lib/auth";
import { canExport } from "@/lib/roles";
import { loadQueue } from "@/lib/comms/load";
import { buildReport, REPORT_RANGES, type ReportRange } from "@/lib/comms/reports";
import { formatMinutes } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";
import { BarList, ColumnChart } from "./Charts";

const MAX_WEEKS = 16;
const mins = (m: number | null) => (m == null ? "—" : formatMinutes(m));

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      {note && <p className="mt-0.5 text-xs text-zinc-500">{note}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/dashboard/reports">) {
  const sp = await searchParams;
  const range = (typeof sp.range === "string" && sp.range in REPORT_RANGES ? sp.range : "30d") as ReportRange;
  const [{ current }, me] = await Promise.all([getBusinessContext(), getSessionMember()]);
  if (!current) return null;
  const exportable = me ? canExport(me.role) : false;

  const [{ contacts, sla }, { data: team }] = await Promise.all([
    loadQueue(current.id),
    (await createClient()).from("team_members").select("id, name"),
  ]);
  const r = buildReport(contacts, sla, new Date(), range);
  const nameOf = (id: string) => (team ?? []).find((t) => t.id === id)?.name ?? "Former teammate";
  const weeks = r.weeks.slice(-MAX_WEEKS);
  const weekLabel = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const target = `${sla.escalateMinutes} min${sla.businessHours.enabled ? " of business time" : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description={`How quickly clients get a first response. Times count business hours (${(sla.timeZone || "UTC").replace(/_/g, " ")}); the target is ${target}. Spam and archived clients are left out.`}
      >
        {exportable && (
          <a href={`/api/export/contacts?range=${range}`} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400">
            ⬇ Export CSV
          </a>
        )}
      </PageHeader>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Time range">
        {(Object.keys(REPORT_RANGES) as ReportRange[]).map((k) => (
          <Link
            key={k}
            href={`/dashboard/reports?range=${k}`}
            aria-current={range === k ? "page" : undefined}
            className={`rounded-full px-3 py-1 ${range === k ? "bg-[#1C2B47] text-white" : "border border-zinc-300 bg-white text-zinc-600"}`}
          >
            {REPORT_RANGES[k]}
          </Link>
        ))}
      </nav>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Client contacts" value={r.totals.contacts} note={`${r.totals.answered} answered · ${r.totals.resolvedWithoutReply} resolved without a reply`} />
        <Tile label="Median first response" value={mins(r.totals.medianFirstResponse)} note={`Average ${mins(r.totals.averageFirstResponse)}`} />
        <Tile label="Answered within target" value={r.totals.withinTargetPct == null ? "—" : `${r.totals.withinTargetPct}%`} note={`Target: ${target}`} />
        <Tile label="Escalated" value={r.totals.escalated} note={`${r.totals.autoEscalated} automatically · ${r.totals.waitingNow} still waiting`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ColumnChart
          title="Client contacts per week"
          subtitle={weeks.length < r.weeks.length ? `Latest ${MAX_WEEKS} weeks` : undefined}
          unit="Contacts"
          points={weeks.map((w) => ({ label: weekLabel(w.week), value: w.contacts, display: String(w.contacts) }))}
        />
        <ColumnChart
          title="Answered within target, by week"
          subtitle="Share of answered contacts that got a first response in time"
          unit="Within target"
          max={100}
          points={weeks.map((w) => ({ label: weekLabel(w.week), value: w.withinTargetPct, display: w.withinTargetPct == null ? "no replies" : `${w.withinTargetPct}%` }))}
        />
        <ColumnChart
          title="Escalations per week"
          unit="Escalations"
          points={weeks.map((w) => ({ label: weekLabel(w.week), value: w.escalated, display: String(w.escalated) }))}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Contacts by channel"
          subtitle="Median first response shown beside each"
          rows={r.channels.map((c) => ({ label: c.channel, value: c.contacts, display: String(c.contacts), note: `median ${mins(c.medianFirstResponse)}` }))}
        />
        <figure className="rounded-lg border border-zinc-200 bg-white p-4">
          <figcaption className="text-sm font-semibold text-zinc-900">By person</figcaption>
          {r.people.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">No replies recorded in this range.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="py-1 font-medium">Person</th>
                  <th className="py-1 text-right font-medium">First replies</th>
                  <th className="py-1 text-right font-medium">Median</th>
                  <th className="py-1 text-right font-medium">Within target</th>
                  <th className="py-1 text-right font-medium">Escalations picked up</th>
                </tr>
              </thead>
              <tbody>
                {r.people.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-100">
                    <td className="py-1.5 text-zinc-800">{nameOf(p.id)}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.answered}</td>
                    <td className="py-1.5 text-right tabular-nums">{mins(p.medianFirstResponse)}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.withinTargetPct == null ? "—" : `${p.withinTargetPct}%`}</td>
                    <td className="py-1.5 text-right tabular-nums">{p.pickedUp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-zinc-500">Replies sent from GoHighLevel are counted when the sync can tell who sent them; otherwise they show as the person who clicked Responded.</p>
        </figure>
      </section>
    </div>
  );
}
