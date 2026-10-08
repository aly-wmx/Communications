/** One colour per channel, used everywhere (queue, chat, lists, call log) so channels are easy to scan. */

export interface ChannelStyle {
  label: string;
  icon: string;
  /** Small tag: background + text. */
  tag: string;
  /** Solid dot / left border colour. */
  dot: string;
  border: string;
}

export const CHANNEL_STYLES: Record<string, ChannelStyle> = {
  Text: { label: "Text", icon: "💬", tag: "bg-sky-50 text-sky-800", dot: "bg-sky-500", border: "border-sky-400" },
  Email: { label: "Email", icon: "✉", tag: "bg-violet-50 text-violet-800", dot: "bg-violet-500", border: "border-violet-400" },
  "Portal message": { label: "Portal", icon: "🗨", tag: "bg-teal-50 text-teal-800", dot: "bg-teal-500", border: "border-teal-400" },
  Call: { label: "Call", icon: "📞", tag: "bg-zinc-100 text-zinc-700", dot: "bg-zinc-500", border: "border-zinc-400" },
  "Missed call": { label: "Missed call", icon: "📞", tag: "bg-red-50 text-red-700", dot: "bg-red-500", border: "border-red-400" },
  Voicemail: { label: "Voicemail", icon: "📼", tag: "bg-amber-50 text-amber-800", dot: "bg-amber-500", border: "border-amber-400" },
};

export function channelStyle(channel: string): ChannelStyle {
  return CHANNEL_STYLES[channel] ?? CHANNEL_STYLES.Text;
}

// ---------- Calls ----------

export type CallOutcome = "connected" | "missed" | "voicemail" | "failed";

export const CALL_OUTCOMES: Record<CallOutcome, { label: string; tag: string }> = {
  connected: { label: "Connected", tag: "bg-emerald-50 text-emerald-800" },
  missed: { label: "Missed", tag: "bg-red-50 text-red-700" },
  voicemail: { label: "Voicemail", tag: "bg-amber-50 text-amber-800" },
  failed: { label: "Failed", tag: "bg-zinc-100 text-zinc-700" },
};

/**
 * What happened on a call, from GHL's call status. Incoming calls nobody
 * answered are "missed"; outgoing calls that didn't connect are "failed".
 */
export function callOutcome(direction: string, channel: string, callStatus: string): CallOutcome {
  const s = callStatus.toLowerCase();
  if (channel === "Voicemail" || s.includes("voicemail")) return "voicemail";
  if (/^(completed|answered|in-progress)$/.test(s)) return "connected";
  if (direction === "inbound" && (channel === "Missed call" || /no-?answer|missed|busy|cancel/.test(s))) return "missed";
  if (/no-?answer|busy|fail|cancel/.test(s)) return "failed";
  return channel === "Missed call" ? "missed" : s ? "failed" : "connected";
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

// ---------- Attachments ----------

export interface Attachment {
  url: string;
  isImage: boolean;
  name: string;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp)(\?|#|$)/i;

/** GHL lists attachments as URLs (sometimes objects with a url). */
export function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (typeof a === "string" ? a : a && typeof a === "object" && typeof (a as { url?: unknown }).url === "string" ? (a as { url: string }).url : ""))
    .filter((u) => /^https:\/\//.test(u))
    .slice(0, 20)
    .map((url) => {
      const path = (() => {
        try {
          return decodeURIComponent(new URL(url).pathname);
        } catch {
          return url;
        }
      })();
      return { url, isImage: IMAGE_EXT.test(path), name: path.split("/").pop() || "attachment" };
    });
}

// ---------- CSV export ----------

/** CSV that opens safely in Excel/Sheets: quoted, and cells starting with = + - @ can't run as formulas. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
