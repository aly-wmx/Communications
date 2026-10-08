import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { REMEMBER_COOKIE, wantsRemember } from "./remember";

function rememberFromDocument(): boolean {
  if (typeof document === "undefined") return true;
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${REMEMBER_COOKIE}=`));
  return wantsRemember(match?.split("=")[1]);
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // "Stay signed in" off: no expiry, so token refreshes in the browser stay session-only too.
    rememberFromDocument() ? undefined : { cookieOptions: { maxAge: undefined } },
  );
}

/** Save the "Stay signed in" choice before signing in (used by Google sign-in, which starts in the browser). */
export function setRememberChoice(remember: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = remember
    ? `${REMEMBER_COOKIE}=1; Path=/; Max-Age=${400 * 24 * 60 * 60}; SameSite=Lax${secure}`
    : `${REMEMBER_COOKIE}=0; Path=/; SameSite=Lax${secure}`;
}
