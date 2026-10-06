import { describe, expect, it } from "vitest";
import { incomingAlert, type AlertRow } from "./alerts";

const now = new Date("2026-10-06T15:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
const team = { tm_van: "Van", tm_aly: "Aly" };

const row = (over: Partial<AlertRow> = {}): AlertRow => ({
  id: "ct_1",
  client_id: "cl_1",
  channel: "Text",
  priority: "Normal",
  status: "Open",
  source: "ghl",
  summary: "Is the delivery still Thursday?",
  history: [{ at: ago(5), byId: "", message: "Text via GoHighLevel: “Is the delivery still Thursday?”" }],
  ...over,
});

describe("incomingAlert", () => {
  it("alerts on a new contact from GoHighLevel", () => {
    const a = incomingAlert("INSERT", row(), "tm_aly", team, now);
    expect(a).toMatchObject({ headline: "New text", body: "Is the delivery still Thursday?", urgent: false });
  });

  it("alerts when a teammate logs one, but not for your own", () => {
    const manual = row({ source: "manual", channel: "Call", history: [{ at: ago(2), byId: "tm_van", message: "Logged call" }] });
    expect(incomingAlert("INSERT", manual, "tm_aly", team, now)?.headline).toBe("Van logged a call");
    expect(incomingAlert("INSERT", manual, "tm_van", team, now)).toBeNull();
  });

  it("alerts on a further GHL message to a waiting contact", () => {
    const r = row({
      history: [
        { at: ago(600), byId: "", message: "Text via GoHighLevel: “First”" },
        { at: ago(3), byId: "", message: "Text via GoHighLevel: “Hello again?”" },
      ],
    });
    expect(incomingAlert("UPDATE", r, "tm_aly", team, now)).toMatchObject({ headline: "Another message", body: "Hello again?" });
  });

  it("stays quiet for assignments, replies, resolves and stale events", () => {
    const assigned = row({ history: [{ at: ago(3), byId: "tm_van", message: "Assigned to Aly" }] });
    expect(incomingAlert("UPDATE", assigned, "tm_aly", team, now)).toBeNull();
    const replied = row({
      status: "Waiting on client",
      history: [{ at: ago(3), byId: "", message: "Replied in GoHighLevel (text)" }],
    });
    expect(incomingAlert("UPDATE", replied, "tm_aly", team, now)).toBeNull();
    expect(incomingAlert("INSERT", row({ history: [{ at: ago(3600), byId: "", message: "x" }] }), "tm_aly", team, now)).toBeNull();
    expect(incomingAlert("INSERT", row({ history: [] }), "tm_aly", team, now)).toBeNull();
  });

  it("flags urgent contacts and gives each message its own key", () => {
    const a = incomingAlert("INSERT", row({ priority: "Urgent" }), "tm_aly", team, now);
    expect(a?.urgent).toBe(true);
    expect(a?.key).toBe(`ct_1:${ago(5)}`);
  });
});
