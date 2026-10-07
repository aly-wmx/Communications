import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { queueStats } from "@/lib/comms/contacts";
import { loadQueue } from "@/lib/comms/load";
import { formatMinutes } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";

function Tile({ label, value, note, alert }: { label: string; value: string | number; note?: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-red-700" : "text-zinc-900"}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-zinc-500">{note}</p>}
    </div>
  );
}

function Check({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm">
      <span
        aria-hidden
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
          done ? "bg-[#3F7A5C] text-white" : "border border-zinc-300 text-transparent"
        }`}
      >
        ✓
      </span>
      <span className={done ? "text-zinc-500 line-through" : "text-zinc-800"}>{children}</span>
      <span className="sr-only">{done ? "(done)" : "(to do)"}</span>
    </li>
  );
}

export default async function OverviewPage() {
  const member = await getSessionMember();
  const { current } = await getBusinessContext();
  const supabase = await createClient();
  const [{ contacts, sla }, { data: team }, { data: syncRow }] = await Promise.all([
    current ? loadQueue(current.id) : Promise.resolve({ contacts: [], sla: undefined }),
    supabase.from("team_members").select("name, email, escalation, slack_user_id"),
    supabase.from("integration_state").select("value").eq("key", "ghl_sync").maybeSingle(),
  ]);
  const { data: backfillRow } = await supabase.from("integration_state").select("value").eq("key", "ghl_backfill").maybeSingle();
  const backfill = (backfillRow?.value ?? {}) as {
    done?: boolean;
    lastError?: string;
    totals?: { conversations: number; messages: number; queued: number };
  };
  const sync = (syncRow?.value ?? {}) as { lastOkAt?: string; lastRunAt?: string; lastError?: string };
  const now = new Date();
  const minutesSince = (iso?: string) => (iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000) : null);
  const okAgo = minutesSince(sync.lastOkAt);
  const ghlHealthy = okAgo != null && okAgo <= 5 && (!sync.lastRunAt || sync.lastRunAt <= (sync.lastOkAt ?? ""));
  const stats = sla ? queueStats(contacts, sla, now) : null;

  const people = team ?? [];
  const missingEmail = people.filter((p) => !p.email).map((p) => p.name);
  const escalation = people.filter((p) => p.escalation);
  const escalationMissingSlack = escalation.filter((p) => !p.slack_user_id).map((p) => p.name);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Overview${current ? ` · ${current.name}` : ""}`}
        description="Clients waiting on a response, and how quickly they're getting one."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Waiting on us" value={stats?.waiting ?? 0} />
        <Tile
          label="Needs escalation"
          value={stats?.needsEscalation ?? 0}
          alert={!!stats?.needsEscalation}
          note="Past the response target, not yet escalated"
        />
        <Tile label="Overdue" value={stats?.overdue ?? 0} alert={!!stats?.overdue} />
        <Tile
          label="Median first response"
          value={stats?.medianResponse7d == null ? "—" : formatMinutes(stats.medianResponse7d)}
          note={
            stats?.withinSla7d == null ? "Last 7 days" : `${Math.round(stats.withinSla7d * 100)}% within target · 7 days`
          }
        />
      </section>

      {contacts.length === 0 && (
        <p className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          No client contacts yet. The Client Queue and Call Log arrive in phase 2, and GoHighLevel messages will start
          appearing here once it&apos;s connected.
        </p>
      )}

      {member?.role === "admin" && (
        <section className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Setup</h2>
          <ul className="mt-3 space-y-2">
            <Check done={missingEmail.length === 0}>
              Add sign-in emails for everyone on the team
              {missingEmail.length > 0 && <span className="text-zinc-500"> — still missing: {missingEmail.join(", ")}</span>}
            </Check>
            <Check done={ghlHealthy}>
              Connect GoHighLevel
              <span className="text-zinc-500">
                {" — "}
                {ghlHealthy
                  ? `last synced ${okAgo === 0 ? "just now" : `${okAgo} min ago`}`
                  : sync.lastError
                    ? `last attempt failed: ${sync.lastError}`
                    : okAgo != null
                      ? `no sync for ${formatMinutes(okAgo)}`
                      : "not synced yet"}
              </span>
            </Check>
            <Check done={Boolean(backfill.done)}>
              Copy conversation history from GoHighLevel
              <span className="text-zinc-500">
                {" — "}
                {backfill.totals
                  ? `${backfill.totals.conversations.toLocaleString()} conversations, ${backfill.totals.messages.toLocaleString()} messages${
                      backfill.totals.queued ? `, ${backfill.totals.queued} unanswered added to the queue` : ""
                    }${backfill.done ? "" : " so far (running every minute)"}`
                  : "not started"}
                {backfill.lastError && !backfill.done && ` · paused: ${backfill.lastError}`}
              </span>
            </Check>
            <Check done={Boolean(sla?.timeZone)}>
              <Link href="/dashboard/settings" className="hover:underline">
                Set the business time zone
              </Link>
              {!sla?.timeZone && <span className="text-zinc-500"> — wait times use it to count business hours</span>}
            </Check>
            <Check done={escalation.length > 0}>Choose who receives escalations</Check>
            <Check done={escalation.length > 0 && escalationMissingSlack.length === 0}>
              Add Slack member IDs for escalation recipients
              {escalationMissingSlack.length > 0 && (
                <span className="text-zinc-500"> — still missing: {escalationMissingSlack.join(", ")}</span>
              )}
            </Check>
          </ul>
          <Link href="/dashboard/team" className="mt-4 inline-block text-xs font-semibold text-[#B08D57] hover:underline">
            Go to Team →
          </Link>
        </section>
      )}
    </div>
  );
}
