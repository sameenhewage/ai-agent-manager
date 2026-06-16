ALTER TABLE "dashboard"."app_customer_identities" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboard"."app_customers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "dashboard"."app_customer_identities" CASCADE;--> statement-breakpoint
DROP TABLE "dashboard"."app_customers" CASCADE;--> statement-breakpoint
ALTER TABLE "dashboard"."app_conversations" DROP CONSTRAINT IF EXISTS "app_conversations_customer_id_app_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboard"."app_conversations" DROP CONSTRAINT IF EXISTS "app_conversations_customer_identity_id_app_customer_identities_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "app_conv_customer_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "app_conv_identity_idx";--> statement-breakpoint
ALTER TABLE "dashboard"."app_conversations" DROP COLUMN IF EXISTS "customer_id";--> statement-breakpoint
ALTER TABLE "dashboard"."app_conversations" DROP COLUMN IF EXISTS "customer_identity_id";