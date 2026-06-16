import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  dayKey,
  fmtClock,
  fmtDateTime,
  fmtDayLabel,
  fmtFullStamp,
  fmtListStamp,
} from "./time";

/**
 * Single source of truth for human-facing time formatting. The whole dashboard must show
 * the SAME instant the SAME way: in the tenant timezone, 12-hour AM/PM. PEPPER ST. =
 * Asia/Colombo (GMT+5:30, no DST). Using an EXPLICIT timeZone makes the output depend only
 * on the instant + the fixed zone (never the host's local zone), so it is deterministic on
 * server and client — no hydration drift, no UTC workaround. `now` is injected for the
 * relative labels so these stay pure.
 */

const TZ = "Asia/Colombo";
// 11:30 local in Asia/Colombo on 2026-06-15.
const NOW = new Date("2026-06-15T06:00:00.000Z");

describe("DEFAULT_TIME_ZONE", () => {
  it("is the tenant timezone Asia/Colombo", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Asia/Colombo");
  });
});

describe("fmtClock", () => {
  it("renders WhatsApp-style 12-hour AM/PM in the tenant timezone", () => {
    // 13:30 UTC = 19:00 (+5:30) = 7:00 PM
    expect(fmtClock("2026-06-15T13:30:00.000Z", TZ)).toBe("7:00 PM");
    // 07:05 UTC = 12:35 local = 12:35 PM (noon boundary)
    expect(fmtClock("2026-06-15T07:05:00.000Z", TZ)).toBe("12:35 PM");
    // 18:30 UTC = 00:00 local (next day) = 12:00 AM (midnight boundary)
    expect(fmtClock("2026-06-15T18:30:00.000Z", TZ)).toBe("12:00 AM");
    // 00:00 UTC = 05:30 local = 5:30 AM
    expect(fmtClock("2026-06-15T00:00:00.000Z", TZ)).toBe("5:30 AM");
  });

  it("honors the timeZone argument (not the host zone, not hardcoded UTC)", () => {
    const iso = "2026-06-15T13:30:00.000Z";
    expect(fmtClock(iso, "UTC")).toBe("1:30 PM");
    expect(fmtClock(iso, TZ)).toBe("7:00 PM");
  });

  it("returns empty string for null/invalid", () => {
    expect(fmtClock(null, TZ)).toBe("");
    expect(fmtClock("not-a-date", TZ)).toBe("");
  });
});

describe("fmtDateTime", () => {
  it("renders an absolute date + 12-hour AM/PM time in the tenant timezone", () => {
    expect(fmtDateTime("2026-06-15T13:30:00.000Z", TZ)).toBe("Jun 15, 7:00 PM");
  });

  it("returns the em-dash sentinel for null/invalid", () => {
    expect(fmtDateTime(null, TZ)).toBe("\u2014");
    expect(fmtDateTime("not-a-date", TZ)).toBe("\u2014");
  });
});

describe("fmtFullStamp", () => {
  it("renders the chat header 'last seen' stamp in the tenant timezone", () => {
    expect(fmtFullStamp("2026-06-15T13:30:00.000Z", TZ)).toBe("15 Jun 2026, 7:00 PM");
  });

  it("returns 'Unknown' for null/invalid", () => {
    expect(fmtFullStamp(null, TZ)).toBe("Unknown");
    expect(fmtFullStamp("nope", TZ)).toBe("Unknown");
  });
});

describe("cross-surface consistency", () => {
  it("Chat Monitor (fmtClock) and Dashboard (fmtDateTime) agree on the clock for one instant", () => {
    const iso = "2026-06-15T13:30:00.000Z";
    const clock = fmtClock(iso, TZ); // "7:00 PM"
    expect(fmtDateTime(iso, TZ).endsWith(clock)).toBe(true);
    expect(fmtFullStamp(iso, TZ).endsWith(clock)).toBe(true);
  });
});

describe("dayKey", () => {
  it("maps an instant to the local calendar day in the given zone", () => {
    // 18:30Z = 00:00 next local day in +5:30
    expect(dayKey("2026-06-15T18:30:00.000Z", TZ)).toBe("2026-06-16");
    expect(dayKey("2026-06-15T18:30:00.000Z", "UTC")).toBe("2026-06-15");
    expect(dayKey(new Date("2026-06-15T13:30:00.000Z"), TZ)).toBe("2026-06-15");
  });

  it("returns empty string for null/invalid", () => {
    expect(dayKey(null, TZ)).toBe("");
  });
});

describe("fmtDayLabel", () => {
  it("returns Today / Yesterday / long date in the tenant timezone", () => {
    expect(fmtDayLabel("2026-06-15T07:00:00.000Z", TZ, NOW)).toBe("Today");
    expect(fmtDayLabel("2026-06-14T07:00:00.000Z", TZ, NOW)).toBe("Yesterday");
    expect(fmtDayLabel("2026-06-10T07:00:00.000Z", TZ, NOW)).toBe("10 June 2026");
  });

  it("returns empty string for null", () => {
    expect(fmtDayLabel(null, TZ, NOW)).toBe("");
  });
});

describe("fmtListStamp", () => {
  it("shows clock today, 'Yesterday', short date this year, else m/d/yy", () => {
    expect(fmtListStamp("2026-06-15T07:00:00.000Z", TZ, NOW)).toBe("12:30 PM"); // today
    expect(fmtListStamp("2026-06-14T07:00:00.000Z", TZ, NOW)).toBe("Yesterday");
    expect(fmtListStamp("2026-06-10T07:00:00.000Z", TZ, NOW)).toBe("10 Jun"); // same year
    expect(fmtListStamp("2025-12-31T07:00:00.000Z", TZ, NOW)).toBe("12/31/25"); // prior year
  });

  it("returns empty string for null", () => {
    expect(fmtListStamp(null, TZ, NOW)).toBe("");
  });
});
