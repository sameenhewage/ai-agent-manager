import { describe, it, expect } from "vitest";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Slice 2 schema-shape spec. Verifies the Drizzle schema encodes the exact
 * contract in docs/architecture/02-schema-proposal.sql.md and honors the
 * PEPPER ST. boundaries (allowed tables only, no hidden defaults, no FK to ai.*).
 */

const ALLOWED = [
  "app_channels",
  "app_conversations",
  "app_customer_identities",
  "app_customers",
  "app_tenant_entitlements",
  "app_tenants",
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

const tables = (Object.values(schema) as unknown[]).filter(
  (v): v is PgTable => is(v, PgTable)
);
const configs = tables.map((t) => getTableConfig(t));
const byName = new Map(configs.map((c) => [c.name, c]));

function table(name: string) {
  const c = byName.get(name);
  if (!c) throw new Error(`table ${name} not defined`);
  return c;
}
function column(tableName: string, columnName: string) {
  const c = table(tableName).columns.find((col) => col.name === columnName);
  if (!c) throw new Error(`column ${tableName}.${columnName} not defined`);
  return c;
}
function uniqueSets(tableName: string) {
  return table(tableName).uniqueConstraints.map((u) =>
    u.columns
      .map((col) => col.name)
      .sort()
      .join(",")
  );
}

describe("dashboard schema — table set", () => {
  it("defines exactly the six allowed tables", () => {
    expect([...byName.keys()].sort()).toEqual(ALLOWED);
  });

  it("puts every table in the `dashboard` schema with an app_ prefix", () => {
    for (const c of configs) {
      expect(c.schema).toBe("dashboard");
      expect(c.name.startsWith("app_")).toBe(true);
    }
  });

  it("defines none of the forbidden tables", () => {
    const names = new Set(byName.keys());
    for (const f of FORBIDDEN) expect(names.has(f)).toBe(false);
  });
});

describe("app_tenants", () => {
  it("name is required but NOT unique (display/business name)", () => {
    expect(column("app_tenants", "name").notNull).toBe(true);
    expect(uniqueSets("app_tenants")).not.toContain("name");
  });

  it("slug is the unique system key", () => {
    expect(uniqueSets("app_tenants")).toContain("slug");
  });

  it("timezone is required and defaults to Asia/Colombo", () => {
    const tz = column("app_tenants", "timezone");
    expect(tz.notNull).toBe(true);
    expect(tz.hasDefault).toBe(true);
    expect(tz.default).toBe("Asia/Colombo");
  });
});

describe("app_channels", () => {
  it("is unique on (tenant_id, channel_key), not (tenant_id, type)", () => {
    const sets = uniqueSets("app_channels");
    expect(sets).toContain(["tenant_id", "channel_key"].sort().join(","));
    expect(sets).not.toContain(["tenant_id", "type"].sort().join(","));
  });
});

describe("app_customer_identities", () => {
  it("uniquely maps tenant_id + channel_id + external_contact_id", () => {
    const sets = uniqueSets("app_customer_identities");
    expect(sets).toContain(
      ["tenant_id", "channel_id", "external_contact_id"].sort().join(",")
    );
  });

  it("external_contact_id is text (no numeric phone assumption)", () => {
    expect(column("app_customer_identities", "external_contact_id").getSQLType()).toBe(
      "text"
    );
  });
});

describe("app_conversations", () => {
  it("links tenant, customer, customer_identity and channel by FK", () => {
    const c = table("app_conversations");
    const refTables = c.foreignKeys
      .map((fk) => getTableConfig(fk.reference().foreignTable).name)
      .sort();
    expect(refTables).toEqual([
      "app_channels",
      "app_customer_identities",
      "app_customers",
      "app_tenants",
    ]);
    for (const name of [
      "tenant_id",
      "customer_id",
      "customer_identity_id",
      "channel_id",
    ]) {
      expect(column("app_conversations", name).notNull).toBe(true);
    }
  });

  it("stores agno_session_id as text with NO foreign key into ai.*", () => {
    const c = table("app_conversations");
    const agno = column("app_conversations", "agno_session_id");
    expect(agno.getSQLType()).toBe("text");
    expect(agno.notNull).toBe(true);
    for (const fk of c.foreignKeys) {
      expect(getTableConfig(fk.reference().foreignTable).schema).toBe("dashboard");
      const localCols = fk.reference().columns.map((col) => col.name);
      expect(localCols).not.toContain("agno_session_id");
    }
  });

  it("status is dashboard-owned and defaults to open", () => {
    const status = column("app_conversations", "status");
    expect(status.notNull).toBe(true);
    expect(status.default).toBe("open");
  });
});

describe("app_tenant_entitlements", () => {
  it("is one-to-one with tenant (unique tenant_id)", () => {
    expect(uniqueSets("app_tenant_entitlements")).toContain("tenant_id");
  });

  it("has NO hidden default for plan_code (explicit at onboarding)", () => {
    const plan = column("app_tenant_entitlements", "plan_code");
    expect(plan.notNull).toBe(true);
    expect(plan.hasDefault).toBe(false);
  });

  it("has NO hidden default for is_fully_enabled (explicit at onboarding)", () => {
    const enabled = column("app_tenant_entitlements", "is_fully_enabled");
    expect(enabled.notNull).toBe(true);
    expect(enabled.hasDefault).toBe(false);
  });

  it("retention columns are nullable with no default (NULL = unlimited)", () => {
    for (const name of ["raw_history_retention_days", "analytics_retention_days"]) {
      const col = column("app_tenant_entitlements", name);
      expect(col.notNull).toBe(false);
      expect(col.hasDefault).toBe(false);
      expect(col.getSQLType()).toBe("integer");
    }
  });
});
