/** Who may join the portal automatically: Google-verified accounts on an allowed email domain. */

const DOMAIN = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

export function normaliseDomain(value: string): string | null {
  const d = value.trim().toLowerCase().replace(/^@/, "");
  return DOMAIN.test(d) ? d : null;
}

/** Exact domain match only: "name@watermarkdesignbuild.com", not "…@watermarkdesignbuild.com.evil.com" or subdomains. */
export function emailDomainAllowed(email: string, allowed: string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return allowed.some((d) => normaliseDomain(d) === domain);
}

interface UserLike {
  email?: string | null;
  email_confirmed_at?: string | null;
  identities?: Array<{ provider?: string; identity_data?: { email?: unknown; email_verified?: unknown } }> | null;
}

/**
 * The address Google itself verified, if it is still this account's email.
 * "Has a Google identity" isn't enough: the account's email can be changed
 * afterwards, so it must equal the Google identity's verified address.
 */
export function googleVerifiedEmail(user: UserLike): string | null {
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return null;
  const match = (user.identities ?? []).some((i) => {
    if (i.provider !== "google") return false;
    const data = i.identity_data ?? {};
    const verified = data.email_verified === true || data.email_verified === "true";
    return verified && typeof data.email === "string" && data.email.trim().toLowerCase() === email;
  });
  return match ? email : null;
}
