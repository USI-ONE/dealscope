-- Project Management v1 — MSP-focused PM tool inside TechOS.
-- Per the operator's v1 scope decision: milestones + task completion,
-- no time entries yet. Time entries can attach later without touching
-- this migration.

CREATE TYPE "project_status" AS ENUM (
  'planning',
  'in_progress',
  'on_hold',
  'blocked',
  'completed',
  'cancelled'
);

CREATE TYPE "project_health" AS ENUM ('green', 'amber', 'red');

CREATE TYPE "project_priority" AS ENUM (
  'low',
  'normal',
  'high',
  'critical'
);

CREATE TYPE "project_kind" AS ENUM (
  'm365_migration',
  'win11_rollout',
  'server_replacement',
  'network_refresh',
  'onboarding',
  'security_baseline',
  'eol_refresh',
  'cybersecurity_audit',
  'custom'
);

CREATE TYPE "project_milestone_status" AS ENUM (
  'planned',
  'in_progress',
  'completed',
  'missed'
);

CREATE TYPE "project_task_status" AS ENUM (
  'todo',
  'in_progress',
  'blocked',
  'done',
  'cancelled'
);

CREATE TYPE "project_status_update_kind" AS ENUM (
  'status',
  'risk',
  'decision',
  'note'
);

CREATE TYPE "project_document_kind" AS ENUM (
  'deliverable',
  'runbook',
  'meeting_notes',
  'risk_log',
  'scope',
  'other'
);

CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" project_kind NOT NULL DEFAULT 'custom',
  "status" project_status NOT NULL DEFAULT 'planning',
  "health" project_health NOT NULL DEFAULT 'green',
  "priority" project_priority NOT NULL DEFAULT 'normal',
  "summary" text,
  "scope_md" text,
  "primary_pm_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "lead_engineer_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "planned_start_date" date,
  "planned_end_date" date,
  "actual_start_date" date,
  "actual_end_date" date,
  "budget_cents" integer,
  "contract_type_label" text,
  "total_estimated_hours" integer,
  "total_actual_hours" integer,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "projects_org_idx" ON "projects" ("organization_id");
CREATE INDEX "projects_client_idx" ON "projects" ("client_id");
CREATE INDEX "projects_status_idx" ON "projects" ("status");
CREATE INDEX "projects_code_idx" ON "projects" ("organization_id", "code");

CREATE TABLE "project_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "target_date" date,
  "completed_at" timestamp with time zone,
  "status" project_milestone_status NOT NULL DEFAULT 'planned',
  "position" integer NOT NULL DEFAULT 0,
  "client_visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "project_milestones_project_idx" ON "project_milestones" ("project_id");

CREATE TABLE "project_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "milestone_id" uuid REFERENCES "project_milestones"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text,
  "status" project_task_status NOT NULL DEFAULT 'todo',
  "assignee_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "due_date" date,
  "completed_at" timestamp with time zone,
  "estimated_hours" integer,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" ("project_id");
CREATE INDEX "project_tasks_milestone_idx" ON "project_tasks" ("milestone_id");
CREATE INDEX "project_tasks_assignee_idx" ON "project_tasks" ("assignee_membership_id");

CREATE TABLE "project_status_updates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "author_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "kind" project_status_update_kind NOT NULL DEFAULT 'status',
  "health_at_post" project_health NOT NULL,
  "body" text NOT NULL,
  "client_visible" boolean NOT NULL DEFAULT true,
  "posted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "project_status_updates_project_idx" ON "project_status_updates" ("project_id");
CREATE INDEX "project_status_updates_posted_idx" ON "project_status_updates" ("posted_at");

CREATE TABLE "project_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" project_document_kind NOT NULL DEFAULT 'other',
  "title" text NOT NULL,
  "body_md" text,
  "file_url" text,
  "file_mime_type" text,
  "uploaded_by_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "client_visible" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "project_documents_project_idx" ON "project_documents" ("project_id");
