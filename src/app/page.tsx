import { redirect } from "next/navigation";

export default function RootPage() {
  // /dashboard's layout redirects to /login itself if there's no session —
  // no need to duplicate that check here.
  redirect("/dashboard");
}
