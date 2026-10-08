"use server";

import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { serviceDb } from "@/lib/comms/ghl-store";
import { findMentions } from "@/lib/comms/mentions";
import { dispatchPending, saveNotifications } from "@/lib/comms/notify-store";
import { createClient } from "@/lib/supabase/server";
import { noteSchema } from "@/lib/validation/notes";

/**
 * Post a team-only note on a client's conversation, or in the team channel.
 * Anyone @mentioned gets a notification (bell, Slack, email).
 */
export async function addTeamNote(input: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };
  const { clientId, body } = parsed.data;

  const supabase = await createClient();
  let clientName = "";
  if (clientId) {
    const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
    if (!client) return { ok: false, error: "That client no longer exists." };
    clientName = client.name;
  }
  const { data: team } = await supabase.from("team_members").select("id, name");
  const mentions = findMentions(body, team ?? []).filter((id) => id !== me.memberId);

  // RLS makes sure people can only post as themselves.
  const { error } = await supabase.from("team_notes").insert({ client_id: clientId || null, author_id: me.memberId, body, mentions });
  if (error) return { ok: false, error: "Couldn't post the note." };

  if (mentions.length) {
    const sb = serviceDb();
    const snippet = body.length > 160 ? `${body.slice(0, 160)}…` : body;
    await saveNotifications(
      sb,
      mentions.map((recipientId) => ({
        recipientId,
        kind: "mention" as const,
        title: clientName ? `${me.name} mentioned you on ${clientName}` : `${me.name} mentioned you in Team Chat`,
        body: snippet,
        urgent: false,
      })),
      clientId ? { clientId } : { link: "/dashboard/team-chat" },
    );
    try {
      await dispatchPending(sb, 10);
    } catch (err) {
      console.error("mention delivery will retry", err);
    }
  }

  revalidatePath(clientId ? "/dashboard/inbox" : "/dashboard/team-chat");
  if (clientId) revalidatePath(`/dashboard/clients/${clientId}`);
  return { ok: true };
}

export async function deleteTeamNote(id: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Invalid note." };
  const supabase = await createClient();
  // RLS: your own notes, or any note if you're an admin.
  const { data, error } = await supabase.from("team_notes").delete().eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, error: "You can only delete your own notes." };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
