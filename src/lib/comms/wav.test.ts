import { describe, expect, it } from "vitest";
import { playableWav, readWav } from "./wav";

function wav(format: number, bits: number, data: number[]): Uint8Array {
  const out = new Uint8Array(44 + data.length);
  const v = new DataView(out.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + data.length, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, format, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000 * (bits / 8), true); v.setUint16(32, bits / 8, true); v.setUint16(34, bits, true);
  w(36, "data"); v.setUint32(40, data.length, true);
  out.set(data, 44);
  return out;
}

describe("wav", () => {
  it("reads the format", () => {
    expect(readWav(wav(7, 8, [0xff, 0x00]))).toMatchObject({ format: 7, channels: 1, sampleRate: 8000, bitsPerSample: 8, dataLength: 2 });
    expect(readWav(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("converts μ-law to 16-bit PCM", () => {
    const { bytes, converted, info } = playableWav(wav(7, 8, [0xff, 0x7f, 0x00, 0x80]));
    expect(converted).toBe(true);
    expect(info?.format).toBe(7);
    const out = readWav(bytes)!;
    expect(out).toMatchObject({ format: 1, bitsPerSample: 16, dataLength: 8 });
    const samples = new Int16Array(bytes.buffer, 44, 4);
    expect(samples[0]).toBe(0); // μ-law 0xFF is silence
    expect(samples[1]).toBe(0);
    expect(samples[2]).toBe(-32124); // loudest negative
    expect(samples[3]).toBe(32124); // loudest positive
  });

  it("leaves PCM alone", () => {
    const pcm = wav(1, 16, [0, 0, 1, 0]);
    expect(playableWav(pcm)).toMatchObject({ converted: false, bytes: pcm });
  });
});
