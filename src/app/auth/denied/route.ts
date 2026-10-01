import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signed in, but not on the team list. Route handlers can clear cookies
// (server component layouts can't), so the layout sends people here.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(`${request.nextUrl.origin}/login?reason=not-on-team`);
}
