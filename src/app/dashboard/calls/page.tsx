import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getBusinessContext } from "@/lib/business";
import { loadCalls, RANGES, type Range } from "@/lib/comms/call-log";
import { CALL_OUTCOMES, formatDuration, type CallOutcome } from "@/lib/comms/channels";
import { slaFromJson } from "@/lib/comms/rows";
import { createClient } from "@/lib/supabase/server";
import { RecordingPlayer } from "../clients/[id]/RecordingPlayer";
import { LogCall } from "./LogCall";

const OUTCOMES = ["all", "missed", "voicemail", "failed", "connected"] as const;

export default async function CallsPage({ searchParams }: PageProps<"/dashboard/calls">) {
  const sp = await searchParams;
  const range = (typeof sp.range === "string" && sp.range in RANGES ? sp.range : "7d") as Range;
  const outcome = OUTCOMES.find((o) => o === sp.outcome) ?? "all";
  const dir = sp.dir === "inbound" || sp.dir === "outbound" ? sp.dir : "all";

  const { current } = await getBusinessContext();
  if (!current) return null;
  const { data: settings } = await (await createClient()).from("settings").select("sla").eq("id", 1).maybeSingle();
  const tz = slaFromJson(settings?.sla).timeZone || "UTC";
  const all = await loadCalls(current.id, range, tz);

  const counts = Object.fromEntries((["connected", "missed", "voicemail", "failed"] as CallOutcome[]).map((o) => [o, all.filter((c) => c.outcome === o).length]));
  const rows = all.filter((c) => (outcome === "all" || c.outcome === outcome) && (dir === "all" || c.direction === dir)).slice(0, 300);
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ range, outcome, dir, ...patch });
    return `/dashboard/calls?${p}`;
  };
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <PageHeader title="Call Log" description={`Every call to and from clients — connected, missed, voicemail and failed. Times in ${tz.replace(/_/g, " ")}.`}>
        <div className="flex gap-2">
          <a href={`/api/export/calls?range=${range}`} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400">
            ⬇ Export CSV
          </a>
          <LogCall />
        </div>
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["missed", "voicemail", "failed", "connected"] as CallOutcome[]).map((o) => (
          <Link
            key={o}
            href={href({ outcome: outcome === o ? "all" : o })}
            className={`rounded-lg border bg-white p-3 hover:border-zinc-300 ${outcome === o ? "border-[#B08D57] ring-1 ring-[#B08D57]" : "border-zinc-200"}`}
          >
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${CALL_OUTCOMES[o].tag}`}>{CALL_OUTCOMES[o].label}</span>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{counts[o]}</p>
          </Link>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={href({ range: r })} className={`rounded-full px-3 py-1 ${range === r ? "bg-[#1C2B47] text-white" : "border border-zinc-300 bg-white text-zinc-600"}`}>
            {RANGES[r]}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-zinc-300" aria-hidden />
        {(["all", "inbound", "outbound"] as const).map((d) => (
          <Link key={d} href={href({ dir: d })} className={`rounded-full px-3 py-1 ${dir === d ? "bg-[#1C2B47] text-white" : "border border-zinc-300 bg-white text-zinc-600"}`}>
            {d === "all" ? "All directions" : d === "inbound" ? "↙ Incoming" : "↗ Outgoing"}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">No calls in this view.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white">
          {rows.map((c) => (
            <li key={c.id} className="grid gap-2 px-4 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center">
              <span className="text-xs tabular-nums text-zinc-500">{fmt.format(new Date(c.occurredAt))}</span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span aria-label={c.direction === "inbound" ? "Incoming" : "Outgoing"} className="text-zinc-400">
                    {c.direction === "inbound" ? "↙" : "↗"}
                  </span>
                  <Link href={`/dashboard/clients/${c.clientId}`} className="font-semibold text-zinc-900 hover:text-[#B08D57] hover:underline">
                    {c.clientName}
                  </Link>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${CALL_OUTCOMES[c.outcome].tag}`}>{CALL_OUTCOMES[c.outcome].label}</span>
                  <span className="text-xs tabular-nums text-zinc-500">{formatDuration(c.durationSeconds)}</span>
                </p>
                {(c.note || c.loggedBy) && (
                  <p className="truncate text-xs text-zinc-500">
                    {c.note}
                    {c.loggedBy && <span className="text-zinc-400">{c.note ? " · " : ""}logged by {c.loggedBy}</span>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                {!c.id.startsWith("manual_") && (c.outcome === "voicemail" || c.outcome === "connected") && (
                  <RecordingPlayer messageId={c.id} label={c.outcome === "voicemail" ? "Play" : "Recording"} />
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:border-zinc-400">
                    📞 Call back
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {all.length > rows.length && rows.length === 300 && <p className="text-xs text-zinc-500">Showing the latest 300. Use Export CSV for everything.</p>}
    </div>
  );
}
