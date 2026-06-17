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
  "app_conversation_sessions",
  "app_conversations",
  "app_tenant_entitlements",
  "app_tenants",
];

const FORBIDDEN = [
  // Removed in Slice 12D-D / ADR-0012 — the dashboard no longer owns a customer/contact model;
  // ai.customers is the AI-platform contact registry, and external_contact_id lives on the
  // conversation index directly.
  "app_customers",
  "app_customer_identities",
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
  it("defines exactly the five allowed tables (adds app_conversation_sessions — ADR-0016; no customer/identity model — ADR-0012)", () => {
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

describe("app_conversations", () => {
  it("links ONLY tenant + channel by FK — the dashboard no longer owns a customer/identity model (ADR-0012)", () => {
    const c = table("app_conversations");
    const refTables = c.foreignKeys
      .map((fk) => getTableConfig(fk.reference().foreignTable).name)
      .sort();
    expect(refTables).toEqual(["app_channels", "app_tenants"]);
    for (const name of ["tenant_id", "channel_id"]) {
      expect(column("app_conversations", name).notNull).toBe(true);
    }
  });

  it("does NOT carry customer_id / customer_identity_id columns (no duplicate CRM/contact model — ADR-0012)", () => {
    const cols = table("app_conversations").columns.map((col) => col.name);
    expect(cols).not.toContain("customer_id");
    expect(cols).not.toContain("customer_identity_id");
  });

  it("keeps external_contact_id directly on the conversation (text, NOT NULL — the masked-contact source)", () => {
    const col = column("app_conversations", "external_contact_id");
    expect(col.getSQLType()).toBe("text");
    expect(col.notNull).toBe(true);
  });

  it("does NOT carry the legacy agno_session_id column (removed in Gate C.3 — sessions live in app_conversation_sessions)", () => {
    const cols = table("app_conversations").columns.map((col) => col.name);
    expect(cols).not.toContain("agno_session_id");
  });

  it("status is dashboard-owned and defaults to open", () => {
    const status = column("app_conversations", "status");
    expect(status.notNull).toBe(true);
    expect(status.default).toBe("open");
  });

  // ADR-0016 Gate C.3 — the legacy (tenant, channel, agno_session_id) uniqueness is REMOVED. The
  // ENFORCED grain is the contact-thread unique index (asserted below).
  it("does NOT keep the legacy unique on (tenant_id, channel_id, agno_session_id) (removed in Gate C.3)", () => {
    expect(uniqueSets("app_conversations")).not.toContain(
      ["tenant_id", "channel_id", "agno_session_id"].sort().join(",")
    );
  });

  // ADR-0016 Gate C.2/C.3 — the conversation grain is the CONTACT THREAD: exactly ONE row per
  // (tenant_id, channel_id, external_contact_id), enforced by a UNIQUE INDEX (applied after the
  // live collapse). The legacy (tenant, channel, agno_session_id) unique was removed in Gate C.3.
  it("enforces ONE row per contact thread — a UNIQUE index on (tenant_id, channel_id, external_contact_id) (ADR-0016 Gate C.2)", () => {
    const idx = table("app_conversations").indexes.find(
      (i) => i.config.name === "app_conv_contact_thread_key"
    );
    expect(idx, "app_conv_contact_thread_key index must exist").toBeDefined();
    expect(idx?.config.unique).toBe(true);
    expect(
      (idx?.config.columns as { name?: string }[]).map((c) => c.name).sort()
    ).toEqual(["channel_id", "external_contact_id", "tenant_id"]);
  });

  it("stores NO transcript/message content (canonical transcript stays in ai.agno_sessions.runs — ADR-0004)", () => {
    const cols = table("app_conversations").columns.map((c) => c.name);
    const forbidden = /(^|_)(runs?|messages?|content|body|transcript|text)(_|$)/i;
    const offenders = cols.filter((name) => forbidden.test(name));
    expect(offenders).toEqual([]);
  });
});

// ADR-0016, Gate A (EXPAND ONLY): the provider/Agno session-link layer. app_conversations is becoming
// the customer/contact thread; this child table holds one row per provider session, linked BY VALUE to
// ai.agno_sessions.session_id (no cross-schema FK). The FINAL contact-thread uniqueness is NOT enforced here.
describe("app_conversation_sessions (ADR-0016, Gate A — provider/session links)", () => {
  it("links by FK ONLY to dashboard tables (conversation_id → app_conversations, tenant_id → app_tenants); NO FK into ai.*", () => {
    const c = table("app_conversation_sessions");
    const refTables = c.foreignKeys
      .map((fk) => getTableConfig(fk.reference().foreignTable).name)
      .sort();
    expect(refTables).toEqual(["app_conversations", "app_tenants"]);
    for (const fk of c.foreignKeys) {
      expect(getTableConfig(fk.reference().foreignTable).schema).toBe("dashboard");
    }
  });

  it("maps external_session_id BY VALUE (text, NOT NULL) with NO foreign key on it", () => {
    const col = column("app_conversation_sessions", "external_session_id");
    expect(col.getSQLType()).toBe("text");
    expect(col.notNull).toBe(true);
    for (const fk of table("app_conversation_sessions").foreignKeys) {
      const localCols = fk.reference().columns.map((c) => c.name);
      expect(localCols).not.toContain("external_session_id");
    }
  });

  it("is unique on (tenant_id, provider, external_session_id) — one link per provider session", () => {
    expect(uniqueSets("app_conversation_sessions")).toContain(
      ["tenant_id", "provider", "external_session_id"].sort().join(",")
    );
  });

  it("does NOT enforce the final contact-thread uniqueness yet (Gate A is expand-only)", () => {
    const sets = uniqueSets("app_conversation_sessions");
    expect(sets).not.toContain(
      ["tenant_id", "channel_id", "external_contact_id"].sort().join(",")
    );
  });

  it("provider defaults to 'agno' and is NOT NULL", () => {
    const p = column("app_conversation_sessions", "provider");
    expect(p.notNull).toBe(true);
    expect(p.default).toBe("agno");
  });

  it("business_id is nullable (until the ADR-0015 business migration lands)", () => {
    expect(column("app_conversation_sessions", "business_id").notNull).toBe(false);
  });

  it("requires tenant_id + conversation_id", () => {
    for (const name of ["tenant_id", "conversation_id"]) {
      expect(column("app_conversation_sessions", name).notNull).toBe(true);
    }
  });

  it("stores NO transcript/message content (links only — ADR-0004)", () => {
    const cols = table("app_conversation_sessions").columns.map((c) => c.name);
    const forbidden = /(^|_)(runs?|messages?|content|body|transcript|text)(_|$)/i;
    expect(cols.filter((name) => forbidden.test(name))).toEqual([]);
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
