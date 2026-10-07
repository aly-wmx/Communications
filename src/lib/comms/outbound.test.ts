import { describe, expect, it } from "vitest";
import { newConversationSchema, replySchema } from "@/lib/validation/messaging";
import { smsSegments, textToHtml, toE164 } from "./outbound";

describe("toE164", () => {
  it("formats North American numbers", () => {
    expect(toE164("(555) 014-2000")).toBe("+15550142000");
    expect(toE164("1-555-014-2000")).toBe("+15550142000");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects things that aren't phone numbers", () => {
    expect(toE164("12345")).toBe("");
    expect(toE164("")).toBe("");
  });
});

describe("textToHtml", () => {
  it("escapes HTML and keeps paragraphs", () => {
    expect(textToHtml("Hi <b>Maria</b>,\nThanks!\n\nAly")).toBe("<p>Hi &lt;b&gt;Maria&lt;/b&gt;,<br>Thanks!</p><p>Aly</p>");
  });
});

describe("smsSegments", () => {
  it("counts segments", () => {
    expect(smsSegments("")).toBe(0);
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("Thanks 👍")).toBe(1);
    expect(smsSegments("👍".repeat(71))).toBe(2);
  });
});

describe("messaging schemas", () => {
  it("requires a subject for email and text for everything", () => {
    expect(replySchema.safeParse({ clientId: "cl_1", channel: "SMS", message: "On our way" }).success).toBe(true);
    expect(replySchema.safeParse({ clientId: "cl_1", channel: "SMS", message: "  " }).success).toBe(false);
    expect(replySchema.safeParse({ clientId: "cl_1", channel: "Email", message: "Hi" }).success).toBe(false);
    expect(replySchema.safeParse({ clientId: "cl_1", channel: "Email", subject: "Update", message: "Hi" }).success).toBe(true);
  });

  it("needs the right contact detail for a new person", () => {
    const base = { mode: "new", name: "Sam Lee", phone: "", email: "", message: "Hello" } as const;
    expect(newConversationSchema.safeParse({ ...base, channel: "SMS" }).success).toBe(false);
    expect(newConversationSchema.safeParse({ ...base, channel: "SMS", phone: "5550142000" }).success).toBe(true);
    expect(newConversationSchema.safeParse({ ...base, channel: "Email", subject: "Hi", email: "sam@example.com" }).success).toBe(true);
    expect(newConversationSchema.safeParse({ ...base, channel: "Email", subject: "Hi", email: "nope" }).success).toBe(false);
  });
});

describe("clientUpdateSchema", () => {
  it("normalises email and requires a name", async () => {
    const { clientUpdateSchema } = await import("@/lib/validation/clients");
    const base = { clientId: "cl_1", name: "Maria", project: "", phone: "", email: " Maria@Example.COM ", ownerId: "", notes: "" };
    expect(clientUpdateSchema.parse(base).email).toBe("maria@example.com");
    expect(clientUpdateSchema.safeParse({ ...base, name: " " }).success).toBe(false);
    expect(clientUpdateSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
});

describe("htmlToText", () => {
  it("keeps the words and line breaks, drops markup", async () => {
    const { htmlToText } = await import("./outbound");
    expect(htmlToText("<style>p{}</style><p>Hi Aly,</p><p>Drawings attached&nbsp;&amp; ready.<br>Thanks!</p>")).toBe(
      "Hi Aly,\nDrawings attached & ready.\nThanks!",
    );
  });

  it("removes the quoted earlier conversation", async () => {
    const { htmlToText } = await import("./outbound");
    expect(htmlToText("<p>Sounds good.</p><p>On Mon, Oct 5, 2026 at 9:00 AM Aly wrote:</p><blockquote>Old text</blockquote>")).toBe(
      "Sounds good.",
    );
  });
});
