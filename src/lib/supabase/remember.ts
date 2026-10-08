/**
 * "Stay signed in": when it's off, sign-in cookies become browser-session cookies
 * (no expiry), so closing the browser signs you out. The choice itself is kept in
 * a small cookie that follows the same rule.
 */
export const REMEMBER_COOKIE = "wmx-remember";

/** Stay signed in unless the person explicitly unticked it. */
export function wantsRemember(value: string | undefined): boolean {
  return value !== "0";
}

/** Drop the expiry so the cookie lasts only until the browser closes. */
export function sessionOnly<T extends { maxAge?: number; expires?: Date | number | string }>(options: T | undefined, remember: boolean): T | undefined {
  if (remember || !options) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
