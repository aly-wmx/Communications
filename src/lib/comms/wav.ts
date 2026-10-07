/**
 * Just enough WAV handling to make phone recordings play in every browser:
 * read the format, and convert 8-bit telephone audio (G.711 μ-law / A-law),
 * which Chrome and Safari can't play, into standard 16-bit PCM.
 */

export interface WavInfo {
  format: number; // 1 = PCM, 3 = float, 6 = A-law, 7 = μ-law
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

export function readWav(buf: Uint8Array): WavInfo | null {
  if (buf.length < 12) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let fmt: Omit<WavInfo, "dataOffset" | "dataLength"> | null = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= buf.length) {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data" && fmt) {
      // Streamed recordings sometimes leave the size as 0 or too big; trust the bytes we have.
      const available = buf.length - body;
      return { ...fmt, dataOffset: body, dataLength: size > 0 && size <= available ? size : available };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

function ulawToPcm(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const sample = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return sign ? -sample : sample;
}

function alawToPcm(a: number): number {
  a ^= 0x55;
  const sign = a & 0x80;
  const exponent = (a >> 4) & 0x07;
  const mantissa = a & 0x0f;
  const sample = exponent === 0 ? (mantissa << 4) + 8 : ((mantissa << 4) + 0x108) << (exponent - 1);
  return sign ? sample : -sample;
}

function pcmWav(samples: Int16Array, sampleRate: number, channels: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const v = new DataView(out.buffer);
  const write = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  write(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  write(36, "data");
  v.setUint32(40, dataBytes, true);
  new Int16Array(out.buffer, 44).set(samples);
  return out;
}

/** Returns a browser-playable WAV: telephone μ-law/A-law converted to 16-bit PCM, anything else untouched. */
export function playableWav(buf: Uint8Array): { bytes: Uint8Array; converted: boolean; info: WavInfo | null } {
  const info = readWav(buf);
  if (!info || (info.format !== 6 && info.format !== 7)) return { bytes: buf, converted: false, info };
  const decode = info.format === 7 ? ulawToPcm : alawToPcm;
  const samples = new Int16Array(info.dataLength);
  for (let i = 0; i < info.dataLength; i++) samples[i] = decode(buf[info.dataOffset + i]);
  return { bytes: pcmWav(samples, info.sampleRate, info.channels), converted: true, info };
}
