import { describe, expect, it } from "vitest";
import { businessFieldSchema, newBusinessSchema } from "./businesses";
import { ticketUpdateSchema } from "./tickets";
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

  it("accepts a GoHighLevel location id, or empty to disconnect", () => {
    const location = (value: string) =>
      businessFieldSchema.safeParse({ id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427", field: "ghl_location_id", value }).success;
    expect(location("ve9EPM428h8vShlRW1KT")).toBe(true);
    expect(location(" ve9EPM428h8vShlRW1KT ")).toBe(true);
    expect(location("")).toBe(true);
    expect(location("short")).toBe(false);
    expect(location("has spaces in it")).toBe(false);
    expect(location("https://app.gohighlevel.com/v2/location/abc")).toBe(false);
  });
});

describe("ticket due dates", () => {
  const due = (value: string) =>
    ticketUpdateSchema.safeParse({ id: "1b4e28ba-2fa1-41d2-883f-0016d3cca427", field: "due", value }).success;
  const year = new Date().getUTCFullYear();

  it("accepts a real date in the next few years, or none", () => {
    expect(due(`${year}-12-01`)).toBe(true);
    expect(due(`${year + 1}-03-15`)).toBe(true);
    expect(due("")).toBe(true);
  });

  it("refuses a half-typed year, so it can't be saved as overdue", () => {
    expect(due("0002-10-16")).toBe(false);
    expect(due("0020-10-16")).toBe(false);
    expect(due(`${year + 50}-01-01`)).toBe(false);
  });
});
