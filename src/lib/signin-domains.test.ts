import { describe, expect, it } from "vitest";
import { emailDomainAllowed, isGoogleVerified, normaliseDomain } from "./signin-domains";

describe("sign-in domains", () => {
  const allowed = ["watermarkdesignbuild.com"];

  it("matches the exact domain only", () => {
    expect(emailDomainAllowed("reid@watermarkdesignbuild.com", allowed)).toBe(true);
    expect(emailDomainAllowed("Reid@WaterMarkDesignBuild.com", allowed)).toBe(true);
    expect(emailDomainAllowed("x@watermarkdesignbuild.com.evil.com", allowed)).toBe(false);
    expect(emailDomainAllowed("x@mail.watermarkdesignbuild.com", allowed)).toBe(false);
    expect(emailDomainAllowed("x@evilwatermarkdesignbuild.com", allowed)).toBe(false);
    expect(emailDomainAllowed("watermarkdesignbuild.com", allowed)).toBe(false);
  });

  it("cleans up domains typed into settings", () => {
    expect(normaliseDomain(" @WaterMarkDesignBuild.com ")).toBe("watermarkdesignbuild.com");
    expect(normaliseDomain("not a domain")).toBeNull();
    expect(normaliseDomain("https://x.com")).toBeNull();
  });

  it("requires a Google-verified account", () => {
    expect(isGoogleVerified({ email_confirmed_at: "2026-10-08", app_metadata: { provider: "google" } })).toBe(true);
    expect(isGoogleVerified({ email_confirmed_at: "2026-10-08", identities: [{ provider: "google" }] })).toBe(true);
    expect(isGoogleVerified({ email_confirmed_at: "2026-10-08", app_metadata: { provider: "email" } })).toBe(false);
    expect(isGoogleVerified({ email_confirmed_at: null, app_metadata: { provider: "google" } })).toBe(false);
  });
});
