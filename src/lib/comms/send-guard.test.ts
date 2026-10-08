import { describe, expect, it } from "vitest";
import { NEW_CONTACTS_PER_HOUR, SENDS_PER_HOUR, sendBlockedReason } from "./send-guard";

const ok = { canSend: true, sentLastHour: 0, newContactsLastHour: 0 };

describe("sendBlockedReason", () => {
  it("allows a normal send", () => {
    expect(sendBlockedReason(ok, { newContact: false })).toBeNull();
    expect(sendBlockedReason(ok, { newContact: true })).toBeNull();
  });

  it("blocks people who aren't allowed to send yet", () => {
    expect(sendBlockedReason({ ...ok, canSend: false }, { newContact: false })).toMatch(/Can send/);
  });

  it("caps messages per hour", () => {
    expect(sendBlockedReason({ ...ok, sentLastHour: SENDS_PER_HOUR - 1 }, { newContact: false })).toBeNull();
    expect(sendBlockedReason({ ...ok, sentLastHour: SENDS_PER_HOUR }, { newContact: false })).toMatch(/last hour/);
  });

  it("caps new numbers per hour, but only for new conversations", () => {
    const busy = { ...ok, newContactsLastHour: NEW_CONTACTS_PER_HOUR };
    expect(sendBlockedReason(busy, { newContact: true })).toMatch(/new numbers/);
    expect(sendBlockedReason(busy, { newContact: false })).toBeNull();
  });
});
