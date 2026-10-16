import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Db = SupabaseClient<Database>;

/**
 * Who can open a business: every admin, plus the managers and coordinators an
 * admin gave it to (Team page). The database enforces the same rule
 * (member_has_business_access); this is for choosing who to list and notify.
 */
export async function memberIdsWithAccess(sb: Db, businessId: string): Promise<Set<string>> {
  const [{ data: admins, error: adminError }, { data: granted, error: grantError }] = await Promise.all([
    sb.from("team_members").select("id").eq("role", "admin"),
    sb.from("team_member_businesses").select("member_id").eq("business_id", businessId),
  ]);
  if (adminError) throw adminError;
  if (grantError) throw grantError;
  return new Set([...(admins ?? []).map((a) => a.id), ...(granted ?? []).map((g) => g.member_id)]);
}

/** Only the people who can open this business, for assignee and recipient lists. */
export async function withAccess<T extends { id: string }>(sb: Db, businessId: string, team: T[]): Promise<T[]> {
  const ids = await memberIdsWithAccess(sb, businessId);
  return team.filter((t) => ids.has(t.id));
}
