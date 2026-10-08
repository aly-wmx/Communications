import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { isRole, type Role } from "@/lib/roles";
import { emailDomainAllowed, isGoogleVerified } from "@/lib/signin-domains";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { ActionResult } from "@/lib/action-result";

export interface SessionMember {
  memberId: string;
  email: string;
  name: string;
  role: Role;
}

// The one place that resolves "who is this and what can they do." Access is
// the team list: a signed-in email (password or Google) only gets in if an
// admin has added it under Team. The same rule is enforced by RLS in the
// database; this check turns it into the right redirect and message.
export type SessionCheckResult =
  | { status: "authenticated"; member: SessionMember }
  | { status: "no-session" }
  | { status: "not-on-team"; email: string };

export async function checkSession(): Promise<SessionCheckResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { status: "no-session" };
  const email = userData.user.email ?? "";

  // Compared exactly in code: ilike would treat "_" and "%" in an address as wildcards.
  // RLS returns nothing at all to someone who isn't on the team.
  const { data: members } = await supabase.from("team_members").select("id, name, email, role");
  const member = (members ?? []).find((m) => m.email && m.email.toLowerCase() === email.toLowerCase());

  if (!member) {
    const joined = await autoJoin(userData.user);
    if (joined) return { status: "authenticated", member: joined };
  }
  if (!email || !member || !isRole(member.role)) return { status: "not-on-team", email };

  return {
    status: "authenticated",
    member: { memberId: member.id, email: member.email, name: member.name, role: member.role },
  };
}

/**
 * A Google-verified account on an allowed domain (Settings → Allowed sign-in
 * domains) joins as a coordinator; admins are told. Runs once, on first sign-in.
 */
async function autoJoin(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
  identities?: Array<{ provider?: string }> | null;
  user_metadata?: { full_name?: string; name?: string };
}): Promise<SessionMember | null> {
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !isGoogleVerified(user) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  // Not a team member yet, so RLS hides settings from them: read with the server's access.
  const admin = createServiceRoleClient();
  const { data: settings } = await admin.from("settings").select("allowed_domains, blocked_emails").eq("id", 1).maybeSingle();
  if (!emailDomainAllowed(email, settings?.allowed_domains ?? [])) return null;
  if ((settings?.blocked_emails ?? []).some((b) => b.toLowerCase() === email)) return null;

  const name = (user.user_metadata?.full_name || user.user_metadata?.name || email.split("@")[0]).trim().slice(0, 120);
  const id = `tm_${randomUUID()}`;
  const { error } = await admin.from("team_members").insert({ id, name, email, role: "coordinator" });
  if (error) {
    // Someone added them at the same moment: use that record.
    const { data: existing } = await admin.from("team_members").select("id, name, email, role").eq("email", email).maybeSingle();
    return existing && isRole(existing.role) ? { memberId: existing.id, email: existing.email, name: existing.name, role: existing.role } : null;
  }

  const { data: admins } = await admin.from("team_members").select("id").eq("role", "admin");
  if (admins?.length) {
    await admin.from("notifications").insert(
      admins.map((a) => ({
        recipient_id: a.id,
        kind: "mention",
        title: `${name} joined the portal`,
        body: `Signed in with Google as ${email} (allowed domain) and was added as a Coordinator. Change their role or remove them on the Team page.`,
        link: "/dashboard/team",
      })),
    );
  }
  return { memberId: id, email, name, role: "coordinator" };
}

export async function getSessionMember(): Promise<SessionMember | null> {
  const result = await checkSession();
  return result.status === "authenticated" ? result.member : null;
}

// Server actions re-check the role even though RLS enforces it too, so a
// rejected write becomes a clear message instead of a raw Postgres error.
type DeniedResult = Extract<ActionResult, { ok: false }>;

export async function requireMember(): Promise<DeniedResult | null> {
  const member = await getSessionMember();
  return member ? null : { ok: false, error: "You're not signed in as a team member." };
}

/** For admin-only pages: anyone else is sent back to the overview. */
export async function requireAdminPage(): Promise<SessionMember> {
  const member = await getSessionMember();
  if (!member) redirect("/login");
  if (member.role !== "admin") redirect("/dashboard");
  return member;
}

export async function requireAdmin(): Promise<DeniedResult | null> {
  const member = await getSessionMember();
  if (!member || member.role !== "admin") return { ok: false, error: "Only an admin can do that." };
  return null;
}
