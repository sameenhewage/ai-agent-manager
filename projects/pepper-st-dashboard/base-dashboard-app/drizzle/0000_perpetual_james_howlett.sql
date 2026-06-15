CREATE SCHEMA "dashboard";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard"."app_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"channel_key" text NOT NULL,
	"display_name" text,
	"source_agent_id" text,
	"source_team_id" text,
	"external_business_id" text,
	"external_phone_number_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_channels_tenant_channel_key" UNIQUE("tenant_id","channel_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard"."app_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_identity_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"agno_session_id" text NOT NULL,
	"external_contact_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_at" timestamp with time zone,
	"last_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_conv_agno_unique" UNIQUE("tenant_id","channel_id","agno_session_id"),
	CONSTRAINT "app_conv_status_check" CHECK ("dashboard"."app_conversations"."status" in ('open','resolved','archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard"."app_customer_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_contact_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_cust_ident_unique" UNIQUE("tenant_id","channel_id","external_contact_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard"."app_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard"."app_tenant_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"is_fully_enabled" boolean NOT NULL,
	"raw_history_retention_days" integer,
	"analytics_retention_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_tenant_entitlements_tenant_key" UNIQUE("tenant_id"),
	CONSTRAINT "app_tenant_entitlements_raw_retention_check" CHECK ("dashboard"."app_tenant_entitlements"."raw_history_retention_days" is null or "dashboard"."app_tenant_entitlements"."raw_history_retention_days" > 0),
	CONSTRAINT "app_tenant_entitlements_analytics_retention_check" CHECK ("dashboard"."app_tenant_entitlements"."analytics_retention_days" is null or "dashboard"."app_tenant_entitlements"."analytics_retention_days" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard"."app_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"onboarding_status" text DEFAULT 'pending' NOT NULL,
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_tenants_slug_key" UNIQUE("slug"),
	CONSTRAINT "app_tenants_status_check" CHECK ("dashboard"."app_tenants"."status" in ('active','suspended','archived')),
	CONSTRAINT "app_tenants_onboarding_status_check" CHECK ("dashboard"."app_tenants"."onboarding_status" in ('pending','in_progress','complete'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_channels" ADD CONSTRAINT "app_channels_tenant_id_app_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "dashboard"."app_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_conversations" ADD CONSTRAINT "app_conversations_tenant_id_app_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "dashboard"."app_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_conversations" ADD CONSTRAINT "app_conversations_customer_id_app_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dashboard"."app_customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_conversations" ADD CONSTRAINT "app_conversations_customer_identity_id_app_customer_identities_id_fk" FOREIGN KEY ("customer_identity_id") REFERENCES "dashboard"."app_customer_identities"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_conversations" ADD CONSTRAINT "app_conversations_channel_id_app_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "dashboard"."app_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_customer_identities" ADD CONSTRAINT "app_customer_identities_tenant_id_app_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "dashboard"."app_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_customer_identities" ADD CONSTRAINT "app_customer_identities_customer_id_app_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "dashboard"."app_customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_customer_identities" ADD CONSTRAINT "app_customer_identities_channel_id_app_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "dashboard"."app_channels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_customers" ADD CONSTRAINT "app_customers_tenant_id_app_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "dashboard"."app_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_tenant_entitlements" ADD CONSTRAINT "app_tenant_entitlements_tenant_id_app_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "dashboard"."app_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_channels_tenant_idx" ON "dashboard"."app_channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_conv_tenant_last_idx" ON "dashboard"."app_conversations" USING btree ("tenant_id","last_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_conv_customer_idx" ON "dashboard"."app_conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_conv_identity_idx" ON "dashboard"."app_conversations" USING btree ("customer_identity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_conv_contact_idx" ON "dashboard"."app_conversations" USING btree ("tenant_id","channel_id","external_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_cust_ident_customer_idx" ON "dashboard"."app_customer_identities" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_customers_tenant_idx" ON "dashboard"."app_customers" USING btree ("tenant_id");