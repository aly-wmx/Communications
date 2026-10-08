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
  app_metadata?: { provider?: string; providers?: string[] };
  identities?: Array<{ provider?: string }> | null;
}

/** Signed in with Google, whose address Google has already verified. */
export function isGoogleVerified(user: UserLike): boolean {
  const viaGoogle =
    user.app_metadata?.provider === "google" ||
    (user.app_metadata?.providers ?? []).includes("google") ||
    (user.identities ?? []).some((i) => i.provider === "google");
  return viaGoogle && Boolean(user.email_confirmed_at);
}
