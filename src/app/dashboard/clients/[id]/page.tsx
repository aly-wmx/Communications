import Link from "next/link";
import { ConversationView } from "./ConversationView";

export default async function ClientThreadPage({ params, searchParams }: PageProps<"/dashboard/clients/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  // ?before=<ISO time> shows the page of messages before that point (for long histories).
  const beforeRaw = typeof sp.before === "string" ? sp.before : "";
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw).toISOString() : "";

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-4 lg:h-[calc(100dvh-3rem)]">
      <Link href="/dashboard/inbox" className="text-xs font-semibold text-[#B08D57] hover:underline">
        ← Inbox
      </Link>
      <ConversationView clientId={id} before={before} basePath={`/dashboard/clients/${id}`} />
    </div>
  );
}
