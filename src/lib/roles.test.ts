import { describe, expect, it } from "vitest";
import { ACTIONS, canExport, canOpen, canSendMessages, PAGES, ROLES } from "./roles";

describe("canSendMessages", () => {
  it("lets every role message clients", () => {
    expect(canSendMessages("admin")).toBe(true);
    expect(canSendMessages("manager")).toBe(true);
    expect(canSendMessages("coordinator")).toBe(true);
  });
});

describe("canExport", () => {
  it("limits client-data downloads to managers and admins", () => {
    expect(canExport("admin")).toBe(true);
    expect(canExport("manager")).toBe(true);
    expect(canExport("coordinator")).toBe(false);
  });
});

describe("access list", () => {
  it("matches the real checks, so My access never over- or under-promises", () => {
    const exportRow = ACTIONS.find((a) => a.label.startsWith("Export"))!;
    for (const r of ROLES) {
      expect(exportRow.roles.includes(r)).toBe(canExport(r));
      // Pages that call requireAdminPage().
      for (const href of ["/dashboard/team", "/dashboard/businesses", "/dashboard/settings"]) expect(canOpen(r, href)).toBe(r === "admin");
    }
    const sendRow = ACTIONS.find((a) => a.label.startsWith("Reply"))!;
    expect(ROLES.every((r) => sendRow.roles.includes(r) === canSendMessages(r))).toBe(true);
    expect(sendRow.needs).toBe("can_send");
  });

  it("lists every page once", () => {
    expect(new Set(PAGES.map((p) => p.href)).size).toBe(PAGES.length);
  });
});
