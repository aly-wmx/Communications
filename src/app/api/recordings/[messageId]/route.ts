import type { NextRequest } from "next/server";
import { ghlConfig } from "@/lib/comms/ghl-api";
import { secretOk } from "@/lib/comms/ghl-store";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams a voicemail or call recording from GoHighLevel to the portal's audio player.
 *
 * GHL keeps audio in one of two places: call recordings at the message's
 * /recording endpoint, and (often) voicemails as an audio attachment on the
 * message itself. Try the first, then fall back to the second.
 *
 * Signed-in team members only (the message lookup goes through RLS). The server
 * cron secret also works, with ?check=1, to report what GHL returns — status
 * codes and field names only, never audio or client details.
 */

const GHL = "https://services.leadconnectorhq.com";
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|webm|aac|amr|3gp)(\?|$)/i;

function ghlHeaders(token: string, range?: string | null): HeadersInit {
  return { Authorization: `Bearer ${token}`, Version: "2021-04-15", ...(range ? { Range: range } : {}) };
}

const isAudio = (res: Response) => {
  const type = res.headers.get("content-type") ?? "";
  return type.startsWith("audio/") || type === "application/octet-stream" || type.startsWith("video/");
};

/** Every string anywhere in the message that looks like a link to an audio file. */
function audioUrls(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value) && (AUDIO_EXT.test(value) || /recording|voicemail|audio/i.test(value))) found.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => audioUrls(v, found));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => audioUrls(v, found));
  }
  return found;
}

async function messageDetails(token: string, messageId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${GHL}/conversations/messages/${encodeURIComponent(messageId)}`, {
    headers: ghlHeaders(token),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  return (body.message as Record<string, unknown>) ?? body;
}

function stream(upstream: Response): Response {
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type")?.startsWith("audio/")
      ? upstream.headers.get("content-type")!
      : "audio/mpeg",
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
  });
  for (const h of ["content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/recordings/[messageId]">) {
  const { messageId } = await ctx.params;
  const viaSecret = secretOk(req, ["x-sync-secret"]);
  const check = viaSecret && req.nextUrl.searchParams.get("check") === "1";

  if (!viaSecret) {
    const supabase = await createClient();
    const { data: message } = await supabase.from("messages").select("id").eq("id", messageId).maybeSingle();
    if (!message) return new Response("Not found", { status: 404 });
  }

  const { token, locationId, missing } = ghlConfig();
  if (missing.length) return new Response("Recordings need the GoHighLevel connection set up.", { status: 503 });
  const range = req.headers.get("range");

  // 1) The call-recording endpoint.
  const recording = await fetch(
    `${GHL}/conversations/messages/${encodeURIComponent(messageId)}/locations/${encodeURIComponent(locationId)}/recording`,
    { headers: ghlHeaders(token, check ? null : range), cache: "no-store" },
  );
  const recordingOk = (recording.ok || recording.status === 206) && isAudio(recording);

  if (check) {
    const details = await messageDetails(token, messageId);
    const urls = details ? audioUrls(details) : [];
    void recording.body?.cancel();
    return Response.json({
      recordingEndpoint: {
        status: recording.status,
        contentType: recording.headers.get("content-type"),
        length: recording.headers.get("content-length"),
      },
      messageFound: Boolean(details),
      messageFields: details ? Object.keys(details).sort() : [],
      metaKeys: details?.meta && typeof details.meta === "object" ? Object.keys(details.meta as object).sort() : [],
      audioLinksFound: urls.length,
      audioLinkHosts: [...new Set(urls.map((u) => new URL(u).host))],
    });
  }

  if (recordingOk) return stream(recording);
  void recording.body?.cancel();

  // 2) An audio attachment on the message (typical for voicemails).
  const details = await messageDetails(token, messageId);
  for (const url of details ? audioUrls(details) : []) {
    // Links on GHL's own storage are usually public; try with and without the API key.
    for (const headers of [range ? { Range: range } : undefined, ghlHeaders(token, range)]) {
      const res = await fetch(url, { headers, cache: "no-store" });
      if ((res.ok || res.status === 206) && isAudio(res)) return stream(res);
      void res.body?.cancel();
    }
  }

  return new Response("GoHighLevel has no recording for this message.", { status: 404 });
}
