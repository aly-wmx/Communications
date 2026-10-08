import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { contactFromRow, slaFromJson } from "./rows";
import type { ClientContact, SlaSettings } from "./types";

/** Supabase returns at most 1000 rows per request; read in pages so nothing is silently cut off. */
const PAGE = 1000;
/** Safety stop (100k contacts); far beyond what one business produces. */
const MAX_PAGES = 100;

type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];

/**
 * Every contact for one business (archived and spam clients left out), plus the
 * escalation matrix. RLS limits this to team members. Cached per request, so the
 * layout's badges and the page share one load instead of reading twice.
 */
export const loadQueue = cache(async (businessId: string): Promise<{ contacts: ClientContact[]; sla: SlaSettings }> => {
  const supabase = await createClient();
  const rowsPromise = (async () => {
    const all: ContactRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      // The inner join filters by business; the joined column itself isn't needed.
      const { data, error } = await supabase
        .from("contacts")
        .select("*, clients!inner(business_id, archived_at)")
        .eq("clients.business_id", businessId)
        .is("clients.archived_at", null)
        .order("received_at", { ascending: false })
        .order("id")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      all.push(...((data ?? []) as unknown as ContactRow[]));
      if (!data || data.length < PAGE) break;
    }
    return all;
  })();
  const [rows, { data: settings }] = await Promise.all([rowsPromise, supabase.from("settings").select("sla").eq("id", 1).maybeSingle()]);
  return {
    contacts: rows.map((row) => contactFromRow(row)),
    sla: slaFromJson(settings?.sla),
  };
});
