import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/roles";
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

  if (!email || !member || !isRole(member.role)) return { status: "not-on-team", email };

  return {
    status: "authenticated",
    member: { memberId: member.id, email: member.email, name: member.name, role: member.role },
  };
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
