import { describe, it, expect } from "vitest";
import {
  parseAnalyticsQuery,
  buildRangeQuery,
  isCustomRangeValid,
  DEFAULT_RANGE_KEY,
} from "./query";

/**
 * Slice 12C (ADR-0013) — pure validation of the ONLY safe client filter inputs
 * (`range`/`from`/`to`). Tenant/channel are resolved server-side and must never be
 * accepted from the client. No DB; no DOM.
 */

const sp = (s: string) => new URLSearchParams(s);

describe("parseAnalyticsQuery — range validation", () => {
  it("defaults to the default range when none is provided (initial load)", () => {
    expect(parseAnalyticsQuery(sp(""))).toEqual({
      ok: true,
      value: { key: DEFAULT_RANGE_KEY, customFrom: null, customTo: null },
    });
  });

  it("accepts each standard range key", () => {
    for (const key of ["today", "3d", "7d", "14d", "30d", "this_month"]) {
      const r = parseAnalyticsQuery(sp(`range=${key}`));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.key).toBe(key);
    }
  });

  it("rejects an unknown range with a safe error (never throws)", () => {
    const r = parseAnalyticsQuery(sp("range=__nope__"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/range/i);
  });
});

describe("parseAnalyticsQuery — custom range", () => {
  it("accepts a valid custom range (from <= to)", () => {
    expect(parseAnalyticsQuery(sp("range=custom&from=2026-06-01&to=2026-06-10"))).toEqual({
      ok: true,
      value: { key: "custom", customFrom: "2026-06-01", customTo: "2026-06-10" },
    });
  });

  it("rejects custom with missing date(s)", () => {
    expect(parseAnalyticsQuery(sp("range=custom")).ok).toBe(false);
    expect(parseAnalyticsQuery(sp("range=custom&from=2026-06-01")).ok).toBe(false);
  });

  it("rejects custom when from > to", () => {
    expect(parseAnalyticsQuery(sp("range=custom&from=2026-06-10&to=2026-06-01")).ok).toBe(false);
  });

  it("rejects malformed custom dates", () => {
    expect(parseAnalyticsQuery(sp("range=custom&from=06/01/2026&to=06/10/2026")).ok).toBe(false);
  });
});

describe("parseAnalyticsQuery — ignores client-supplied tenant/channel", () => {
  it("never reads tenant_id/channel_id (output identical with or without them)", () => {
    const withIds = parseAnalyticsQuery(sp("range=7d&tenant_id=hacker&channel_id=evil"));
    const without = parseAnalyticsQuery(sp("range=7d"));
    expect(withIds).toEqual(without);
    if (withIds.ok) expect(JSON.stringify(withIds.value)).not.toMatch(/hacker|evil|tenant_id|channel_id/);
  });
});

describe("isCustomRangeValid (shared client+route guard)", () => {
  it("accepts two real YYYY-MM-DD dates with from <= to (incl. equal)", () => {
    expect(isCustomRangeValid("2026-06-01", "2026-06-10")).toBe(true);
    expect(isCustomRangeValid("2026-06-05", "2026-06-05")).toBe(true);
  });

  it("rejects missing / incomplete dates so no confusing request fires", () => {
    expect(isCustomRangeValid("", "2026-06-10")).toBe(false);
    expect(isCustomRangeValid("2026-06-01", "")).toBe(false);
    expect(isCustomRangeValid(null, null)).toBe(false);
    expect(isCustomRangeValid(undefined, undefined)).toBe(false);
  });

  it("rejects malformed dates", () => {
    expect(isCustomRangeValid("06/01/2026", "06/10/2026")).toBe(false);
    expect(isCustomRangeValid("2026-6-1", "2026-6-2")).toBe(false);
  });

  it("rejects from > to", () => {
    expect(isCustomRangeValid("2026-06-10", "2026-06-01")).toBe(false);
  });
});

describe("buildRangeQuery", () => {
  it("emits only range for standard keys", () => {
    expect(buildRangeQuery({ key: "7d" })).toBe("range=7d");
  });
  it("includes from/to for a valid custom range", () => {
    expect(
      buildRangeQuery({ key: "custom", customFrom: "2026-06-01", customTo: "2026-06-10" })
    ).toBe("range=custom&from=2026-06-01&to=2026-06-10");
  });
  it("omits from/to when custom dates are missing", () => {
    expect(buildRangeQuery({ key: "custom" })).toBe("range=custom");
  });
});
