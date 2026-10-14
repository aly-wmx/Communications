import "server-only";
import { cache } from "react";
import { slaFromJson } from "@/lib/comms/rows";
import { createClient } from "@/lib/supabase/server";

/** The business time zone from Settings (once per request). UTC until one is set; the health panel flags that. */
export const businessTimeZone = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("sla").eq("id", 1).maybeSingle();
  return slaFromJson(data?.sla).timeZone || "UTC";
});
