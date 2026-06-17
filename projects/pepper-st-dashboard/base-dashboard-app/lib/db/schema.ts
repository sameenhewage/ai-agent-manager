import { sql } from "drizzle-orm";
import {
  pgSchema,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
  unique,
  check,
} from "drizzle-orm/pg-core";

/**
 * Dashboard-owned schema (Slice 2 — PROPOSAL ONLY, not applied).
 *
 * Drizzle implementation aligned with docs/architecture/09 + ADR-0015/0016. FIVE
 * `dashboard.app_*` tables: app_tenants, app_channels, app_conversations,
 * app_tenant_entitlements, and app_conversation_sessions (ADR-0016 provider/Agno
 * session links — Gate A expand-only). Slice 12D-D / ADR-0012 removed the app_customers +
 * app_customer_identities CRM model — `ai.customers` owns the contact registry.
 * Multi-tenant from day one; every operational row carries `tenant_id`. The canonical transcript stays in the Agno/WhatsApp
 * pipeline — there is NO message table and NO foreign key into `ai.*`
 * (`agno_session_id` links by value only). Entitlements carry NO hidden product
 * defaults: `plan_code` / `is_fully_enabled` are NOT NULL with no default;
 * retention columns are nullable with no default (NULL = unlimited).
 */

export const dashboard = pgSchema("dashboard");

const tz = (name: string) => timestamp(name, { withTimezone: true });

/** The business/client using the dashboard. NOT a chat session, NOT a customer. */
export const appTenants = dashboard.table(
  "app_tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(), // display/business name — NOT unique
    slug: text("slug").notNull(), // system/url key — unique
    status: text("status").notNull().default("active"),
    onboardingStatus: text("onboarding_status").notNull().default("pending"),
    timezone: text("timezone").notNull().default("Asia/Colombo"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("app_tenants_slug_key").on(t.slug),
    check(
      "app_tenants_status_check",
      sql`${t.status} in ('active','suspended','archived')`
    ),
    check(
      "app_tenants_onboarding_status_check",
      sql`${t.onboardingStatus} in ('pending','in_progress','complete')`
    ),
  ]
);

/** A tenant's source/integration (Phase 1: WhatsApp). */
export const appChannels = dashboard.table(
  "app_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => appTenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    channelKey: text("channel_key").notNull(),
    displayName: text("display_name"),
    sourceAgentId: text("source_agent_id"),
    sourceTeamId: text("source_team_id"),
    externalBusinessId: text("external_business_id"),
    externalPhoneNumberId: text("external_phone_number_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Uniqueness on the stable channel_key (NOT on (tenant_id, type)) so a tenant
    // can hold more than one WhatsApp channel later.
    unique("app_channels_tenant_channel_key").on(t.tenantId, t.channelKey),
    index("app_channels_tenant_idx").on(t.tenantId),
  ]
);

/**
 * Lightweight index/status row for ONE Agno session (Slice 12D-D / ADR-0012). NO message
 * bodies; NO FK into `ai.*`; NO customer/identity model — the contact is stored by value on
 * `external_contact_id` (the AI platform's `ai.customers` / `ai.agno_sessions.user_id` is the
 * canonical contact registry). One Agno session => one row; one contact => MANY rows.
 */
export const appConversations = dashboard.table(
  "app_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => appTenants.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => appChannels.id, { onDelete: "cascade" }),
    // Link by value to ai.agno_sessions.session_id — deliberately NO cross-schema FK.
    agnoSessionId: text("agno_session_id").notNull(),
    // The external contact id (WhatsApp phone or opaque user_id) lives directly here and is
    // masked on read. NO customer/identity table (ADR-0012); `ai.customers` is the registry.
    externalContactId: text("external_contact_id").notNull(),
    status: text("status").notNull().default("open"), // dashboard-owned, NOT from Agno
    firstAt: tz("first_at"),
    lastAt: tz("last_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Legacy session-grain uniqueness — KEPT for compatibility until Gate C.3 drops agno_session_id.
    unique("app_conv_agno_unique").on(t.tenantId, t.channelId, t.agnoSessionId),
    check(
      "app_conv_status_check",
      sql`${t.status} in ('open','resolved','archived')`
    ),
    index("app_conv_tenant_last_idx").on(t.tenantId, t.lastAt.desc()),
    // ADR-0016 Gate C.2: enforce ONE row per contact thread via a UNIQUE INDEX on
    // (tenant_id, channel_id, external_contact_id), applied AFTER the live collapse. This also
    // serves the contact lookup (it replaces the former non-unique app_conv_contact_idx).
    uniqueIndex("app_conv_contact_thread_key").on(
      t.tenantId,
      t.channelId,
      t.externalContactId
    ),
  ]
);

/**
 * Provider/Agno session links for a conversation/contact thread (ADR-0016, Gate A — EXPAND ONLY).
 * One row per provider session. `external_session_id` maps **by value** to `ai.agno_sessions.session_id`
 * — deliberately **NO** cross-schema FK into `ai.*`. `app_conversations` is becoming the customer/contact
 * thread; this child table holds the per-session links. Gate A is ADDITIVE: `app_conversations.agno_session_id`
 * remains for compatibility, and the final contact-thread uniqueness is **NOT** enforced yet (Gate C).
 * `business_id` is nullable until the ADR-0015 business migration lands (so `app_businesses` exists to FK to).
 */
export const appConversationSessions = dashboard.table(
  "app_conversation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => appTenants.id, { onDelete: "cascade" }),
    // Nullable until the ADR-0015 business migration lands (app_businesses does not exist yet => no FK).
    businessId: uuid("business_id"),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => appConversations.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("agno"),
    // Links BY VALUE to ai.agno_sessions.session_id — deliberately NO cross-schema FK into ai.*.
    externalSessionId: text("external_session_id").notNull(),
    startedAt: tz("started_at"),
    lastAt: tz("last_at"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // One dashboard link per provider session (ADR-0016). NOT the final contact-thread uniqueness.
    unique("app_conv_sessions_provider_session_key").on(
      t.tenantId,
      t.provider,
      t.externalSessionId
    ),
    index("app_conv_sessions_conversation_idx").on(t.conversationId),
    index("app_conv_sessions_tenant_conversation_idx").on(t.tenantId, t.conversationId),
    index("app_conv_sessions_tenant_provider_session_idx").on(
      t.tenantId,
      t.provider,
      t.externalSessionId
    ),
  ]
);

/**
 * Per-tenant CURRENT access/limits (renamed from app_subscription_limits).
 * One row per tenant (1:1). NOT a finalized pricing model (pricing parked).
 * NO HIDDEN DEFAULTS: plan_code / is_fully_enabled are explicit at onboarding;
 * retention columns are nullable with no default (NULL = unlimited).
 */
export const appTenantEntitlements = dashboard.table(
  "app_tenant_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => appTenants.id, { onDelete: "cascade" }),
    planCode: text("plan_code").notNull(), // explicit; no default
    isFullyEnabled: boolean("is_fully_enabled").notNull(), // explicit; no default
    rawHistoryRetentionDays: integer("raw_history_retention_days"), // nullable; no default
    analyticsRetentionDays: integer("analytics_retention_days"), // nullable; no default
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("app_tenant_entitlements_tenant_key").on(t.tenantId),
    check(
      "app_tenant_entitlements_raw_retention_check",
      sql`${t.rawHistoryRetentionDays} is null or ${t.rawHistoryRetentionDays} > 0`
    ),
    check(
      "app_tenant_entitlements_analytics_retention_check",
      sql`${t.analyticsRetentionDays} is null or ${t.analyticsRetentionDays} > 0`
    ),
  ]
);

// Inferred row types (type-only; no DB connection is created in Slice 2).
export type AppTenant = typeof appTenants.$inferSelect;
export type NewAppTenant = typeof appTenants.$inferInsert;
export type AppChannel = typeof appChannels.$inferSelect;
export type AppConversation = typeof appConversations.$inferSelect;
export type AppConversationSession = typeof appConversationSessions.$inferSelect;
export type NewAppConversationSession = typeof appConversationSessions.$inferInsert;
export type AppTenantEntitlement = typeof appTenantEntitlements.$inferSelect;
