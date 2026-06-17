CREATE TABLE IF NOT EXISTS "dashboard"."app_conversation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"business_id" uuid,
	"conversation_id" uuid NOT NULL,
	"provider" text DEFAULT 'agno' NOT NULL,
	"external_session_id" text NOT NULL,
	"started_at" timestamp with time zone,
	"last_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_conv_sessions_provider_session_key" UNIQUE("tenant_id","provider","external_session_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_conversation_sessions" ADD CONSTRAINT "app_conversation_sessions_tenant_id_app_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "dashboard"."app_tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dashboard"."app_conversation_sessions" ADD CONSTRAINT "app_conversation_sessions_conversation_id_app_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "dashboard"."app_conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_conv_sessions_conversation_idx" ON "dashboard"."app_conversation_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_conv_sessions_tenant_conversation_idx" ON "dashboard"."app_conversation_sessions" USING btree ("tenant_id","conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_conv_sessions_tenant_provider_session_idx" ON "dashboard"."app_conversation_sessions" USING btree ("tenant_id","provider","external_session_id");