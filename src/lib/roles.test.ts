import { describe, expect, it } from "vitest";
import { canSendMessages } from "./roles";

describe("canSendMessages", () => {
  it("lets every role message clients", () => {
    expect(canSendMessages("admin")).toBe(true);
    expect(canSendMessages("manager")).toBe(true);
    expect(canSendMessages("coordinator")).toBe(true);
  });
});