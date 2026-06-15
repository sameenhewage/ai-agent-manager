import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { appTenants, appChannels, appTenantEntitlements } from "./schema";

/**
 * Idempotent seed for PEPPER ST. dashboard-owned metadata (Slice 3).
 *
 * Writes ONLY to `dashboard.*`. Customers, identities and conversations are NOT
 * seeded here — they are created later by the Agno mapping workflow from real
 * `ai.agno_sessions` rows. No phone-number assumptions; no hardcoded country code.
 */

export const PEPPER_ST_SEED = {
  tenant: {
    name: "PEPPER ST.",
    slug: "pepper-st",
    status: "active", // allowed: active | suspended | archived
    onboardingStatus: "complete", // allowed: pending | in_progress | complete
    timezone: "Asia/Colombo",
  },
  channel: {
    type: "whatsapp",
    channelKey: "whatsapp-main",
    displayName: "PEPPER ST. WhatsApp",
    sourceAgentId: "concierge",
  },
  entitlement: {
    planCode: "enterprise",
    isFullyEnabled: true,
    rawHistoryRetentionDays: null, // NULL = unlimited
    analyticsRetentionDays: null, // NULL = unlimited
  },
} as const;

/** Pure payload (unit-testable without a database). */
export function buildSeedPayload() {
  return PEPPER_ST_SEED;
}

/**
 * Apply the seed idempotently. Safe to re-run: every insert is keyed by a
 * natural unique constraint and uses ON CONFLICT DO NOTHING.
 */
export async function seedPepperSt(db: NodePgDatabase<typeof schema>) {
  await db
    .insert(appTenants)
    .values({
      name: PEPPER_ST_SEED.tenant.name,
      slug: PEPPER_ST_SEED.tenant.slug,
      status: PEPPER_ST_SEED.tenant.status,
      onboardingStatus: PEPPER_ST_SEED.tenant.onboardingStatus,
      timezone: PEPPER_ST_SEED.tenant.timezone,
    })
    .onConflictDoNothing({ target: appTenants.slug });

  const [tenant] = await db
    .select()
    .from(appTenants)
    .where(eq(appTenants.slug, PEPPER_ST_SEED.tenant.slug))
    .limit(1);
  if (!tenant) throw new Error("seed: PEPPER ST. tenant not found after upsert");

  await db
    .insert(appChannels)
    .values({
      tenantId: tenant.id,
      type: PEPPER_ST_SEED.channel.type,
      channelKey: PEPPER_ST_SEED.channel.channelKey,
      displayName: PEPPER_ST_SEED.channel.displayName,
      sourceAgentId: PEPPER_ST_SEED.channel.sourceAgentId,
    })
    .onConflictDoNothing({
      target: [appChannels.tenantId, appChannels.channelKey],
    });

  await db
    .insert(appTenantEntitlements)
    .values({
      tenantId: tenant.id,
      planCode: PEPPER_ST_SEED.entitlement.planCode,
      isFullyEnabled: PEPPER_ST_SEED.entitlement.isFullyEnabled,
      rawHistoryRetentionDays: PEPPER_ST_SEED.entitlement.rawHistoryRetentionDays,
      analyticsRetentionDays: PEPPER_ST_SEED.entitlement.analyticsRetentionDays,
    })
    .onConflictDoNothing({ target: appTenantEntitlements.tenantId });

  return tenant;
}
