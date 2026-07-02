CREATE TYPE "public"."change_request_environment" AS ENUM('internal', 'client');--> statement-breakpoint
CREATE TYPE "public"."change_request_evidence_kind" AS ENUM('approval_record', 'pre_change_snapshot', 'post_change_snapshot', 'log', 'screenshot', 'validation_result', 'rollback_evidence', 'communication', 'other');--> statement-breakpoint
CREATE TYPE "public"."change_request_impact" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."change_request_likelihood" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."change_request_outcome" AS ENUM('successful', 'successful_with_issues', 'rolled_back', 'failed');--> statement-breakpoint
CREATE TYPE "public"."change_request_rating" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."change_request_type" AS ENUM('standard', 'normal', 'emergency');--> statement-breakpoint
CREATE TABLE "change_request_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"change_request_id" uuid NOT NULL,
	"kind" "change_request_evidence_kind" DEFAULT 'other' NOT NULL,
	"label" text NOT NULL,
	"url" text,
	"notes" text,
	"captured_by_membership_id" uuid,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standard_change_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"runbook_steps" text,
	"validation_steps" text,
	"rollback_steps" text,
	"default_risk_rating" "change_request_rating" DEFAULT 'low' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_requests" ALTER COLUMN "post_review_outcome" SET DATA TYPE change_request_outcome USING post_review_outcome::change_request_outcome;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "change_type" "change_request_type" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "environment" "change_request_environment" DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "risk_impact" "change_request_impact" DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "risk_likelihood" "change_request_likelihood" DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "risk_rating" "change_request_rating" DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "cab_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "pir_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "standard_change_catalog_id" uuid;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "validation_plan" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "implementer_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "change_manager_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "system_owner_name" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "system_owner_email" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "communications_log" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "pir_planned_vs_actual" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "pir_root_cause" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "pir_preventive_actions" text;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "documentation_updated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "change_requests" ADD COLUMN "related_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "change_request_evidence" ADD CONSTRAINT "change_request_evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_evidence" ADD CONSTRAINT "change_request_evidence_change_request_id_change_requests_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."change_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_request_evidence" ADD CONSTRAINT "change_request_evidence_captured_by_membership_id_memberships_id_fk" FOREIGN KEY ("captured_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_change_catalog" ADD CONSTRAINT "standard_change_catalog_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_request_evidence_cr_idx" ON "change_request_evidence" USING btree ("change_request_id");--> statement-breakpoint
CREATE INDEX "standard_change_catalog_org_idx" ON "standard_change_catalog" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "standard_change_catalog_code_uq" ON "standard_change_catalog" USING btree ("organization_id","code");--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_standard_change_catalog_id_standard_change_catalog_id_fk" FOREIGN KEY ("standard_change_catalog_id") REFERENCES "public"."standard_change_catalog"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_implementer_membership_id_memberships_id_fk" FOREIGN KEY ("implementer_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_change_manager_membership_id_memberships_id_fk" FOREIGN KEY ("change_manager_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_requests_type_idx" ON "change_requests" USING btree ("change_type");