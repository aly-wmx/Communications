import { describe, expect, it } from "vitest";
import { findMentions, mentionQuery } from "./mentions";

const team = [
  { id: "reid", name: "Reid" },
  { id: "chris", name: "Chris Lee" },
  { id: "van", name: "Van" },
];

describe("findMentions", () => {
  it("finds first names and full names, case-insensitive", () => {
    expect(findMentions("@Reid can you confirm the permit date?", team)).toEqual(["reid"]);
    expect(findMentions("thanks @chris lee and @VAN", team).sort()).toEqual(["chris", "van"]);
  });

  it("ignores emails and partial words", () => {
    expect(findMentions("email reid@watermark.com", team)).toEqual([]);
    expect(findMentions("@Reidy isn't Reid", team)).toEqual([]);
    expect(findMentions("@vanessa", team)).toEqual([]);
  });
});

describe("mentionQuery", () => {
  it("spots the mention being typed", () => {
    expect(mentionQuery("hey @Re")).toBe("Re");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("email me@x")).toBeNull();
    expect(mentionQuery("done")).toBeNull();
  });
});
