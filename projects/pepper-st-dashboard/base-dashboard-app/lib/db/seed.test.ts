import { describe, it, expect } from "vitest";
import { buildSeedPayload, PEPPER_ST_SEED } from "./seed";

/**
 * Slice 3 seed-payload unit tests (no database). Verifies the seed shape matches
 * the approved decisions: PEPPER ST. tenant, WhatsApp channel (v2 agent_id is
 * derived, not stored), and an explicit enterprise/unlimited entitlement — with
 * no phone-number assumptions.
 */

const ALLOWED_STATUS = ["active", "suspended", "archived"];
const ALLOWED_ONBOARDING = ["pending", "in_progress", "complete"];

describe("PEPPER ST. seed payload", () => {
  it("tenant has the required identity and Asia/Colombo timezone", () => {
    const { tenant } = buildSeedPayload();
    expect(tenant.name).toBe("PEPPER ST.");
    expect(tenant.slug).toBe("pepper-st");
    expect(tenant.timezone).toBe("Asia/Colombo");
    expect(ALLOWED_STATUS).toContain(tenant.status);
    expect(ALLOWED_ONBOARDING).toContain(tenant.onboardingStatus);
  });

  it("channel is WhatsApp 'whatsapp-main'; agent_id is derived (no stored source_agent_id)", () => {
    const { channel } = buildSeedPayload();
    expect(channel.type).toBe("whatsapp");
    expect(channel.channelKey).toBe("whatsapp-main");
    expect(channel.sourceAgentId).toBeNull();
  });

  it("entitlement is enterprise / fully enabled / unlimited (NULL retention)", () => {
    const { entitlement } = buildSeedPayload();
    expect(entitlement.planCode).toBe("enterprise");
    expect(entitlement.isFullyEnabled).toBe(true);
    expect(entitlement.rawHistoryRetentionDays).toBeNull();
    expect(entitlement.analyticsRetentionDays).toBeNull();
  });

  it("makes no phone-number assumptions (no hardcoded country code)", () => {
    const json = JSON.stringify(PEPPER_ST_SEED);
    expect(json).not.toContain("94");
    expect(json.toLowerCase()).not.toContain("phone");
  });
});
