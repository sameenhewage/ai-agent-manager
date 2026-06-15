import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Slice 2 migration-artifact guardrails. Reads the generated SQL under ./drizzle
 * (run `npm run db:generate`) and asserts the migration encodes ONLY the allowed
 * dashboard schema, never touches `ai.*`, duplicates no transcript, and applies
 * nothing (DDL only — no seed/INSERT). This protects Gate 2 review.
 */

const drizzleDir = join(process.cwd(), "drizzle");
const sqlFiles = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql"));
const sql = sqlFiles
  .map((f) => readFileSync(join(drizzleDir, f), "utf8"))
  .join("\n");

const ALLOWED = [
  "app_tenants",
  "app_channels",
  "app_customers",
  "app_customer_identities",
  "app_conversations",
  "app_tenant_entitlements",
];

const FORBIDDEN = [
  "app_conversation_messages",
  "app_analytics_daily",
  "app_subscription_limits",
  "app_plans",
  "app_plan_features",
  "app_tenant_subscriptions",
  "app_orders",
  "app_issues",
  "app_exchanges",
  "app_follow_ups",
  "app_users",
  "app_members",
  "app_roles",
];

describe("generated migration SQL", () => {
  it("produced at least one migration file", () => {
    expect(sqlFiles.length).toBeGreaterThan(0);
  });

  it("creates the dashboard schema", () => {
    expect(sql).toContain('CREATE SCHEMA "dashboard"');
  });

  it("creates all six allowed tables in the dashboard schema", () => {
    for (const t of ALLOWED) {
      expect(sql).toContain(`"dashboard"."${t}"`);
    }
  });

  it("creates none of the forbidden tables", () => {
    for (const f of FORBIDDEN) {
      expect(sql).not.toContain(`"${f}"`);
    }
  });

  it("never references the ai schema (no DDL/FK into ai.*)", () => {
    expect(sql).not.toContain('"ai"');
    expect(sql).not.toMatch(/\bai\.[a-z_]/i);
  });

  it("duplicates no transcript (no message/transcript columns or tables)", () => {
    expect(sql.toLowerCase()).not.toContain("message");
    expect(sql.toLowerCase()).not.toContain("transcript");
  });

  it("links agno_session_id by value only (no foreign key on it)", () => {
    expect(sql).not.toContain('("agno_session_id") REFERENCES');
  });

  it("keeps plan_code explicit — NOT NULL with no default", () => {
    expect(sql).toMatch(/"plan_code" text NOT NULL/);
    expect(sql).not.toMatch(/"plan_code" text[^,\n]*DEFAULT/);
  });

  it("keeps is_fully_enabled explicit — NOT NULL with no default", () => {
    expect(sql).toMatch(/"is_fully_enabled" boolean NOT NULL/);
    expect(sql).not.toMatch(/"is_fully_enabled" boolean[^,\n]*DEFAULT/);
  });

  it("keeps retention nullable with no default (NULL = unlimited)", () => {
    expect(sql).toMatch(/"raw_history_retention_days" integer/);
    expect(sql).toMatch(/"analytics_retention_days" integer/);
    expect(sql).not.toMatch(/"raw_history_retention_days" integer[^,\n]*DEFAULT/);
    expect(sql).not.toMatch(/"analytics_retention_days" integer[^,\n]*DEFAULT/);
    expect(sql).not.toMatch(/"raw_history_retention_days" integer[^,\n]*NOT NULL/);
    expect(sql).not.toMatch(/"analytics_retention_days" integer[^,\n]*NOT NULL/);
  });

  it("enforces the retention CHECK (NULL or > 0)", () => {
    expect(sql).toContain("app_tenant_entitlements_raw_retention_check");
    expect(sql).toContain("app_tenant_entitlements_analytics_retention_check");
  });

  it("enforces tenant slug uniqueness and a 1:1 entitlement per tenant", () => {
    expect(sql).toContain('CONSTRAINT "app_tenants_slug_key" UNIQUE("slug")');
    expect(sql).toContain(
      'CONSTRAINT "app_tenant_entitlements_tenant_key" UNIQUE("tenant_id")'
    );
  });

  it("requires the tenant timezone with an Asia/Colombo default", () => {
    expect(sql).toMatch(/"timezone" text DEFAULT 'Asia\/Colombo' NOT NULL/);
  });

  it("applies nothing — DDL only, no seed/INSERT", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });
});
