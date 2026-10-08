import { describe, expect, it } from "vitest";
import { senderLabel } from "./sender";

const names = (id: string) => ({ u1: "Reid Smith" } as Record<string, string>)[id];
const out = (over: Partial<Parameters<typeof senderLabel>[0]>) => senderLabel({ direction: "outbound", source: "", sentByUser: false, ghlUserId: "", ...over }, names);

describe("senderLabel", () => {
  it("names who replied and where from", () => {
    expect(out({ source: "portal:Aly", sentByUser: true })).toBe("Aly · via Portal");
    expect(out({ source: "app", sentByUser: true, ghlUserId: "u1" })).toBe("Reid Smith · via GoHighLevel");
    expect(out({ source: "mobile_app", sentByUser: true, ghlUserId: "u1" })).toBe("Reid Smith · via GoHighLevel app");
    expect(out({ source: "app", sentByUser: true, ghlUserId: "unknown" })).toBe("Team member · via GoHighLevel");
  });

  it("labels automation", () => {
    expect(out({ source: "workflow" })).toBe("Automated · GHL workflow");
    expect(out({ source: "bulk_actions" })).toBe("Automated · GHL campaign");
    expect(out({ source: "" })).toBe("Automated · GoHighLevel");
  });

  it("labels client messages", () => {
    expect(senderLabel({ direction: "inbound", source: "", sentByUser: false, ghlUserId: "" }, names)).toBe("via GoHighLevel");
    expect(senderLabel({ direction: "inbound", source: "portal:Van", sentByUser: false, ghlUserId: "" }, names)).toBe("Logged by Van");
  });
});
