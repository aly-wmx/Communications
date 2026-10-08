import { describe, expect, it } from "vitest";
import { canExport, canSendMessages } from "./roles";

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
