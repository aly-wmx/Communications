import { describe, expect, it } from "vitest";
import { suggestedAccess } from "./access-suggestions";

const members = [
  { id: "van", role: "coordinator", ghl_user_id: "g-van" },
  { id: "reid", role: "manager", ghl_user_id: "g-reid" },
  { id: "aly", role: "admin", ghl_user_id: "g-aly" },
  { id: "new", role: "coordinator", ghl_user_id: null },
];
const locations = [
  { ghl_user_id: "g-van", business_id: "watermark" },
  { ghl_user_id: "g-van", business_id: "manolo" },
  { ghl_user_id: "g-reid", business_id: "watermark" },
  { ghl_user_id: "g-aly", business_id: "garrison" },
];

describe("suggestedAccess", () => {
  it("suggests the GHL sub-accounts a linked teammate is in but can't open yet", () => {
    expect(suggestedAccess({ members, locations, grants: [{ member_id: "van", business_id: "watermark" }, { member_id: "reid", business_id: "watermark" }] })).toEqual([
      { memberId: "van", businessId: "manolo" },
    ]);
  });

  it("never suggests for admins (they see everything) or unlinked teammates", () => {
    const out = suggestedAccess({ members, locations, grants: [] });
    expect(out.map((s) => s.memberId)).not.toContain("aly");
    expect(out.map((s) => s.memberId)).not.toContain("new");
    expect(out).toHaveLength(3);
  });
});
