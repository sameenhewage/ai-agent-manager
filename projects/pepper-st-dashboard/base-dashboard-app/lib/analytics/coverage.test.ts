import { describe, it, expect } from "vitest";
import {
  computeUniverseCoverage,
  maskSessionRef,
  REASON_UNSYNCED,
  REASON_ARCHIVED,
} from "./coverage";

/**
 * Business-Truth TDD Gate (CONTEXT.md §7). The analytics universe is the ACTIVE mapped
 * `app_conversations`; valid live `ai.agno_sessions` that are NOT mapped must be reported
 * as explicit exclusions (with reasons), never silently dropped. These are the
 * source-of-truth parity assertions — fixture-based (live data drifts), PII-safe.
 *
 * Reproduces the real mismatch: 6 valid PEPPER ST sessions today, only 4 mapped → the
 * system must surface the 2 excluded sessions, not pretend the universe is 4.
 */
describe("computeUniverseCoverage — business-truth universe reconciliation", () => {
  it("reports the 2 valid live sessions that are NOT in the active mapped universe", () => {
    const cov = computeUniverseCoverage({
      liveValidSessionIds: ["s1", "s2", "s3", "s4", "u5", "u6"], // 6 valid live today
      activeMappedSessionIds: ["s1", "s2", "s3", "s4"], // only 4 mapped/counted
    });
    expect(cov.liveValid).toBe(6);
    expect(cov.mapped).toBe(4);
    expect(cov.excludedCount).toBe(2);
    expect(cov.complete).toBe(false);
    expect(cov.excluded.map((e) => e.reason)).toEqual([REASON_UNSYNCED, REASON_UNSYNCED]);
  });

  it("is COMPLETE (nothing hidden) only when every valid live session is mapped", () => {
    const cov = computeUniverseCoverage({
      liveValidSessionIds: ["s1", "s2"],
      activeMappedSessionIds: ["s2", "s1"],
    });
    expect(cov).toMatchObject({ liveValid: 2, mapped: 2, excludedCount: 0, complete: true });
    expect(cov.excluded).toEqual([]);
  });

  it("labels an archived exclusion distinctly from an unsynced one", () => {
    const cov = computeUniverseCoverage({
      liveValidSessionIds: ["mapped1", "arch1", "unsynced1"],
      activeMappedSessionIds: ["mapped1"],
      archivedSessionIds: ["arch1"],
    });
    const byReason = cov.excluded.reduce<Record<string, number>>((acc, e) => {
      acc[e.reason] = (acc[e.reason] ?? 0) + 1;
      return acc;
    }, {});
    expect(byReason[REASON_ARCHIVED]).toBe(1);
    expect(byReason[REASON_UNSYNCED]).toBe(1);
  });

  it("NEVER exposes a raw agno session_id — excluded refs are masked", () => {
    const raw = "6c6bb8bb-1111-2222-3333-444455556666";
    const cov = computeUniverseCoverage({ liveValidSessionIds: [raw], activeMappedSessionIds: [] });
    expect(cov.excluded[0].ref).not.toContain(raw);
    expect(cov.excluded[0].ref).not.toContain("6c6bb8bb-1111");
    expect(JSON.stringify(cov)).not.toContain(raw);
  });

  it("de-duplicates live session ids (counts distinct sessions only)", () => {
    const cov = computeUniverseCoverage({
      liveValidSessionIds: ["s1", "s1", "s2"],
      activeMappedSessionIds: ["s1"],
    });
    expect(cov.liveValid).toBe(2);
    expect(cov.excludedCount).toBe(1);
  });
});

describe("maskSessionRef", () => {
  it("returns a short, non-reversible reference (never the raw id)", () => {
    expect(maskSessionRef("6c6bb8bbffffffff")).toBe("sess_••••ffff");
    expect(maskSessionRef("abc")).toBe("sess_••••");
  });
});
