import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// One per request — Server Components read cookies, Server Actions/Route
// Handlers can also write them. Writes from a Server Component are caught
// and ignored below; proxy.ts (src/proxy.ts) is what actually keeps the
// session cookie refreshed on every request.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render, where cookies can't be
            // set. Safe to ignore — proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
