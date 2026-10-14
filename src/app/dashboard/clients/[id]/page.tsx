import { redirect } from "next/navigation";
import { conversationHref } from "@/lib/links";

/** Old address for a conversation (still in past emails and Slack messages): open it in the Inbox. */
export default async function ClientThreadPage({ params, searchParams }: PageProps<"/dashboard/clients/[id]">) {
  const { id } = await params;
  const { before } = await searchParams;
  redirect(`${conversationHref(id)}${typeof before === "string" ? `&before=${encodeURIComponent(before)}` : ""}`);
}
