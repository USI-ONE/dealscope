CREATE TABLE "hardware_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"hardware_id" uuid NOT NULL,
	"heartbeat_date" date NOT NULL,
	"billing_tier" "hardware_billing_tier" NOT NULL,
	"source" text DEFAULT 'syncro' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hardware_heartbeats" ADD CONSTRAINT "hardware_heartbeats_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_heartbeats" ADD CONSTRAINT "hardware_heartbeats_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware_heartbeats" ADD CONSTRAINT "hardware_heartbeats_hardware_id_hardware_id_fk" FOREIGN KEY ("hardware_id") REFERENCES "public"."hardware"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hardware_heartbeats_hardware_date_unq" ON "hardware_heartbeats" USING btree ("hardware_id","heartbeat_date");--> statement-breakpoint
CREATE INDEX "hardware_heartbeats_client_date_idx" ON "hardware_heartbeats" USING btree ("client_id","heartbeat_date");--> statement-breakpoint
CREATE INDEX "hardware_heartbeats_org_date_idx" ON "hardware_heartbeats" USING btree ("organization_id","heartbeat_date");