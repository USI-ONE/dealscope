CREATE TYPE "public"."client_event_kind" AS ENUM('change', 'incident', 'maintenance', 'discovery', 'risk_resolution', 'outage', 'deployment', 'other');--> statement-breakpoint
CREATE TYPE "public"."client_event_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."recurring_task_kind" AS ENUM('review', 'audit', 'renewal', 'maintenance', 'compliance', 'other');--> statement-breakpoint
CREATE TABLE "client_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "client_event_kind" DEFAULT 'change' NOT NULL,
	"severity" "client_event_severity" DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"narrative" text,
	"root_cause" text,
	"resolution" text,
	"duration_minutes" integer,
	"affected_systems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recorded_by_membership_id" uuid,
	"resolved_at" timestamp with time zone,
	"procedure_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_recurring_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "recurring_task_kind" DEFAULT 'other' NOT NULL,
	"cadence_days" integer DEFAULT 90 NOT NULL,
	"next_due_at" timestamp with time zone NOT NULL,
	"last_done_at" timestamp with time zone,
	"owner_membership_id" uuid,
	"procedure_id" uuid,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_events" ADD CONSTRAINT "client_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_events" ADD CONSTRAINT "client_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_events" ADD CONSTRAINT "client_events_recorded_by_membership_id_memberships_id_fk" FOREIGN KEY ("recorded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_events" ADD CONSTRAINT "client_events_procedure_run_id_client_procedure_runs_id_fk" FOREIGN KEY ("procedure_run_id") REFERENCES "public"."client_procedure_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recurring_tasks" ADD CONSTRAINT "client_recurring_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recurring_tasks" ADD CONSTRAINT "client_recurring_tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recurring_tasks" ADD CONSTRAINT "client_recurring_tasks_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_recurring_tasks" ADD CONSTRAINT "client_recurring_tasks_procedure_id_client_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."client_procedures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_events_client_idx" ON "client_events" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_events_occurred_idx" ON "client_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "client_events_kind_idx" ON "client_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "client_recurring_tasks_client_idx" ON "client_recurring_tasks" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_recurring_tasks_due_idx" ON "client_recurring_tasks" USING btree ("next_due_at");