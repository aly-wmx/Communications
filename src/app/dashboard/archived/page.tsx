import Link from "next/link";
import { ChannelTag } from "@/components/ChannelTag";
import { PageHeader } from "@/components/PageHeader";
import { getBusinessContext } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { RestoreButton } from "./RestoreButton";

const TABS = [
  ["all", "All"],
  ["spam", "🚫 Spam"],
  ["archived", "🗄 Archived"],
] as const;

export default async function ArchivedPage({ searchParams }: PageProps<"/dashboard/archived">) {
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.show) ? (sp.show as (typeof TABS)[number][0]) : "all";
  const { current } = await getBusinessContext();
  if (!current) return null;

  const supabase = await createClient();
  let query = supabase
    .from("client_overview")
    .select("id, name, project, phone, email, archived_at, archive_reason, last_body, last_channel, last_message_at")
    .eq("business_id", current.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(200);
  if (tab !== "all") query = query.eq("archive_reason", tab);
  const [{ data: rows }, { count: spamCount }, { count: archivedCount }] = await Promise.all([
    query,
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("business_id", current.id).eq("archive_reason", "spam"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("business_id", current.id).eq("archive_reason", "archived"),
  ]);
  const counts: Record<string, number> = { all: (spamCount ?? 0) + (archivedCount ?? 0), spam: spamCount ?? 0, archived: archivedCount ?? 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Archived"
        description="Spam and archived clients. They're out of the queue and client list; new messages from them are kept but don't alert anyone. Restore to bring one back."
      />
      <nav className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-0.5 text-sm" aria-label="Filter">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "all" ? "/dashboard/archived" : `/dashboard/archived?show=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-md px-3 py-1 ${tab === key ? "bg-[#B08D5712] font-semibold text-[#1C2B47]" : "text-zinc-500 hover:text-zinc-900"}`}
          >
            {label} <span className="text-xs text-zinc-400">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      {!rows?.length ? (
        <p className="rounded-md border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">Nothing archived here.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 bg-white">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span aria-hidden className="text-lg">
                {c.archive_reason === "spam" ? "🚫" : "🗄"}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/clients/${c.id}`} className="text-sm font-semibold text-zinc-900 hover:text-[#B08D57] hover:underline">
                  {c.name}
                </Link>
                <p className="text-xs text-zinc-500">
                  {[c.phone || c.email, c.archived_at && `archived ${new Date(c.archived_at).toLocaleDateString()}`].filter(Boolean).join(" · ")}
                </p>
                {c.last_body && (
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-zinc-600">
                    {c.last_channel && <ChannelTag channel={c.last_channel} />}
                    <span className="truncate">{c.last_body}</span>
                  </p>
                )}
              </div>
              <RestoreButton clientId={c.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
