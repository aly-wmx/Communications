import { describe, expect, it } from "vitest";
import { dayLabel, formatStamp, zonedDayKey } from "./format-time";

// 02:30 UTC on Oct 14 is still the evening of Oct 13 in New York.
const LATE = "2026-10-14T02:30:00Z";
const NY = "America/New_York";

describe("formatStamp", () => {
  it("prints in the business's zone, not the server's", () => {
    expect(formatStamp(LATE, NY)).toBe("Oct 13, 10:30 PM");
    expect(formatStamp(LATE, "UTC")).toBe("Oct 14, 2:30 AM");
    expect(formatStamp(LATE, NY, "time")).toBe("10:30 PM");
    expect(formatStamp(LATE, NY, "date")).toBe("Oct 13, 2026");
  });

  it("falls back to UTC for a bad zone and to empty for a bad date", () => {
    expect(formatStamp(LATE, "Not/AZone", "time")).toBe("2:30 AM");
    expect(formatStamp("not a date", NY)).toBe("");
  });
});

describe("dayLabel", () => {
  it("groups by the business's calendar day", () => {
    expect(zonedDayKey(LATE, NY)).toBe("2026-10-13");
    const now = new Date("2026-10-14T15:00:00Z");
    expect(dayLabel(LATE, NY, now)).toBe("Yesterday");
    expect(dayLabel("2026-10-14T13:00:00Z", NY, now)).toBe("Today");
    expect(dayLabel("2026-10-01T15:00:00Z", NY, now)).toBe("Thu, Oct 1");
    expect(dayLabel("2025-12-01T15:00:00Z", NY, now)).toBe("Dec 1, 2025");
  });
});
