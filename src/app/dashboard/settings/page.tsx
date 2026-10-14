import { PageHeader } from "@/components/PageHeader";
import { requireAdminPage } from "@/lib/auth";
import { slaFromJson } from "@/lib/comms/rows";
import { ghlStatusLine, loadGhlHealth } from "@/lib/comms/ghl-health";
import { createClient } from "@/lib/supabase/server";
import { SlaForm } from "./SlaForm";
import { SignInAccess } from "./SignInAccess";
import { SlackChannel } from "./SlackChannel";
import { NotificationRules } from "./NotificationRules";

export default async function SettingsPage() {
  await requireAdminPage();
  const supabase = await createClient();
  const [{ data: settings }, { data: team }, ghl] = await Promise.all([
    supabase.from("settings").select("sla, allowed_domains, blocked_emails, slack_channel_id, slack_channel_events, email_kinds, dm_kinds").eq("id", 1).maybeSingle(),
    supabase.from("team_members").select("id, name, escalation").order("name"),
    loadGhlHealth(supabase),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Response-time targets, business hours, and connections to other tools." />
      <SlaForm initial={slaFromJson(settings?.sla)} team={team ?? []} />
      <NotificationRules
        initial={{
          email: settings?.email_kinds ?? ["escalation"],
          dm: settings?.dm_kinds ?? ["escalation"],
          channel: settings?.slack_channel_events ?? [],
        }}
        slackConnected={Boolean(process.env.SLACK_BOT_TOKEN)}
      />
      <SlackChannel channelId={settings?.slack_channel_id ?? ""} connected={Boolean(process.env.SLACK_BOT_TOKEN)} />
      <SignInAccess domains={settings?.allowed_domains ?? []} blocked={settings?.blocked_emails ?? []} />

      <section className="max-w-3xl space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Connections</h2>
        <div className="flex items-start justify-between gap-4 text-sm">
          <div>
            <p className="font-medium text-zinc-800">GoHighLevel</p>
            <p className="text-xs text-zinc-500">
              Messages sync every minute; replies and new conversations send through each business&apos;s own sub-account (set on the
              Businesses page).
            </p>
          </div>
          <ul className="space-y-0.5 text-right">
            {ghl.map((h) => {
              const { text, ok } = ghlStatusLine(h, slaFromJson(settings?.sla).timeZone || "UTC");
              return (
                <li key={h.businessId} className={`text-xs font-semibold ${ok ? "text-[#3F7A5C]" : "text-amber-700"}`}>
                  {ghl.length > 1 ? `${h.businessName}: ` : ""}
                  {text}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex items-start justify-between gap-4 text-sm">
          <div>
            <p className="font-medium text-zinc-800">Slack</p>
            <p className="text-xs text-zinc-500">Direct messages and team channel posts, as chosen under Notifications.</p>
          </div>
          <p className={`text-xs font-semibold ${process.env.SLACK_BOT_TOKEN ? "text-[#3F7A5C]" : "text-amber-700"}`}>
            {process.env.SLACK_BOT_TOKEN ? "Connected" : "Not connected — add SLACK_BOT_TOKEN in Vercel"}
          </p>
        </div>
      </section>
    </div>
  );
}
