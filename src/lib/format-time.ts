/**
 * Dates and times in the business's time zone (Settings → business hours), in
 * one fixed locale. The server (UTC on Vercel) and the browser (the viewer's
 * zone) would otherwise print the same moment differently, and a client
 * component rendered on both would disagree with itself.
 */

export type StampStyle = "dateTime" | "date" | "time" | "full" | "day";

const OPTIONS: Record<StampStyle, Intl.DateTimeFormatOptions> = {
  /** Oct 14, 3:05 PM */
  dateTime: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  /** Oct 14, 2026 */
  date: { month: "short", day: "numeric", year: "numeric" },
  /** 3:05 PM */
  time: { hour: "numeric", minute: "2-digit" },
  /** Tue, Oct 14, 2026, 3:05 PM */
  full: { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
  /** Tue, Oct 14 */
  day: { weekday: "short", month: "short", day: "numeric" },
};

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(style: StampStyle, timeZone: string): Intl.DateTimeFormat {
  const key = `${style}|${timeZone}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", { ...OPTIONS[style], timeZone: timeZone || "UTC" });
    } catch {
      // A bad zone name in Settings shouldn't break every page.
      f = new Intl.DateTimeFormat("en-US", { ...OPTIONS[style], timeZone: "UTC" });
    }
    cache.set(key, f);
  }
  return f;
}

export function formatStamp(iso: string | Date, timeZone: string, style: StampStyle = "dateTime"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? "" : formatter(style, timeZone).format(d);
}

/** The calendar day (YYYY-MM-DD) a moment falls on in the business's zone. */
export function zonedDayKey(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** "Today", "Yesterday", or the date ("Tue, Oct 14", with the year when it isn't this year). */
export function dayLabel(iso: string, timeZone: string, now = new Date()): string {
  const day = zonedDayKey(iso, timeZone);
  if (day === zonedDayKey(now, timeZone)) return "Today";
  if (day === zonedDayKey(new Date(now.getTime() - 24 * 60 * 60_000), timeZone)) return "Yesterday";
  return day.slice(0, 4) === zonedDayKey(now, timeZone).slice(0, 4) ? formatStamp(iso, timeZone, "day") : formatStamp(iso, timeZone, "date");
}
