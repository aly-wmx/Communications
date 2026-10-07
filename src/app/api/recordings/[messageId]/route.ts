import type { NextRequest } from "next/server";
import { ghlConfig } from "@/lib/comms/ghl-api";
import { secretOk } from "@/lib/comms/ghl-store";
import { createClient } from "@/lib/supabase/server";
import { playableWav } from "@/lib/comms/wav";
import { audioType as contentType, serveAudio as serve } from "@/lib/comms/audio-response";

/**
 * Streams a voicemail or call recording from GoHighLevel to the portal's audio player.
 *
 * GHL keeps audio in one of two places: call recordings at the message's
 * /recording endpoint, and (often) voicemails as an audio attachment on the
 * message itself. Try the first, then fall back to the second.
 *
 * The audio is downloaded in full, converted if it's telephone-format WAV
 * (which Chrome and Safari can't play), and served with a size and byte-range
 * support so every browser can play and seek it.
 *
 * Signed-in team members only (the message lookup goes through RLS). The server
 * cron secret also works, with ?check=1, to report what GHL returns — status
 * codes and field names only, never audio or client details.
 */

const GHL = "https://services.leadconnectorhq.com";
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|webm|aac|amr|3gp)(\?|$)/i;

function ghlHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Version: "2021-04-15" };
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

const MAX_BYTES = 30 * 1024 * 1024;

/** Download the whole recording (voicemails are small) so we can fix the format and answer range requests. */
async function download(res: Response): Promise<Uint8Array | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf.length > 0 && buf.length <= MAX_BYTES ? buf : null;
}

async function playable(res: Response, range: string | null): Promise<Response | null> {
  const raw = await download(res);
  if (!raw) return null;
  const type = contentType(raw, res.headers.get("content-type"));
  if (type !== "audio/wav") return serve(raw, type, range);
  return serve(playableWav(raw).bytes, "audio/wav", range);
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
    { headers: ghlHeaders(token), cache: "no-store" },
  );
  const recordingOk = (recording.ok || recording.status === 206) && isAudio(recording);

  if (check) {
    const details = await messageDetails(token, messageId);
    const urls = details ? audioUrls(details) : [];
    const raw = recordingOk ? await download(recording) : null;
    if (!raw) void recording.body?.cancel();
    const fixed = raw ? playableWav(raw) : null;
    return Response.json({
      recordingEndpoint: {
        status: recording.status,
        contentType: recording.headers.get("content-type"),
        length: recording.headers.get("content-length"),
        bytes: raw?.length ?? null,
        detectedType: raw ? contentType(raw, recording.headers.get("content-type")) : null,
        wav: fixed?.info
          ? { format: fixed.info.format, channels: fixed.info.channels, sampleRate: fixed.info.sampleRate, bitsPerSample: fixed.info.bitsPerSample }
          : null,
        convertedForBrowsers: fixed?.converted ?? false,
      },
      messageFound: Boolean(details),
      messageFields: details ? Object.keys(details).sort() : [],
      metaKeys: details?.meta && typeof details.meta === "object" ? Object.keys(details.meta as object).sort() : [],
      audioLinksFound: urls.length,
      audioLinkHosts: [...new Set(urls.map((u) => new URL(u).host))],
    });
  }

  if (recordingOk) {
    const res = await playable(recording, range);
    if (res) return res;
  } else {
    void recording.body?.cancel();
  }

  // 2) An audio attachment on the message (typical for voicemails).
  const details = await messageDetails(token, messageId);
  for (const url of details ? audioUrls(details) : []) {
    // Links on GHL's own storage are usually public; try with and without the API key.
    for (const headers of [undefined, ghlHeaders(token)]) {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (res.ok && isAudio(res)) {
        const out = await playable(res, range);
        if (out) return out;
      } else {
        void res.body?.cancel();
      }
    }
  }

  return new Response("GoHighLevel has no recording for this message.", { status: 404 });
}
