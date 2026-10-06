import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getBusinessContext } from "@/lib/business";
import { formatMinutes } from "@/lib/comms/sla";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

function ago(iso: string | null, now: Date) {
  if (!iso) return "—";
  return `${formatMinutes(Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000)))} ago`;
}

/** Escape LIKE wildcards so a search for "50%" or "a_b" matches literally. */
const likeSafe = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export default async function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : 1) || 1);
  const waitingOnly = params.waiting === "1";

  const { current } = await getBusinessContext();
  if (!current) return null;

  const supabase = await createClient();
  let query = supabase
    .from("client_overview")
    .select("*", { count: "exact" })
    .eq("business_id", current.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) {
    const term = `%${likeSafe(q)}%`;
    query = query.or(`name.ilike."${term}",phone.ilike."${term}",email.ilike."${term}",project.ilike."${term}"`);
  }
  if (waitingOnly) query = query.gt("waiting", 0);
  const { data: rows, count, error } = await query;

  const now = new Date();
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) =>
    `/dashboard/clients?${new URLSearchParams({ ...(q && { q }), ...(waitingOnly && { waiting: "1" }), page: String(p) })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Every client and their full conversation history from GoHighLevel. Open a client to read the thread."
      />

      <form className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, email or project…"
          aria-label="Search clients"
          className="w-72 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-sm text-zinc-600">
          <input type="checkbox" name="waiting" value="1" defaultChecked={waitingOnly} className="accent-[#B08D57]" />
          Waiting on us
        </label>
        <button type="submit" className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-400">
          Search
        </button>
        <span className="text-xs text-zinc-500">{total.toLocaleString()} clients</span>
      </form>

      {error ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Couldn&apos;t load clients: {error.message}</p>
      ) : !rows?.length ? (
        <p className="rounded-md border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {q || waitingOnly ? "No clients match." : "No clients yet — they appear as GoHighLevel conversations are copied in."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Latest message</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/clients/${c.id}`} className="font-semibold text-zinc-900 hover:text-[#B08D57] hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{[c.project, c.phone || c.email].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="max-w-md px-3 py-2">
                    {c.last_body ? (
                      <p className="truncate text-zinc-700">
                        <span className="text-zinc-400">{c.last_direction === "outbound" ? "You: " : ""}</span>
                        {c.last_body}
                      </p>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{ago(c.last_message_at, now)}</td>
                  <td className="px-3 py-2">
                    {c.waiting > 0 ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Waiting on us</span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center gap-3 text-sm" aria-label="Pages">
          {page > 1 && (
            <Link href={href(page - 1)} className="text-[#B08D57] hover:underline">
              ← Newer
            </Link>
          )}
          <span className="text-zinc-500">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={href(page + 1)} className="text-[#B08D57] hover:underline">
              Older →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
