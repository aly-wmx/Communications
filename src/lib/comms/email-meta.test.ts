import { describe, expect, it } from "vitest";
import { emailMetaFrom, parseAddress, participants } from "./email-meta";

describe("parseAddress", () => {
  it("reads common address formats", () => {
    expect(parseAddress('"Jane Doe" <Jane@Example.com>')).toEqual({ name: "Jane Doe", email: "jane@example.com" });
    expect(parseAddress("<bob@x.com>")).toEqual({ name: "", email: "bob@x.com" });
    expect(parseAddress("bob@x.com")).toEqual({ name: "", email: "bob@x.com" });
    expect(parseAddress("no address here")).toBeNull();
  });
});

describe("emailMetaFrom", () => {
  it("accepts strings, comma lists and arrays", () => {
    const m = emailMetaFrom({
      from: "Maria Hernandez <maria@example.com>",
      to: ["clients@watermarkdesignbuild.com"],
      cc: '"Lee, Sam" <sam@arch.example>, lender@bank.example',
      bcc: [{ email: "audit@wmx.group" }],
      subject: "  Revised drawings ",
    });
    expect(m).toEqual({
      from: "Maria Hernandez <maria@example.com>",
      to: ["clients@watermarkdesignbuild.com"],
      cc: ['"Lee, Sam" <sam@arch.example>', "lender@bank.example"],
      bcc: ["audit@wmx.group"],
      subject: "Revised drawings",
    });
    expect(emailMetaFrom({})).toEqual({ from: "", to: [], cc: [], bcc: [], subject: "" });
  });
});

describe("participants", () => {
  it("lists everyone on the thread, most frequent first, without our own address", () => {
    const own = (e: string) => e.endsWith("@watermarkdesignbuild.com");
    const p = participants(
      [
        emailMetaFrom({ from: "Maria <maria@example.com>", to: "clients@watermarkdesignbuild.com", cc: "sam@arch.example" }),
        emailMetaFrom({ from: "clients@watermarkdesignbuild.com", to: "maria@example.com", cc: "Sam Lee <sam@arch.example>, lender@bank.example" }),
        null,
      ],
      own,
    );
    expect(p).toEqual([
      { email: "maria@example.com", name: "Maria", count: 2 },
      { email: "sam@arch.example", name: "Sam Lee", count: 2 },
      { email: "lender@bank.example", name: "", count: 1 },
    ]);
  });
});
