import { describe, expect, it } from "vitest";
import { callOutcome, channelStyle, formatDuration, parseAttachments, toCsv } from "./channels";

describe("callOutcome", () => {
  it("classifies GHL call statuses", () => {
    expect(callOutcome("inbound", "Call", "completed")).toBe("connected");
    expect(callOutcome("inbound", "Missed call", "no-answer")).toBe("missed");
    expect(callOutcome("inbound", "Missed call", "busy")).toBe("missed");
    expect(callOutcome("inbound", "Voicemail", "voicemail")).toBe("voicemail");
    expect(callOutcome("outbound", "Call", "no-answer")).toBe("failed");
    expect(callOutcome("outbound", "Call", "failed")).toBe("failed");
    expect(callOutcome("outbound", "Call", "completed")).toBe("connected");
  });
});

describe("helpers", () => {
  it("has a style for every channel", () => {
    expect(channelStyle("Email").label).toBe("Email");
    expect(channelStyle("Unknown").label).toBe("Text");
  });

  it("formats call length", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(125)).toBe("2m 05s");
  });

  it("reads attachments and spots images", () => {
    const a = parseAttachments([
      "https://storage.googleapis.com/msgsndr/x/photo.JPG",
      { url: "https://storage.googleapis.com/msgsndr/x/plan.pdf" },
      "http://insecure.example/x.png",
      42,
    ]);
    expect(a).toEqual([
      { url: "https://storage.googleapis.com/msgsndr/x/photo.JPG", isImage: true, name: "photo.JPG" },
      { url: "https://storage.googleapis.com/msgsndr/x/plan.pdf", isImage: false, name: "plan.pdf" },
    ]);
    expect(parseAttachments(null)).toEqual([]);
  });

  it("writes spreadsheet-safe CSV", () => {
    expect(toCsv(["Name", "Note"], [["Smith, J", "=HYPERLINK(1)"], ["A \"quote\"", null]])).toBe(
      'Name,Note\r\n"Smith, J",\'=HYPERLINK(1)\r\n"A ""quote""",',
    );
  });
});
