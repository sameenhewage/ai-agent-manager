import { describe, it, expect } from "vitest";
import {
  resolveRange,
  tzDayKey,
  RANGE_OPTIONS,
  parseRangeParams,
  clampToRetention,
} from "./ranges";

/**
 * Ranges are computed in the TENANT timezone (Workflow 05). PEPPER ST. = Asia/Colombo
 * (GMT+5:30, no DST), so local midnight is 18:30 UTC the previous day. `to` is the live
 * "now" for non-custom ranges. All assertions use injected `now`/`timeZone` for determinism.
 */

const NOW = new Date("2026-06-15T06:00:00.000Z"); // 11:30 local in Asia/Colombo
const TZ = "Asia/Colombo";

describe("tzDayKey", () => {
  it("maps an instant to the local calendar day in the tenant timezone", () => {
    // 18:30Z = 00:00 next day in +5:30
    expect(tzDayKey(new Date("2026-06-15T18:30:00.000Z"), TZ)).toBe("2026-06-16");
    expect(tzDayKey(new Date("2026-06-15T18:30:00.000Z"), "UTC")).toBe("2026-06-15");
  });
});

describe("resolveRange", () => {
  it("today: [local midnight, now)", () => {
    const r = resolveRange("today", { now: NOW, timeZone: TZ });
    expect(r.from.toISOString()).toBe("2026-06-14T18:30:00.000Z");
    expect(r.to.toISOString()).toBe(NOW.toISOString());
  });

  it("7d: starts 6 local days before today's midnight", () => {
    const r = resolveRange("7d", { now: NOW, timeZone: TZ });
    expect(r.from.toISOString()).toBe("2026-06-08T18:30:00.000Z");
    expect(r.to.toISOString()).toBe(NOW.toISOString());
  });

  it("this_month: first of the local month at local midnight", () => {
    const r = resolveRange("this_month", { now: NOW, timeZone: TZ });
    expect(r.from.toISOString()).toBe("2026-05-31T18:30:00.000Z");
  });

  it("custom: [from local midnight, to+1 local day) — inclusive of the whole to-day", () => {
    const r = resolveRange("custom", {
      now: NOW,
      timeZone: TZ,
      customFrom: "2026-06-01",
      customTo: "2026-06-03",
    });
    expect(r.from.toISOString()).toBe("2026-05-31T18:30:00.000Z");
    expect(r.to.toISOString()).toBe("2026-06-03T18:30:00.000Z");
  });

  it("respects a different timezone (UTC midnight)", () => {
    const r = resolveRange("today", { now: NOW, timeZone: "UTC" });
    expect(r.from.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("exposes selectable range options", () => {
    const keys = RANGE_OPTIONS.map((o) => o.key);
    expect(keys).toContain("today");
    expect(keys).toContain("30d");
    expect(keys).toContain("custom");
  });
});

describe("parseRangeParams", () => {
  it("accepts a known range key", () => {
    expect(parseRangeParams({ range: "30d" })).toEqual({
      key: "30d",
      customFrom: null,
      customTo: null,
    });
  });

  it("falls back to the default for unknown/missing keys", () => {
    expect(parseRangeParams({ range: "bogus" }).key).toBe("7d");
    expect(parseRangeParams({}).key).toBe("7d");
  });

  it("accepts a valid custom range (from <= to)", () => {
    expect(parseRangeParams({ range: "custom", from: "2026-06-01", to: "2026-06-03" })).toEqual({
      key: "custom",
      customFrom: "2026-06-01",
      customTo: "2026-06-03",
    });
  });

  it("rejects inverted or malformed custom dates (falls back to default)", () => {
    expect(parseRangeParams({ range: "custom", from: "2026-06-09", to: "2026-06-01" }).key).toBe(
      "7d"
    );
    expect(parseRangeParams({ range: "custom", from: "nope", to: "2026-06-01" }).key).toBe("7d");
    expect(parseRangeParams({ range: "custom" }).key).toBe("7d");
  });

  it("handles array-valued params (Next.js searchParams)", () => {
    expect(parseRangeParams({ range: ["14d"] }).key).toBe("14d");
  });
});

describe("clampToRetention", () => {
  const NOW2 = new Date("2026-06-15T00:00:00.000Z");

  it("does not clamp when retention is null (unlimited)", () => {
    const from = new Date("2020-01-01T00:00:00.000Z");
    expect(clampToRetention(from, NOW2, null)).toEqual({
      from,
      clamped: false,
      requestedFrom: null,
    });
  });

  it("clamps the lower bound when the request is older than the window", () => {
    const from = new Date("2026-05-01T00:00:00.000Z"); // 45 days before now
    const r = clampToRetention(from, NOW2, 30);
    expect(r.clamped).toBe(true);
    expect(r.requestedFrom).toEqual(from);
    expect(r.from.toISOString()).toBe("2026-05-16T00:00:00.000Z"); // now - 30d
  });

  it("does not clamp when the request is within the window", () => {
    const from = new Date("2026-06-10T00:00:00.000Z");
    const r = clampToRetention(from, NOW2, 30);
    expect(r.clamped).toBe(false);
    expect(r.from).toEqual(from);
    expect(r.requestedFrom).toBeNull();
  });
});
