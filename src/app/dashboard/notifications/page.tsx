import { PageHeader } from "@/components/PageHeader";
import { getSessionMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrefsForm } from "./PrefsForm";

const STATUS: Record<string, string> = { sent: "✓ sent", skipped: "— off", failed: "✗ failed", pending: "… sending" };

export default async function NotificationsPage() {
  const me = await getSessionMember();
  if (!me) return null;
  const supabase = await createClient();
  const [{ data: prefRow }, { data: member }, { data: recent }, { data: rules }] = await Promise.all([
    supabase.from("notification_prefs").select("*").eq("member_id", me.memberId).maybeSingle(),
    supabase.from("team_members").select("email, slack_user_id").eq("id", me.memberId).maybeSingle(),
    supabase
      .from("notifications")
      .select("id, title, kind, created_at, slack_status, email_status, delivery_error")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase.from("settings").select("email_kinds, dm_kinds").eq("id", 1).maybeSingle(),
  ]);
  const slackReady = Boolean(process.env.SLACK_BOT_TOKEN);

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Choose how the portal reaches you outside the portal. Everything always shows in the bell and pop-ups." />
      <PrefsForm
        initial={{
          slack: prefRow?.slack ?? true,
          email: prefRow?.email ?? true,
          new_messages: prefRow?.new_messages ?? true,
          reminders: prefRow?.reminders ?? true,
        }}
        canSlack={
          !slackReady
            ? "Slack isn't connected yet — an admin needs to add the Slack app."
            : !member?.slack_user_id
              ? "Add your Slack member ID on the Team page (ask an admin)."
              : ""
        }
        canEmail={!member?.email ? "No email on your team record." : ""}
        rules={{ email: rules?.email_kinds ?? ["escalation"], dm: rules?.dm_kinds ?? ["escalation"] }}
      />

      <section className="max-w-2xl rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Recent deliveries</h2>
        {!recent?.length ? (
          <p className="mt-2 text-sm text-zinc-500">Nothing sent to you yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-zinc-500">
                <th className="py-1">Notification</th>
                <th className="py-1">Slack</th>
                <th className="py-1">Email</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((n) => (
                <tr key={n.id} className="border-t border-zinc-100 align-top">
                  <td className="py-1.5 pr-2">
                    <span className="text-zinc-800">{n.title}</span>
                    <span className="block text-[11px] text-zinc-400">{new Date(n.created_at).toLocaleString()}</span>
                    {n.delivery_error && <span className="block text-[11px] text-red-600">{n.delivery_error}</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-xs text-zinc-600">{STATUS[n.slack_status] ?? n.slack_status}</td>
                  <td className="whitespace-nowrap py-1.5 text-xs text-zinc-600">{STATUS[n.email_status] ?? n.email_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
