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

// The tables the dashboard KEEPS (Slice 12D-D / ADR-0012). The baseline 0000 migration still
// CREATEs the historical app_customers/app_customer_identities; the later simplification migration
// DROPs them (asserted separately below), so this list is the kept set, not "never mentioned".
const ALLOWED = [
  "app_tenants",
  "app_channels",
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

  it("creates the kept dashboard tables in the dashboard schema", () => {
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

// Slice 12D-D / ADR-0012 — the dashboard drops its duplicate customer/identity model. These
// assertions read the FULL set of generated migrations, so they prove the drop migration exists.
describe("dashboard v2 schema simplification migration (ADR-0012)", () => {
  it("drops the app_customers and app_customer_identities tables", () => {
    expect(sql).toMatch(/drop table[^;]*"app_customers"/i);
    expect(sql).toMatch(/drop table[^;]*"app_customer_identities"/i);
  });

  it("drops customer_id and customer_identity_id from app_conversations", () => {
    expect(sql).toMatch(/alter table[^;]*"app_conversations"[^;]*drop column[^;]*"customer_id"/i);
    expect(sql).toMatch(
      /alter table[^;]*"app_conversations"[^;]*drop column[^;]*"customer_identity_id"/i
    );
  });

  it("still never touches ai.* (the drop migration is dashboard-only)", () => {
    expect(sql).not.toContain('"ai"');
    expect(sql).not.toMatch(/\bai\.[a-z_]/i);
  });
});

// ADR-0016, Gate A (EXPAND ONLY) — the provider/Agno session-link table. The global checks above already
// assert the FULL migration set never touches ai.*, copies no transcript, and runs no INSERT (DDL-only).
describe("Gate A — app_conversation_sessions expand migration (ADR-0016)", () => {
  it("creates the app_conversation_sessions table in the dashboard schema", () => {
    expect(sql).toContain('"dashboard"."app_conversation_sessions"');
  });

  it("links external_session_id BY VALUE — no foreign key on it (no cross-schema FK into ai.*)", () => {
    expect(sql).not.toContain('("external_session_id") REFERENCES');
  });

  it("FKs conversation_id → app_conversations and tenant_id → app_tenants (dashboard-only)", () => {
    expect(sql).toMatch(/"conversation_id"\) REFERENCES "dashboard"\."app_conversations"/);
    expect(sql).toMatch(/"tenant_id"\) REFERENCES "dashboard"\."app_tenants"/);
  });

  it("enforces the provider-session uniqueness (NOT the final contact-thread uniqueness — Gate C)", () => {
    expect(sql).toContain(
      '"app_conv_sessions_provider_session_key" UNIQUE("tenant_id","provider","external_session_id")'
    );
  });
});

// ADR-0016, Gate C.2 — ENFORCE one row per contact thread. The collapse itself runs as a separate
// reversible SCRIPT (scripts/collapse-contact-threads.ts); the migration is DDL-only: it adds the
// contact-thread UNIQUE index and drops the former non-unique contact index. (agno_session_id and
// its legacy uniqueness were removed later, in Gate C.3 — asserted in the next block.)
describe("Gate C.2 — contact-thread uniqueness migration (ADR-0016)", () => {
  it("adds a UNIQUE index on (tenant_id, channel_id, external_contact_id)", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "app_conv_contact_thread_key" ON "dashboard"\."app_conversations" USING btree \("tenant_id","channel_id","external_contact_id"\)/
    );
  });

  it("drops the former non-unique contact index (schema-qualified, replaced by the unique one)", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS "dashboard"\."app_conv_contact_idx"/);
  });

  it("adds the contact-thread index in C.2 (the agno_session_id drop is a SEPARATE later migration)", () => {
    // The C.2 migration body itself only adds the unique index + drops the non-unique contact index.
    const c2 = sqlFiles
      .filter((f) => /motionless_fabian_cortez/.test(f))
      .map((f) => readFileSync(join(drizzleDir, f), "utf8"))
      .join("\n");
    expect(c2).not.toMatch(/drop column[^;]*"agno_session_id"/i);
  });
});

// ADR-0016, Gate C.3 — DROP the legacy per-session column + its uniqueness. DDL-only; dashboard-only.
// All runtime code was migrated to source sessions from app_conversation_sessions BEFORE this drop.
describe("Gate C.3 — drop legacy agno_session_id (ADR-0016)", () => {
  it("drops the app_conv_agno_unique CONSTRAINT (not a plain index)", () => {
    expect(sql).toMatch(
      /ALTER TABLE "dashboard"\."app_conversations" DROP CONSTRAINT IF EXISTS "app_conv_agno_unique"/
    );
    // a UNIQUE constraint's backing index must be dropped via DROP CONSTRAINT, never DROP INDEX
    expect(sql).not.toMatch(/DROP INDEX[^;]*"app_conv_agno_unique"/i);
  });

  it("drops the agno_session_id column from app_conversations", () => {
    expect(sql).toMatch(
      /ALTER TABLE "dashboard"\."app_conversations" DROP COLUMN IF EXISTS "agno_session_id"/
    );
  });

  it("drops the CONSTRAINT before the COLUMN", () => {
    const constraintIdx = sql.search(/DROP CONSTRAINT IF EXISTS "app_conv_agno_unique"/);
    const columnIdx = sql.search(/DROP COLUMN IF EXISTS "agno_session_id"/);
    expect(constraintIdx).toBeGreaterThanOrEqual(0);
    expect(columnIdx).toBeGreaterThan(constraintIdx);
  });
});
