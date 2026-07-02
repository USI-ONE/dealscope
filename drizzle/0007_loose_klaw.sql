CREATE TYPE "public"."backup_destination_kind" AS ENUM('cloud', 'onprem', 'hybrid', 'tape', 'other');--> statement-breakpoint
CREATE TYPE "public"."network_circuit_role" AS ENUM('primary', 'failover', 'out_of_band', 'dedicated_line', 'other');--> statement-breakpoint
CREATE TYPE "public"."restore_test_cadence" AS ENUM('monthly', 'quarterly', 'semi_annual', 'annual', 'ad_hoc', 'never');--> statement-breakpoint
CREATE TABLE "client_backup_strategy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"rpo_minutes" integer,
	"rto_minutes" integer,
	"offsite_copy" boolean DEFAULT false NOT NULL,
	"offsite_location" text,
	"immutable_copy" boolean DEFAULT false NOT NULL,
	"encryption_at_rest" boolean DEFAULT false NOT NULL,
	"dr_runbook_url" text,
	"last_restore_test_at" date,
	"restore_test_cadence" "restore_test_cadence",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_backup_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vendor_id" uuid,
	"service_id" uuid,
	"scope_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_notes" text,
	"frequency" text,
	"retention" text,
	"destination_kind" "backup_destination_kind",
	"destination_location" text,
	"monitoring_notes" text,
	"one_password_item_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_network_circuits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"location_id" uuid,
	"role" "network_circuit_role" DEFAULT 'primary' NOT NULL,
	"carrier" text NOT NULL,
	"product_label" text,
	"speed_down_mbps" integer,
	"speed_up_mbps" integer,
	"static_ip_range" text,
	"account_number" text,
	"support_phone" text,
	"support_portal_url" text,
	"term_ends_at" date,
	"monthly_cost_cents" integer,
	"vendor_id" uuid,
	"service_id" uuid,
	"one_password_item_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_network_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"vlan_id" integer,
	"subnet" text,
	"gateway" text,
	"dhcp_scope" text,
	"isolated_from_corp" boolean DEFAULT false NOT NULL,
	"purpose" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_backup_strategy" ADD CONSTRAINT "client_backup_strategy_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_backup_strategy" ADD CONSTRAINT "client_backup_strategy_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_backup_systems" ADD CONSTRAINT "client_backup_systems_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_backup_systems" ADD CONSTRAINT "client_backup_systems_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_backup_systems" ADD CONSTRAINT "client_backup_systems_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_backup_systems" ADD CONSTRAINT "client_backup_systems_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD CONSTRAINT "client_network_circuits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD CONSTRAINT "client_network_circuits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD CONSTRAINT "client_network_circuits_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD CONSTRAINT "client_network_circuits_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD CONSTRAINT "client_network_circuits_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_segments" ADD CONSTRAINT "client_network_segments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_segments" ADD CONSTRAINT "client_network_segments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_segments" ADD CONSTRAINT "client_network_segments_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_backup_strategy_client_unq" ON "client_backup_strategy" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_backup_systems_client_idx" ON "client_backup_systems" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_backup_systems_vendor_idx" ON "client_backup_systems" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "client_network_circuits_client_idx" ON "client_network_circuits" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_network_circuits_location_idx" ON "client_network_circuits" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "client_network_segments_client_idx" ON "client_network_segments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_network_segments_location_idx" ON "client_network_segments" USING btree ("location_id");