import type { NextRequest } from "next/server";
import { fetchTrustedAudio as fetchTrusted } from "@/lib/comms/audio-response";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves a photo or file attached to a message. The URL comes from the stored
 * message (looked up through RLS, so team members only) — never from the
 * request — and must be on GoHighLevel's own storage.
 */
const MAX_BYTES = 25 * 1024 * 1024;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/[messageId]/[index]">) {
  const { messageId, index } = await ctx.params;
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i > 19) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: message } = await supabase.from("messages").select("attachments").eq("id", messageId).maybeSingle();
  const url = Array.isArray(message?.attachments) ? message.attachments[i] : undefined;
  if (typeof url !== "string") return new Response("Not found", { status: 404 });

  const upstream = await fetchTrusted(url);
  if (!upstream) return new Response("This attachment isn't stored on GoHighLevel, so it can't be shown here.", { status: 404 });
  if (!upstream.ok) {
    void upstream.body?.cancel();
    return new Response("Couldn't load the attachment.", { status: 502 });
  }
  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    void upstream.body?.cancel();
    return new Response("Attachment too large to preview.", { status: 413 });
  }

  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  const base = type.split(";")[0].trim().toLowerCase();
  // Photos, videos and voice clips display in the chat; anything else downloads.
  const isImage = /^image\/(png|jpe?g|gif|webp|heic|heif|bmp)$/.test(base);
  const isPlayable = /^(video\/(mp4|quicktime|webm|3gpp|3gpp2)|audio\/(mpeg|mp4|x-m4a|aac|ogg|wav|x-wav|amr|3gpp))$/.test(base);
  const inline = isImage || isPlayable;
  const rawName = new URL(url).pathname.split("/").pop() || "attachment";
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    // A stray "%" in the stored link: fall back to the raw name.
  }
  const name = decoded.replace(/[^\w.\- ]/g, "_");
  const headers = new Headers({
    // Anything that isn't a plain image, video or audio is downloaded, never rendered (no HTML/SVG from outside).
    "Content-Type": inline ? base : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=86400",
  });
  if (length) headers.set("Content-Length", String(length));
  return new Response(upstream.body, { status: 200, headers });
}
