import { describe, it, expect } from "vitest";
import { maskContactId } from "./mask";

/**
 * Slice 4 — PII masking (ADR-0005 / Workflow 07). Country-agnostic: keep a small
 * prefix/suffix, mask the middle; never reveal enough to reconstruct; safe for logs.
 */
describe("maskContactId", () => {
  it("masks the middle, keeping a short prefix and suffix", () => {
    const masked = maskContactId("94714128890");
    expect(masked).not.toBe("94714128890");
    expect(masked).not.toContain("714128");
    expect(masked.startsWith("94")).toBe(true);
    expect(masked.endsWith("890")).toBe(true);
    expect(masked).toMatch(/[•]/);
  });

  it("never returns the full value and is safe to re-apply", () => {
    const once = maskContactId("12345678901");
    const twice = maskContactId(once);
    expect(once).not.toContain("345678");
    expect(twice).not.toContain("345678");
  });

  it("does not assume any country code", () => {
    const masked = maskContactId("4915123456789");
    expect(masked.startsWith("49")).toBe(true);
    expect(masked.endsWith("789")).toBe(true);
    expect(masked).not.toContain("151234");
  });

  it("fully masks short ids and handles empty/null safely", () => {
    expect(maskContactId("123")).not.toContain("123");
    expect(maskContactId("")).toBe("(none)");
    expect(maskContactId(null)).toBe("(none)");
    expect(maskContactId(undefined)).toBe("(none)");
  });
});
