import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const BUSINESS_COOKIE = "wmx-business";

export interface Business {
  id: string;
  name: string;
  color: string;
}

/** All businesses plus the one currently selected in the sidebar (first by name if none chosen yet). */
export async function getBusinessContext(): Promise<{ businesses: Business[]; current: Business | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("id, name, color").order("name");
  const businesses = data ?? [];
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  const current = businesses.find((b) => b.id === chosen) ?? businesses[0] ?? null;
  return { businesses, current };
}
