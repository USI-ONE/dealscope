CREATE TYPE "public"."automation_maturity" AS ENUM('manual', 'partial', 'high');--> statement-breakpoint
CREATE TYPE "public"."strategic_initiative_status" AS ENUM('planned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."strategic_intensity" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."support_intensity" AS ENUM('low', 'standard', 'high');--> statement-breakpoint
CREATE TABLE "client_staffing_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"user_count" integer DEFAULT 0 NOT NULL,
	"sites" integer DEFAULT 1 NOT NULL,
	"servers" integer DEFAULT 0 NOT NULL,
	"apps" integer DEFAULT 0 NOT NULL,
	"automation_maturity" "automation_maturity" DEFAULT 'manual' NOT NULL,
	"strategic_intensity" "strategic_intensity" DEFAULT 'none' NOT NULL,
	"support_intensity" "support_intensity" DEFAULT 'standard' NOT NULL,
	"tier1_fte" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tier2_fte" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tier3_fte" numeric(5, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"staff_member_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"allocated_fte" numeric(4, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"tier" integer NOT NULL,
	"capacity_fte" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"annual_cost_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"tier3_fte_required" numeric(4, 2) DEFAULT '0' NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" "strategic_initiative_status" DEFAULT 'planned' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_staffing_profiles" ADD CONSTRAINT "client_staffing_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_staffing_profiles" ADD CONSTRAINT "client_staffing_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_assignments" ADD CONSTRAINT "staff_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_staffing_profiles_client_unq" ON "client_staffing_profiles" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_staffing_profiles_org_idx" ON "client_staffing_profiles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_assignments_unq" ON "staff_assignments" USING btree ("staff_member_id","client_id");--> statement-breakpoint
CREATE INDEX "staff_assignments_staff_idx" ON "staff_assignments" USING btree ("staff_member_id");--> statement-breakpoint
CREATE INDEX "staff_assignments_client_idx" ON "staff_assignments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "staff_members_org_idx" ON "staff_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "staff_members_tier_idx" ON "staff_members" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "strategic_initiatives_org_idx" ON "strategic_initiatives" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "strategic_initiatives_client_idx" ON "strategic_initiatives" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "strategic_initiatives_status_idx" ON "strategic_initiatives" USING btree ("status");