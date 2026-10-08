import { describe, expect, it } from "vitest";
import { sessionOnly, wantsRemember } from "./remember";

describe("stay signed in", () => {
  it("defaults to staying signed in", () => {
    expect(wantsRemember(undefined)).toBe(true);
    expect(wantsRemember("1")).toBe(true);
    expect(wantsRemember("0")).toBe(false);
  });

  it("removes the expiry only when not staying signed in", () => {
    const opts = { path: "/", maxAge: 34560000, sameSite: "lax" as const };
    expect(sessionOnly(opts, true)).toEqual(opts);
    expect(sessionOnly(opts, false)).toEqual({ path: "/", sameSite: "lax" });
    expect(sessionOnly({ path: "/", expires: new Date(0) }, false)).toEqual({ path: "/" });
  });
});
