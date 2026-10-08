"use server";

import { revalidatePath } from "next/cache";
import { changeContact } from "@/lib/comms/contact-write";
import { getSessionMember } from "@/lib/auth";
import type { ActionResult } from "@/lib/action-result";
import { serviceDb } from "@/lib/comms/ghl-store";
import { findMentions } from "@/lib/comms/mentions";
import { dispatchPending, saveNotifications } from "@/lib/comms/notify-store";
import { createClient } from "@/lib/supabase/server";
import { noteSchema } from "@/lib/validation/notes";
import { assign, createContact } from "@/lib/comms/contacts";
import type { Json } from "@/lib/supabase/database.types";
import type { TeamMember } from "@/lib/comms/types";

/**
 * Post a team-only note on a client's conversation, or in the team channel.
 * Anyone @mentioned gets a notification (bell, Slack, email).
 */
export async function addTeamNote(input: unknown): Promise<ActionResult> {
  const me = await getSessionMember();
  if (!me) return { ok: false, error: "You're not signed in as a team member." };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };
  const { clientId, body, flagFor } = parsed.data;

  const supabase = await createClient();
  let clientName = "";
  if (clientId) {
    const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();
    if (!client) return { ok: false, error: "That client no longer exists." };
    clientName = client.name;
  }
  const { data: team } = await supabase.from("team_members").select("id, name, email, phone, escalation");
  const flagged = flagFor && clientId ? (team ?? []).find((t) => t.id === flagFor) : undefined;
  if (flagFor && clientId && !flagged) return { ok: false, error: "That teammate isn't on the team." };
  const mentions = findMentions(body, team ?? []).filter((id) => id !== me.memberId && id !== flagged?.id);

  // RLS makes sure people can only post as themselves.
  const { error } = await supabase
    .from("team_notes")
    .insert({ client_id: clientId || null, author_id: me.memberId, body, mentions, flagged_for: flagged?.id ?? null });
  if (error) return { ok: false, error: "Couldn't post the note." };

  // Flagged: the reply is now theirs — assign what's waiting, or open an item so timers and escalation apply.
  if (flagged) {
    const now = new Date();
    const { data: open } = await supabase.from("contacts").select("id").eq("client_id", clientId).eq("status", "Open");
    if (open?.length) {
      for (const row of open) {
        const saved = await changeContact(supabase, row.id, (c) =>
          c.status === "Open" ? assign(c, flagged.id, me.memberId, (team ?? []) as TeamMember[], now) : c,
        );
        if (!saved.ok) return { ok: false, error: `Note posted, but ${flagged.name} couldn't be assigned: ${saved.error}` };
      }
    } else {
      const { data: lastIn } = await supabase
        .from("messages")
        .select("channel")
        .eq("client_id", clientId)
        .eq("direction", "inbound")
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const channel = (["Call", "Missed call", "Voicemail", "Text", "Email", "Portal message"] as const).find((c) => c === lastIn?.channel) ?? "Text";
      const c = createContact(
        { clientId, channel, priority: "Normal", receivedAt: now.toISOString(), summary: body.slice(0, 300), assigneeId: flagged.id },
        me.memberId,
        now,
      );
      await supabase.from("contacts").insert({
        id: c.id,
        client_id: clientId,
        channel: c.channel,
        priority: c.priority,
        received_at: c.receivedAt,
        summary: c.summary,
        assignee_id: flagged.id,
        status: "Open",
        history: [{ at: now.toISOString(), byId: me.memberId, message: `${me.name} flagged this for ${flagged.name} to reply` }] as unknown as Json,
        source: "manual",
      });
    }
  }

  const snippet = body.length > 160 ? `${body.slice(0, 160)}…` : body;
  const planned = [
    ...(flagged && flagged.id !== me.memberId
      ? [{ recipientId: flagged.id, kind: "mention" as const, title: `${me.name} needs you to reply to ${clientName}`, body: snippet, urgent: false }]
      : []),
    ...mentions.map((recipientId) => ({
      recipientId,
      kind: "mention" as const,
      title: clientName ? `${me.name} mentioned you on ${clientName}` : `${me.name} mentioned you in Team Chat`,
      body: snippet,
      urgent: false,
    })),
  ];
  if (planned.length) {
    const sb = serviceDb();
    await saveNotifications(sb, planned, clientId ? { clientId } : { link: "/dashboard/team-chat" });
    try {
      await dispatchPending(sb, 10);
    } catch (err) {
      console.error("mention delivery will retry", err);
    }
  }

  revalidatePath(clientId ? "/dashboard/inbox" : "/dashboard/team-chat");
  if (flagged) revalidatePath("/dashboard", "layout");
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
