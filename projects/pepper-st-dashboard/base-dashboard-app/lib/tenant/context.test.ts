import { describe, it, expect, afterEach, vi } from "vitest";
import { getCurrentTenantSlug, DEFAULT_TENANT_SLUG } from "./context";

/**
 * Slice 3 tenant-resolver unit tests (no database). Only the pure slug resolver
 * is tested here; the DB-backed resolveCurrentTenant is exercised by db:verify.
 */

describe("getCurrentTenantSlug", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to pepper-st when DEMO_TENANT_SLUG is unset/empty", () => {
    vi.stubEnv("DEMO_TENANT_SLUG", "");
    expect(getCurrentTenantSlug()).toBe(DEFAULT_TENANT_SLUG);
    expect(getCurrentTenantSlug()).toBe("pepper-st");
  });

  it("respects a DEMO_TENANT_SLUG override (trimmed)", () => {
    vi.stubEnv("DEMO_TENANT_SLUG", "  acme-co  ");
    expect(getCurrentTenantSlug()).toBe("acme-co");
  });
});
