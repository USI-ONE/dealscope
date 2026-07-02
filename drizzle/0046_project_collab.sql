-- PM tool v1.1 — stakeholders, milestone assignees, comments, attachments.
--
-- All four additions are forward-compatible: no existing column changes,
-- nullable scope FKs everywhere, and the v1 UI continues to render
-- correctly against an empty set of stakeholders/comments/attachments.

-- 1. Add assignee_membership_id to milestones (matches the existing
--    column on project_tasks).
ALTER TABLE "project_milestones"
  ADD COLUMN "assignee_membership_id" uuid
  REFERENCES "memberships"("id") ON DELETE SET NULL;
CREATE INDEX "project_milestones_assignee_idx"
  ON "project_milestones" ("assignee_membership_id");

-- 2. project_stakeholders — client-side people on the project.
--    Distinct from `memberships` (those are USI internal users).
--    Each row is a contact at the client. is_primary surfaces the
--    single "go-to" contact in the project header.
CREATE TABLE "project_stakeholders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "title" text,
  "email" text,
  "phone" text,
  -- Free-form label like "Sponsor", "Technical lead", "Finance contact".
  "role_label" text,
  "is_primary" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "project_stakeholders_project_idx"
  ON "project_stakeholders" ("project_id");

-- 3. project_comments — flat discussion thread, scoped to project /
--    milestone / task. Exactly one of (milestone_id, task_id) is set
--    OR both are NULL (project-level comment). Threading is OUT of
--    scope for v1 — easy to add later via parent_comment_id.
--
--    client_visible defaults FALSE: comments are operator notes
--    unless explicitly flagged for the client report.
CREATE TABLE "project_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "milestone_id" uuid REFERENCES "project_milestones"("id") ON DELETE CASCADE,
  "task_id" uuid REFERENCES "project_tasks"("id") ON DELETE CASCADE,
  "author_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "body_md" text NOT NULL,
  "client_visible" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "project_comments_project_idx" ON "project_comments" ("project_id");
CREATE INDEX "project_comments_task_idx" ON "project_comments" ("task_id");
CREATE INDEX "project_comments_milestone_idx" ON "project_comments" ("milestone_id");

-- 4. project_attachments — file references. URL-based for v1: operator
--    uploads to SharePoint / OneDrive / Drive / etc. and pastes the
--    link. file_url is required. Same scope shape as comments: project,
--    or milestone, or task, or attached to a specific comment.
CREATE TABLE "project_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "milestone_id" uuid REFERENCES "project_milestones"("id") ON DELETE CASCADE,
  "task_id" uuid REFERENCES "project_tasks"("id") ON DELETE CASCADE,
  "comment_id" uuid REFERENCES "project_comments"("id") ON DELETE CASCADE,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size_bytes" bigint,
  "file_mime_type" text,
  -- Short caption shown next to the link.
  "description" text,
  "uploaded_by_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "client_visible" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "project_attachments_project_idx" ON "project_attachments" ("project_id");
CREATE INDEX "project_attachments_task_idx" ON "project_attachments" ("task_id");
CREATE INDEX "project_attachments_milestone_idx" ON "project_attachments" ("milestone_id");
CREATE INDEX "project_attachments_comment_idx" ON "project_attachments" ("comment_id");
