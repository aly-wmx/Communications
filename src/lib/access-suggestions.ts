/**
 * Business access GoHighLevel suggests: a linked manager or coordinator who is a
 * user in a business's GHL sub-account but can't open that business in the
 * portal. Suggestions only; an admin grants them (Team page).
 */
export interface SuggestionInput {
  members: Array<{ id: string; role: string; ghl_user_id: string | null }>;
  /** GHL user id → the businesses whose sub-account they're in. */
  locations: Array<{ ghl_user_id: string; business_id: string }>;
  grants: Array<{ member_id: string; business_id: string }>;
}

export function suggestedAccess({ members, locations, grants }: SuggestionInput): Array<{ memberId: string; businessId: string }> {
  const has = new Set(grants.map((g) => `${g.member_id}|${g.business_id}`));
  const out: Array<{ memberId: string; businessId: string }> = [];
  for (const m of members) {
    if (m.role === "admin" || !m.ghl_user_id) continue; // admins already see every business
    for (const l of locations) {
      if (l.ghl_user_id === m.ghl_user_id && !has.has(`${m.id}|${l.business_id}`)) out.push({ memberId: m.id, businessId: l.business_id });
    }
  }
  return out;
}
