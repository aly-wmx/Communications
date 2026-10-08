import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { contactFromRow, contactPatch } from "./rows";
import type { ClientContact } from "./types";

/**
 * Apply a change to a contact based on what it holds right now, and save it
 * only if nobody else changed it in between (re-reading and retrying if they
 * did). Stops two people, or a person and the sync, overwriting each other's
 * history. `change` returns the same object to mean "nothing to do".
 */
export async function changeContact(
  db: SupabaseClient<Database>,
  contactId: string,
  change: (c: ClientContact) => ClientContact,
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: readError } = await db.from("contacts").select("*").eq("id", contactId).maybeSingle();
    if (readError || !row) return { ok: false, error: "That item no longer exists." };
    const current = contactFromRow(row);
    const next = change(current);
    if (next === current) return { ok: true, changed: false };
    const { data: saved, error } = await db.from("contacts").update(contactPatch(next)).eq("id", contactId).eq("updated_at", row.updated_at).select("id");
    if (error) return { ok: false, error: "Couldn't save the change to this item." };
    if (saved?.length) return { ok: true, changed: true };
  }
  return { ok: false, error: "This item kept changing while saving. Refresh and try again." };
}
