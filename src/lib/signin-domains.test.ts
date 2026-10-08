import { describe, expect, it } from "vitest";
import { emailDomainAllowed, googleVerifiedEmail, normaliseDomain } from "./signin-domains";

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

  it("only trusts the address Google verified, and only while it is still the account's email", () => {
    const google = (email: string, email_verified: unknown = true) => ({ provider: "google", identity_data: { email, email_verified } });
    const at = "2026-10-08";
    expect(googleVerifiedEmail({ email: "Van@WatermarkDesignBuild.com", email_confirmed_at: at, identities: [google("van@watermarkdesignbuild.com")] })).toBe(
      "van@watermarkdesignbuild.com",
    );
    // Google account is a gmail; the account email was changed to the company domain afterwards.
    expect(googleVerifiedEmail({ email: "x@watermarkdesignbuild.com", email_confirmed_at: at, identities: [google("x@gmail.com")] })).toBeNull();
    expect(googleVerifiedEmail({ email: "a@watermarkdesignbuild.com", email_confirmed_at: at, identities: [google("a@watermarkdesignbuild.com", false)] })).toBeNull();
    expect(googleVerifiedEmail({ email: "a@watermarkdesignbuild.com", email_confirmed_at: at, identities: [{ provider: "email" }] })).toBeNull();
    expect(googleVerifiedEmail({ email: "a@watermarkdesignbuild.com", email_confirmed_at: null, identities: [google("a@watermarkdesignbuild.com")] })).toBeNull();
  });
});
