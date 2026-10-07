import { describe, expect, it } from "vitest";
import { audioType, serveAudio } from "./audio-response";

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
