import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const THREAD_LIMIT = 500;

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default async function ClientThreadPage({ params }: PageProps<"/dashboard/clients/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: newest }, { count }, { data: open }] = await Promise.all([
    supabase.from("clients").select("id, name, project, phone, email").eq("id", id).maybeSingle(),
    supabase.from("messages").select("*").eq("client_id", id).order("occurred_at", { ascending: false }).limit(THREAD_LIMIT),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("client_id", id),
    supabase.from("contacts").select("id").eq("client_id", id).eq("status", "Open"),
  ]);
  if (!client) notFound();

  const thread = [...(newest ?? [])].reverse();
  const total = count ?? thread.length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/clients" className="text-xs font-semibold text-[#B08D57] hover:underline">
          ← Clients
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold text-zinc-900">{client.name}</h1>
          {open && open.length > 0 && (
            <Link href="/dashboard/queue" className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 hover:underline">
              Waiting on us — open queue
            </Link>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          {[client.project, client.phone, client.email].filter(Boolean).join(" · ") || "No contact details"}
          {client.phone && (
            <>
              {" · "}
              <a href={`tel:${client.phone}`} className="text-[#B08D57] hover:underline">
                Call
              </a>
            </>
          )}
        </p>
      </div>

      <section className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-4">
        {total > thread.length && (
          <p className="mb-3 text-center text-xs text-zinc-500">
            Showing the latest {thread.length.toLocaleString()} of {total.toLocaleString()} messages.
          </p>
        )}
        {thread.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No messages copied for this client yet.</p>
        ) : (
          <ol className="space-y-2">
            {thread.map((m, i) => {
              const newDay = i === 0 || dayLabel(thread[i - 1].occurred_at) !== dayLabel(m.occurred_at);
              const isCall = m.channel === "Call" || m.channel === "Missed call" || m.channel === "Voicemail";
              const out = m.direction === "outbound";
              return (
                <li key={m.id}>
                  {newDay && (
                    <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{dayLabel(m.occurred_at)}</p>
                  )}
                  {isCall ? (
                    <p className="text-center text-xs text-zinc-500">
                      <span className={m.channel === "Missed call" ? "font-semibold text-red-700" : ""}>📞 {m.body}</span> · {when(m.occurred_at)}
                    </p>
                  ) : (
                    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          out ? "rounded-br-sm bg-[#1C2B47] text-white" : "rounded-bl-sm bg-zinc-100 text-zinc-900"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body || <em className="opacity-70">({m.channel.toLowerCase()} with no text)</em>}</p>
                        <p className={`mt-1 text-[10px] ${out ? "text-white/70" : "text-zinc-500"}`}>
                          {m.channel} · {when(m.occurred_at)}
                          {out && !m.sent_by_user && " · automated"}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
