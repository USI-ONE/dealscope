CREATE TYPE "public"."site_survey_item_condition" AS ENUM('new', 'good', 'fair', 'aging', 'eol', 'dead', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."site_survey_item_kind" AS ENUM('workstation', 'laptop', 'monitor', 'tablet', 'phone_handset', 'voice_gateway', 'server_physical', 'server_virtual', 'storage_array', 'firewall', 'router', 'switch', 'wireless_ap', 'wireless_controller', 'patch_panel', 'rack', 'ups', 'pdu', 'modem', 'printer', 'mfp', 'scanner', 'camera', 'nvr', 'intercom', 'tv_signage', 'projector', 'speaker_system', 'pos_terminal', 'kiosk', 'specialty_equipment', 'peripheral_keyboard', 'peripheral_mouse', 'peripheral_dock', 'peripheral_headset', 'peripheral_other', 'cabling', 'other');--> statement-breakpoint
CREATE TYPE "public"."site_survey_kind" AS ENUM('loi_diligence', 'onboarding', 'hardware_audit', 'general_site');--> statement-breakpoint
CREATE TYPE "public"."site_survey_recommended_action" AS ENUM('keep', 'monitor', 'refresh_planned', 'refresh_now', 'replace', 'decommission', 'investigate', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."site_survey_status" AS ENUM('planning', 'in_progress', 'complete', 'cancelled');--> statement-breakpoint
CREATE TABLE "site_survey_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"kind" "site_survey_item_kind" NOT NULL,
	"label" text NOT NULL,
	"asset_tag" text,
	"hostname" text,
	"serial_number" text,
	"make" text,
	"model" text,
	"room" text,
	"user_assigned" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"install_date" date,
	"warranty_end" date,
	"condition" "site_survey_item_condition" DEFAULT 'unknown' NOT NULL,
	"recommended_action" "site_survey_recommended_action" DEFAULT 'unknown' NOT NULL,
	"remediation_cost_low_cents" integer,
	"remediation_cost_high_cents" integer,
	"notes" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hardware_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_survey_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"item_id" uuid,
	"url" text NOT NULL,
	"filename" text,
	"mime_type" text,
	"size_bytes" integer,
	"width_px" integer,
	"height_px" integer,
	"caption" text,
	"taken_at" timestamp with time zone,
	"uploaded_by_membership_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "site_survey_kind" DEFAULT 'general_site' NOT NULL,
	"status" "site_survey_status" DEFAULT 'planning' NOT NULL,
	"name" text NOT NULL,
	"engagement_id" uuid,
	"client_id" uuid,
	"client_location_id" uuid,
	"site_address" text,
	"lead_technician_membership_id" uuid,
	"scheduled_date" date,
	"performed_at" timestamp with time zone,
	"summary" text,
	"notes" text,
	"accompanied_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_survey_items" ADD CONSTRAINT "site_survey_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_survey_items" ADD CONSTRAINT "site_survey_items_survey_id_site_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."site_surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_survey_items" ADD CONSTRAINT "site_survey_items_hardware_id_hardware_id_fk" FOREIGN KEY ("hardware_id") REFERENCES "public"."hardware"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_survey_photos" ADD CONSTRAINT "site_survey_photos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_survey_photos" ADD CONSTRAINT "site_survey_photos_survey_id_site_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."site_surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_survey_photos" ADD CONSTRAINT "site_survey_photos_item_id_site_survey_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."site_survey_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_survey_photos" ADD CONSTRAINT "site_survey_photos_uploaded_by_membership_id_memberships_id_fk" FOREIGN KEY ("uploaded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_client_location_id_client_locations_id_fk" FOREIGN KEY ("client_location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_surveys" ADD CONSTRAINT "site_surveys_lead_technician_membership_id_memberships_id_fk" FOREIGN KEY ("lead_technician_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_survey_items_survey_idx" ON "site_survey_items" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "site_survey_items_kind_idx" ON "site_survey_items" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "site_survey_photos_survey_idx" ON "site_survey_photos" USING btree ("survey_id");--> statement-breakpoint
CREATE INDEX "site_survey_photos_item_idx" ON "site_survey_photos" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "site_surveys_org_idx" ON "site_surveys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "site_surveys_kind_idx" ON "site_surveys" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "site_surveys_engagement_idx" ON "site_surveys" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "site_surveys_client_idx" ON "site_surveys" USING btree ("client_id");