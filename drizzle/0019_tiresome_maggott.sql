CREATE TYPE "public"."ownership_group_kind" AS ENUM('pe_firm', 'family_office', 'holding_company', 'parent_company', 'franchise', 'other');--> statement-breakpoint
CREATE TABLE "client_applicable_standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"is_required" integer DEFAULT 1 NOT NULL,
	"rationale" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "ownership_group_kind" DEFAULT 'pe_firm' NOT NULL,
	"description" text,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "ownership_group_id" uuid;--> statement-breakpoint
ALTER TABLE "standards" ADD COLUMN "ownership_group_id" uuid;--> statement-breakpoint
ALTER TABLE "client_applicable_standards" ADD CONSTRAINT "client_applicable_standards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_applicable_standards" ADD CONSTRAINT "client_applicable_standards_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_applicable_standards" ADD CONSTRAINT "client_applicable_standards_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_groups" ADD CONSTRAINT "ownership_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_applicable_standards_client_idx" ON "client_applicable_standards" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_applicable_standards_standard_idx" ON "client_applicable_standards" USING btree ("standard_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_applicable_standards_uq" ON "client_applicable_standards" USING btree ("client_id","standard_id");--> statement-breakpoint
CREATE INDEX "ownership_groups_org_idx" ON "ownership_groups" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_ownership_group_id_ownership_groups_id_fk" FOREIGN KEY ("ownership_group_id") REFERENCES "public"."ownership_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_ownership_group_id_ownership_groups_id_fk" FOREIGN KEY ("ownership_group_id") REFERENCES "public"."ownership_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standards_ownership_group_idx" ON "standards" USING btree ("ownership_group_id");