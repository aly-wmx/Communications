/** Building audio responses the browser can play and seek. */

const AUDIO_HOSTS = ["storage.googleapis.com", "msgsndr.com", "leadconnectorhq.com", "leadconnector.com"];

export function isTrustedAudioUrl(value: string | URL): boolean {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (!url.port || url.port === "443") &&
    AUDIO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  );
}

export async function fetchTrustedAudio(value: string, fetcher: typeof fetch = fetch): Promise<Response | null> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isTrustedAudioUrl(url)) return null;
    const response = await fetcher(url, { cache: "no-store", redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get("location");
    void response.body?.cancel();
    if (!location || redirects === 3) return null;
    try {
      url = new URL(location, url);
    } catch {
      return null;
    }
  }

  return null;
}

export function audioType(bytes: Uint8Array, upstreamType: string | null): string {
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  if (tag === "RIFF") return "audio/wav";
  if (tag === "OggS") return "audio/ogg";
  if (tag.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return upstreamType?.startsWith("audio/") ? upstreamType : "audio/mpeg";
}

/** Serve bytes as audio, honouring "Range: bytes=start-end" so the player can seek. */
export function serveAudio(bytes: Uint8Array, type: string, range: string | null): Response {
  const total = bytes.length;
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    let end = m[1] && m[2] ? Number(m[2]) : total - 1;
    end = Math.min(end, total - 1);
    start = Math.max(0, start);
    if (start > end || start >= total) {
      return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
    }
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(bytes.slice(), { status: 200, headers: { ...base, "Content-Length": String(total) } });
}

