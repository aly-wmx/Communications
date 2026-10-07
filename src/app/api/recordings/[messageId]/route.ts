import type { NextRequest } from "next/server";
import { ghlConfig } from "@/lib/comms/ghl-api";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams a voicemail or call recording from GoHighLevel to the portal's audio player.
 * Only for signed-in team members: the message lookup below goes through RLS, so
 * anyone else gets a 404. The GHL key never leaves the server.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/recordings/[messageId]">) {
  const { messageId } = await ctx.params;

  const supabase = await createClient();
  const { data: message } = await supabase.from("messages").select("id, channel").eq("id", messageId).maybeSingle();
  if (!message) return new Response("Not found", { status: 404 });

  const { token, locationId, missing } = ghlConfig();
  if (missing.length) return new Response("Recordings need the GoHighLevel connection set up.", { status: 503 });

  const upstream = await fetch(
    `https://services.leadconnectorhq.com/conversations/messages/${encodeURIComponent(messageId)}/locations/${encodeURIComponent(locationId)}/recording`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: "2021-04-15",
        // Pass seeking through so the player's scrub bar works.
        ...(req.headers.get("range") ? { Range: req.headers.get("range")! } : {}),
      },
      cache: "no-store",
    },
  );
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(upstream.status === 404 ? "No recording for this call." : "Couldn't load the recording.", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "audio/wav",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
