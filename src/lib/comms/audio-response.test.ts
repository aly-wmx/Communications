import { describe, expect, it } from "vitest";
import { audioType, fetchTrustedAudio, isTrustedAudioUrl, serveAudio } from "./audio-response";

const bytes = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));

describe("serveAudio", () => {
  it("serves the whole file with its size", async () => {
    const res = serveAudio(bytes, "audio/wav", null);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
  });

  it("answers Safari's first probe and seeks", async () => {
    const probe = serveAudio(bytes, "audio/wav", "bytes=0-1");
    expect(probe.status).toBe(206);
    expect(probe.headers.get("content-range")).toBe("bytes 0-1/100");
    expect([...new Uint8Array(await probe.arrayBuffer())]).toEqual([0, 1]);

    const tail = serveAudio(bytes, "audio/wav", "bytes=90-");
    expect(tail.headers.get("content-range")).toBe("bytes 90-99/100");
    const suffix = serveAudio(bytes, "audio/wav", "bytes=-5");
    expect(suffix.headers.get("content-range")).toBe("bytes 95-99/100");
  });

  it("rejects ranges past the end", () => {
    expect(serveAudio(bytes, "audio/wav", "bytes=200-").status).toBe(416);
  });
});

describe("audioType", () => {
  it("detects the format from the file itself", () => {
    expect(audioType(new TextEncoder().encode("RIFF...."), "audio/x-wav")).toBe("audio/wav");
    expect(audioType(new TextEncoder().encode("ID3...."), null)).toBe("audio/mpeg");
    expect(audioType(new TextEncoder().encode("OggS...."), null)).toBe("audio/ogg");
  });
});

describe("trusted audio URLs", () => {
  it("accepts HTTPS media URLs from GoHighLevel storage hosts only", () => {
    expect(isTrustedAudioUrl("https://storage.googleapis.com/msgsndr/recording.wav")).toBe(true);
    expect(isTrustedAudioUrl("https://files.msgsndr.com/recording.wav")).toBe(true);
    expect(isTrustedAudioUrl("http://storage.googleapis.com/recording.wav")).toBe(false);
    expect(isTrustedAudioUrl("https://attacker.example/recording.wav")).toBe(false);
    expect(isTrustedAudioUrl("https://storage.googleapis.com.attacker.example/recording.wav")).toBe(false);
    expect(isTrustedAudioUrl("https://user@storage.googleapis.com/recording.wav")).toBe(false);
  });

  it("checks every redirect and never supplies authorization headers", async () => {
    const requests: RequestInit[] = [];
    const response = await fetchTrustedAudio("https://storage.googleapis.com/start.wav", async (_url, init) => {
      requests.push(init ?? {});
      if (requests.length === 1) {
        return new Response(null, { status: 302, headers: { location: "https://files.msgsndr.com/final.wav" } });
      }
      return new Response("audio", { headers: { "content-type": "audio/mpeg" } });
    });

    expect(response?.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[0].redirect).toBe("manual");
    expect(requests[0].headers).toBeUndefined();
  });

  it("stops redirects to untrusted hosts", async () => {
    let calls = 0;
    const response = await fetchTrustedAudio("https://storage.googleapis.com/start.wav", async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    });

    expect(response).toBeNull();
    expect(calls).toBe(1);
  });
});
