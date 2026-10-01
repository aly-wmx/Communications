import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Bypasses RLS entirely. Only ever call this from a server action that has
// already verified the caller's profile role is 'admin' — this client does
// not know or care who is asking. Never import this file from anything that
// runs in the browser.
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
