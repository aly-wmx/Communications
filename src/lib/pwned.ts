import "server-only";
import { createHash } from "node:crypto";

/**
 * Has this password appeared in a known data breach? Uses Have I Been Pwned's
 * k-anonymity range API: only the first 5 characters of the password's SHA-1
 * hash leave the server, never the password. If the service can't be reached,
 * the password is allowed (the length rules still apply).
 */
export async function isPwnedPassword(password: string): Promise<boolean> {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [s, count] = line.trim().split(":");
      return s === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
