CREATE TYPE "public"."change_request_risk" AS ENUM('low', 'standard', 'high', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('draft', 'submitted', 'in_review', 'approved', 'rejected', 'scheduled', 'in_progress', 'implemented', 'reviewed', 'rolled_back', 'cancelled');--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"ref_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"business_justification" text,
	"risk_class" "change_request_risk" DEFAULT 'standard' NOT NULL,
	"status" "change_request_status" DEFAULT 'draft' NOT NULL,
	"implementation_plan" text,
	"rollback_plan" text,
	"test_plan" text,
	"communication_plan" text,
	"affected_systems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_downtime_minutes" integer,
	"impact_statement" text,
	"requested_by_membership_id" uuid,
	"submitted_at" timestamp with time zone,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"approvers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"post_review_outcome" text,
	"post_review_issues" text,
	"post_review_lessons" text,
	"reviewed_by_membership_id" uuid,
	"reviewed_at" timestamp with time zone,
	"linked_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_membership_id_memberships_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_reviewed_by_membership_id_memberships_id_fk" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_linked_event_id_client_events_id_fk" FOREIGN KEY ("linked_event_id") REFERENCES "public"."client_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_requests_client_idx" ON "change_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "change_requests_status_idx" ON "change_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "change_requests_ref_code_uq" ON "change_requests" USING btree ("organization_id","ref_code");