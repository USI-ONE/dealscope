CREATE TYPE "public"."procedure_kind" AS ENUM('onboarding', 'offboarding', 'password_rotation', 'firmware_update', 'cert_renewal', 'dr_test', 'incident_response', 'audit', 'monthly_review', 'quarterly_review', 'annual_review', 'other');--> statement-breakpoint
CREATE TYPE "public"."procedure_run_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TABLE "client_procedure_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"procedure_id" uuid NOT NULL,
	"status" "procedure_run_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"started_by_membership_id" uuid,
	"step_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome_notes" text,
	"duration_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "procedure_kind" DEFAULT 'other' NOT NULL,
	"description" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_membership_id" uuid,
	"schedule_notes" text,
	"last_run_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_procedure_runs" ADD CONSTRAINT "client_procedure_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_procedure_runs" ADD CONSTRAINT "client_procedure_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_procedure_runs" ADD CONSTRAINT "client_procedure_runs_procedure_id_client_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."client_procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_procedure_runs" ADD CONSTRAINT "client_procedure_runs_started_by_membership_id_memberships_id_fk" FOREIGN KEY ("started_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_procedures" ADD CONSTRAINT "client_procedures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_procedures" ADD CONSTRAINT "client_procedures_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_procedures" ADD CONSTRAINT "client_procedures_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_procedure_runs_procedure_idx" ON "client_procedure_runs" USING btree ("procedure_id");--> statement-breakpoint
CREATE INDEX "client_procedure_runs_client_idx" ON "client_procedure_runs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_procedure_runs_started_idx" ON "client_procedure_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "client_procedures_client_idx" ON "client_procedures" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_procedures_kind_idx" ON "client_procedures" USING btree ("kind");