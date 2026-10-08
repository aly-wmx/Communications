import { redirect } from "next/navigation";

// The client list is now the Inbox's "All" view (search carries over).
export default async function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  redirect(`/dashboard/inbox?view=all&dept=all${q ? `&q=${encodeURIComponent(q)}` : ""}`);
}
