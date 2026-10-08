import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { REMEMBER_COOKIE, sessionOnly, wantsRemember } from "@/lib/supabase/remember";

// Next.js 16 renamed middleware.ts to proxy.ts (same behavior, new name —
// see AGENTS.md). This runs on every request to keep the Supabase session
// cookie refreshed; it does NOT enforce auth by itself — every page and
// server action must still check the session/role independently. See the
// "Proxy matcher can silently drop coverage" warning in the Next.js docs
// for why this alone is not a security boundary.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          const remember = wantsRemember(request.cookies.get(REMEMBER_COOKIE)?.value);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, sessionOnly(options, remember)),
          );
        },
      },
    },
  );

  // Refreshes the session if the access token has expired.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
