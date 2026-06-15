import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { appTenants } from "../db/schema";

/**
 * Demo tenant context (Phase 1, no auth) — server-side only.
 *
 * This is a TEMPORARY stand-in for real authentication/tenant selection (which
 * arrives with auth in a later phase). It resolves a single "current" tenant by
 * slug so tenant-scoped queries have a `tenant_id` to filter on. It exposes no
 * secrets to the client.
 */

export const DEFAULT_TENANT_SLUG = "pepper-st";

/** The configured demo tenant slug (env override, else the default). Pure. */
export function getCurrentTenantSlug(): string {
  const fromEnv = process.env.DEMO_TENANT_SLUG?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_TENANT_SLUG;
}

/** Resolve the current demo tenant row (or null). Server-side; requires a db. */
export async function resolveCurrentTenant(db: NodePgDatabase<typeof schema>) {
  const slug = getCurrentTenantSlug();
  const [tenant] = await db
    .select()
    .from(appTenants)
    .where(eq(appTenants.slug, slug))
    .limit(1);
  return tenant ?? null;
}
