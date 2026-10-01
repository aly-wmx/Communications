import { describe, expect, it } from "vitest";
import { businessFieldSchema, newBusinessSchema } from "./businesses";
import { memberFieldSchema } from "./team";

describe("memberFieldSchema", () => {
  it("normalises emails and allows clearing one", () => {
    const r = memberFieldSchema.parse({ id: "tm_1", field: "email", value: "  Van@Watermark.COM " });
    expect(r.value).toBe("van@watermark.com");
    expect(memberFieldSchema.safeParse({ id: "tm_1", field: "email", value: "" }).success).toBe(true);
    expect(memberFieldSchema.safeParse({ id: "tm_1", field: "email", value: "not an email" }).success).toBe(false);
  });

  it("checks roles, names and Slack IDs", () => {
    expect(memberFieldSchema.safeParse({ id: "tm_1", field: "role", value: "manager" }).success).toBe(true);
    expect(memberFieldSchema.safeParse({ id: "tm_1", field: "role", value: "owner" }).success).toBe(false);
    expect(memberFieldSchema.safeParse({ id: "tm_1", field: "name", value: "   " }).success).toBe(false);
    expect(memberFieldSchema.parse({ id: "tm_1", field: "slack_user_id", value: "u01abc2def" }).value).toBe("U01ABC2DEF");
    expect(memberFieldSchema.safeParse({ id: "tm_1", field: "slack_user_id", value: "@reid" }).success).toBe(false);
  });

  it("rejects fields that aren't editable", () => {
    expect(memberFieldSchema.safeParse({ id: "tm_1", field: "id", value: "x" }).success).toBe(false);
  });
});

describe("business schemas", () => {
  it("requires a name and a hex colour", () => {
    expect(newBusinessSchema.safeParse({ name: "Manolo Roofing", color: "#2B4438" }).success).toBe(true);
    expect(newBusinessSchema.safeParse({ name: " ", color: "#2B4438" }).success).toBe(false);
    expect(newBusinessSchema.safeParse({ name: "X", color: "red" }).success).toBe(false);
    expect(
      businessFieldSchema.safeParse({ id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427", field: "name", value: "Twofold" }).success,
    ).toBe(true);
  });
});
