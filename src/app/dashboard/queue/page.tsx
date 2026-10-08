import { redirect } from "next/navigation";

// The Client Queue is now the Inbox's "Waiting on us" view.
export default function QueuePage() {
  redirect("/dashboard/inbox?view=waiting");
}
