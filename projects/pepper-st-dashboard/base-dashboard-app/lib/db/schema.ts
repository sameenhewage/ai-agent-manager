import { sql } from "drizzle-orm";
import {
  pgSchema,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";

/**
 * Dashboard-owned schema (Slice 2 — PROPOSAL ONLY, not applied).
 *
 * Drizzle implementation of docs/architecture/02-schema-proposal.sql.md. Four
 * `dashboard.app_*` tables (Slice 12D-D / ADR-0012 removed the app_customers +
 * app_customer_identities CRM model — `ai.customers` owns the contact registry).
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
    unique("app_conv_agno_unique").on(t.tenantId, t.channelId, t.agnoSessionId),
    check(
      "app_conv_status_check",
      sql`${t.status} in ('open','resolved','archived')`
    ),
    index("app_conv_tenant_last_idx").on(t.tenantId, t.lastAt.desc()),
    // external_contact_id is INDEXED but NOT UNIQUE (one contact => many conversations).
    index("app_conv_contact_idx").on(
      t.tenantId,
      t.channelId,
      t.externalContactId
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
export type AppTenantEntitlement = typeof appTenantEntitlements.$inferSelect;
