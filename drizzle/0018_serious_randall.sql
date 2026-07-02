CREATE TYPE "public"."assessment_status" AS ENUM('compliant', 'partial', 'non_compliant', 'not_applicable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."standard_source" AS ENUM('internal', 'cis_v8', 'nist_csf_2', 'iso_27001', 'soc2', 'hipaa', 'pci_dss', 'cyber_insurance', 'industry_specific', 'custom');--> statement-breakpoint
CREATE TABLE "client_control_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"status" "assessment_status" DEFAULT 'unknown' NOT NULL,
	"score" integer,
	"evidence" text,
	"assessed_by_membership_id" uuid,
	"assessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standard_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text,
	"title" text NOT NULL,
	"description" text,
	"guidance" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" text,
	"source" "standard_source" DEFAULT 'internal' NOT NULL,
	"is_published" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_control_assessments" ADD CONSTRAINT "client_control_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_control_assessments" ADD CONSTRAINT "client_control_assessments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_control_assessments" ADD CONSTRAINT "client_control_assessments_control_id_standard_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."standard_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_control_assessments" ADD CONSTRAINT "client_control_assessments_assessed_by_membership_id_memberships_id_fk" FOREIGN KEY ("assessed_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_controls" ADD CONSTRAINT "standard_controls_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_control_assessments_client_idx" ON "client_control_assessments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_control_assessments_control_idx" ON "client_control_assessments" USING btree ("control_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_control_assessments_uq" ON "client_control_assessments" USING btree ("client_id","control_id");--> statement-breakpoint
CREATE INDEX "standard_controls_standard_idx" ON "standard_controls" USING btree ("standard_id");--> statement-breakpoint
CREATE INDEX "standard_controls_parent_idx" ON "standard_controls" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "standards_org_idx" ON "standards" USING btree ("organization_id");