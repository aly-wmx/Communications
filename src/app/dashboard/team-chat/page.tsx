import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getSessionMember } from "@/lib/auth";
import { getBusinessContext } from "@/lib/business";
import { createClient } from "@/lib/supabase/server";
import { TeamChat } from "./TeamChat";
import { conversationHref } from "@/lib/links";
import { formatStamp } from "@/lib/format-time";
import { businessTimeZone } from "@/lib/time-zone";

export default async function TeamChatPage() {
  const me = await getSessionMember();
  if (!me) return null;
  const { current } = await getBusinessContext();
  const tz = await businessTimeZone();
  const supabase = await createClient();
  const [{ data: channel }, { data: clientNotes }, { data: team }] = await Promise.all([
    supabase.from("team_notes").select("id, author_id, body, created_at").is("client_id", null).order("created_at", { ascending: false }).limit(150),
    // Notes on the selected business's clients only; the chat itself is shared across businesses.
    current
      ? supabase
          .from("team_notes")
          .select("id, author_id, body, created_at, client_id, clients!inner(name, business_id)")
          .not("client_id", "is", null)
          .eq("clients.business_id", current.id)
          .order("created_at", { ascending: false })
          .limit(15)
      : { data: [] },
    supabase.from("team_members").select("id, name").order("name"),
  ]);
  const nameOf = (id: string | null) => (team ?? []).find((t) => t.id === id)?.name ?? "Former teammate";

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-4 lg:h-[calc(100dvh-3rem)]">
      <PageHeader title="Team Chat" description="Questions for the team that aren't about one client. For a specific client, leave a 🔒 Team note on their conversation instead." />
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
        <TeamChat
          messages={[...(channel ?? [])].reverse().map((m) => ({ id: m.id, authorId: m.author_id, authorName: nameOf(m.author_id), body: m.body, createdAt: m.created_at }))}
          meId={me.memberId}
          isAdmin={me.role === "admin"}
          timeZone={tz}
          team={team ?? []}
        />
        <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:w-80">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest notes on clients</h2>
          {!clientNotes?.length ? (
            <p className="mt-2 text-sm text-zinc-500">None yet.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {clientNotes.map((n) => (
                <li key={n.id} className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm">
                  <Link href={conversationHref(n.client_id ?? "")} className="text-xs font-semibold text-amber-900 hover:underline">
                    {(n.clients as unknown as { name: string } | null)?.name ?? "Client"}
                  </Link>
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-zinc-800">{n.body}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {nameOf(n.author_id)} · {formatStamp(n.created_at, tz)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
