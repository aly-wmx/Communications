import Link from "next/link";
import { ChannelTag } from "@/components/ChannelTag";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { awaitingPickup } from "@/lib/comms/contacts";
import { loadQueue } from "@/lib/comms/load";
import { formatMinutes, needsEscalation, slaState } from "@/lib/comms/sla";
import type { ClientContact } from "@/lib/comms/types";
import { DEPARTMENTS, departmentStages, isDepartment, isStage, STAGES, STAGE_STYLE, type Department } from "@/lib/stages";
import { createClient } from "@/lib/supabase/server";
import { ConversationView } from "../clients/[id]/ConversationView";
import { NewConversation } from "../clients/NewConversation";
import { canSendMessages } from "@/lib/roles";

const VIEWS = [
  ["mine", "Needs me"],
  ["waiting", "Waiting on us"],
  ["escalated", "Escalated"],
  ["all", "All"],
] as const;
type View = (typeof VIEWS)[number][0];

const LIST_LIMIT = 150;
/** Escape LIKE wildcards; drop characters that would break the filter syntax. */
const safeTerm = (q: string) => `%${q.replace(/[",()]/g, " ").replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function initials(name: string) {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function shortAgo(iso: string | null, now: Date) {
  if (!iso) return "";
  const m = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m || 1}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  if (m < 10080) return `${Math.floor(m / 1440)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function InboxPage({ searchParams }: PageProps<"/dashboard/inbox">) {
  const sp = await searchParams;
  const me = await getSessionMember();
  const { current } = await getBusinessContext();
  if (!me || !current) return null;

  const supabase = await createClient();
  const { data: myRow } = await supabase.from("team_members").select("department").eq("id", me.memberId).maybeSingle();

  const view: View = VIEWS.some(([k]) => k === sp.view) ? (sp.view as View) : "mine";
  // Department: explicit choice, else the person's home department; "all" shows everything.
  const deptParam = typeof sp.dept === "string" ? sp.dept : isDepartment(myRow?.department) ? myRow!.department : "all";
  const dept: Department | "all" = isDepartment(deptParam) ? deptParam : "all";
  const stage = isStage(sp.stage) ? sp.stage : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const selected = typeof sp.c === "string" ? sp.c : "";
  const beforeRaw = typeof sp.before === "string" ? sp.before : "";
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : "";

  const params = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, dept, ...(stage && { stage }), ...(q && { q }), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/dashboard/inbox?${p}`;
  };

  // Open queue items, grouped by client: who's waiting, for how long, and on whom.
  const { contacts, sla } = await loadQueue(current.id);
  const now = new Date();
  const byClient = new Map<string, ClientContact[]>();
  for (const c of contacts) if (c.status !== "Resolved") byClient.set(c.clientId, [...(byClient.get(c.clientId) ?? []), c]);

  const isMine = (list: ClientContact[]) =>
    list.some((c) => c.status === "Open" && (c.assigneeId === me.memberId || (!c.assigneeId && me.role === "coordinator")));
  const viewIds = (fn: (list: ClientContact[]) => boolean) => [...byClient.entries()].filter(([, l]) => fn(l)).map(([id]) => id);
  const idsFor: Record<View, string[] | null> = {
    mine: viewIds(isMine),
    waiting: viewIds((l) => l.some((c) => c.status === "Open")),
    escalated: viewIds((l) => l.some((c) => awaitingPickup(c) || needsEscalation(c, sla, now))),
    all: null,
  };

  let query = supabase
    .from("client_overview")
    .select("id, name, project, phone, email, stage, last_message_at, last_direction, last_channel, last_body, waiting")
    .eq("business_id", current.id)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(LIST_LIMIT);
  const ids = idsFor[view];
  if (ids) query = query.in("id", ids.length ? ids : ["__none__"]);
  if (stage) query = query.eq("stage", stage);
  else if (dept !== "all") {
    const stages = departmentStages(dept).map((s) => `"${s}"`).join(",");
    // Clients without a stage yet are usually new, so Sales sees them too.
    query = dept === "sales" ? query.or(`stage.in.(${stages}),stage.is.null`) : query.in("stage", [...departmentStages(dept)]);
  }
  if (q) {
    const t = safeTerm(q);
    query = query.or(`name.ilike."${t}",phone.ilike."${t}",email.ilike."${t}",project.ilike."${t}"`);
  }
  const { data: list } = await query;

  // Counts for the view tabs (within the same department/stage filter, before search).
  const inScope = (clientStage: string | null) =>
    stage ? clientStage === stage : dept === "all" ? true : (departmentStages(dept) as readonly string[]).includes(clientStage ?? "") || (dept === "sales" && !clientStage);
  const { data: stageRows } = byClient.size
    ? await supabase.from("clients").select("id, stage").in("id", [...byClient.keys()])
    : { data: [] as Array<{ id: string; stage: string | null }> };
  const stageOf = new Map((stageRows ?? []).map((r) => [r.id, r.stage]));
  const count = (v: View) => (idsFor[v] ?? []).filter((id) => inScope(stageOf.get(id) ?? null)).length;

  const rows = (list ?? []).map((c) => {
    const open = byClient.get(c.id) ?? [];
    const waitingOn = open.filter((x) => x.status === "Open");
    const oldest = waitingOn.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))[0];
    const state = oldest ? slaState(oldest, sla, now) : null;
    return {
      ...c,
      escalated: open.some(awaitingPickup),
      overdue: open.some((x) => needsEscalation(x, sla, now)) || state?.stage === "breach",
      dueSoon: state?.stage === "reminder",
      waitedLabel: state ? formatMinutes(state.waitedMinutes) : "",
    };
  });

  const showList = !selected; // On phones, list and conversation take turns.

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-3 lg:h-[calc(100dvh-3rem)]">
      {/* Views and filters */}
      <div className={`flex flex-wrap items-center gap-2 ${selected ? "hidden lg:flex" : ""}`}>
        <nav className="flex flex-wrap gap-0.5 rounded-lg border border-zinc-200 bg-white p-0.5 text-sm" aria-label="Inbox views">
          {VIEWS.map(([key, label]) => (
            <Link
              key={key}
              href={params({ view: key, c: "" })}
              aria-current={view === key ? "page" : undefined}
              className={`rounded-md px-2.5 py-1 ${view === key ? "bg-[#B08D5712] font-semibold text-[#1C2B47]" : "text-zinc-500 hover:text-zinc-900"}`}
            >
              {label}
              {key !== "all" && (
                <span className={`ml-1 text-xs tabular-nums ${key === "escalated" && count(key) ? "font-semibold text-red-600" : "text-zinc-400"}`}>{count(key)}</span>
              )}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-center gap-2" action="/dashboard/inbox">
          <input type="hidden" name="view" value={view} />
          <select name="dept" defaultValue={dept} aria-label="Department" className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm">
            <option value="all">All departments</option>
            {Object.entries(DEPARTMENTS).map(([k, d]) => (
              <option key={k} value={k}>
                {d.label}
              </option>
            ))}
          </select>
          <select name="stage" defaultValue={stage} aria-label="Stage" className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm">
            <option value="">Any stage</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={q} placeholder="Search…" aria-label="Search clients" className="w-40 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm" />
          <button type="submit" className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-sm text-zinc-700 hover:border-zinc-400">
            Apply
          </button>
        </form>
        <span className="flex-1" />
        {canSendMessages(me.role) && <NewConversation />}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversation list */}
        <section
          aria-label="Conversations"
          className={`${showList ? "flex" : "hidden lg:flex"} w-full shrink-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm lg:w-[22rem]`}
        >
          {rows.length === 0 ? (
            <div className="grid flex-1 place-items-center p-8 text-center text-sm text-zinc-500">
              {view === "mine" ? "Nothing needs you right now. Nice work." : view === "escalated" ? "No escalations. 🎉" : "No conversations match."}
            </div>
          ) : (
            <ul className="flex-1 divide-y divide-zinc-100 overflow-y-auto">
              {rows.map((c) => {
                const active = c.id === selected;
                return (
                  <li key={c.id}>
                    <Link
                      href={params({ c: c.id })}
                      aria-current={active ? "true" : undefined}
                      className={`flex gap-3 px-3 py-2.5 ${active ? "bg-[#B08D5714]" : "hover:bg-zinc-50"} ${c.overdue ? "border-l-4 border-red-600" : c.dueSoon ? "border-l-4 border-amber-400" : "border-l-4 border-transparent"}`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1C2B47]/10 text-xs font-bold text-[#1C2B47]">{initials(c.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={`min-w-0 flex-1 truncate text-sm ${c.waiting ? "font-semibold text-zinc-900" : "text-zinc-800"}`}>{c.name}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{shortAgo(c.last_message_at, now)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                          {c.last_channel && <ChannelTag channel={c.last_channel} />}
                          <span className="truncate">
                            {c.last_direction === "outbound" && <span className="text-zinc-400">You: </span>}
                            {c.last_body || "No messages yet"}
                          </span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {c.waiting > 0 && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.overdue ? "bg-red-50 text-red-700" : c.dueSoon ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}
                            >
                              waiting {c.waitedLabel}
                            </span>
                          )}
                          {c.escalated && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Escalated</span>}
                          {isStage(c.stage) && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STAGE_STYLE[c.stage]}`}>{c.stage}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {(list?.length ?? 0) >= LIST_LIMIT && <p className="border-t border-zinc-100 px-3 py-2 text-center text-[11px] text-zinc-400">Showing the {LIST_LIMIT} most recent — search to find others.</p>}
        </section>

        {/* Selected conversation */}
        <div className={`${selected ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col gap-3`}>
          {selected ? (
            <>
              <Link href={params({ c: "" })} className="text-xs font-semibold text-[#B08D57] hover:underline lg:hidden">
                ← Back to inbox
              </Link>
              <ConversationView clientId={selected} before={before} basePath={params({ c: selected })} />
            </>
          ) : (
            <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-zinc-300 bg-white/60 text-sm text-zinc-500">
              Choose a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
