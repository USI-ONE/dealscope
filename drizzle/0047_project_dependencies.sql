-- Task + project dependencies (finish-to-start, v1).
--
-- Two tables, one per scope:
--
--   project_task_dependencies     within-project: task A blocked by task B
--   project_dependencies          cross-project: project A blocked by project B
--
-- Direction convention (matches MS Project / Asana):
--   "dependent" is the one that's WAITING. It can't start until
--   "predecessor" finishes. A → B means "A waits for B."
--
-- Cycle protection is enforced in the server actions (walk the
-- predecessor chain BFS before insert and refuse on cycle). We don't
-- enforce it at the DB level because the cycle check needs app-level
-- logic; the DB just provides the integrity backbone (uniqueness,
-- self-reference exclusion, FK cascades).

CREATE TYPE "project_dependency_kind" AS ENUM ('finish_to_start');

CREATE TABLE "project_task_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  -- Denormalized: both tasks belong to this project. Lets us scope
  -- "all dependencies in project X" with a single index hit.
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "dependent_task_id" uuid NOT NULL REFERENCES "project_tasks"("id") ON DELETE CASCADE,
  "predecessor_task_id" uuid NOT NULL REFERENCES "project_tasks"("id") ON DELETE CASCADE,
  "kind" project_dependency_kind NOT NULL DEFAULT 'finish_to_start',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  -- Prevent duplicates: at most one row per (dependent, predecessor).
  CONSTRAINT "project_task_dependencies_unique"
    UNIQUE ("dependent_task_id", "predecessor_task_id"),
  -- A task can't depend on itself.
  CONSTRAINT "project_task_dependencies_no_self_ref"
    CHECK ("dependent_task_id" <> "predecessor_task_id")
);
CREATE INDEX "project_task_deps_project_idx"
  ON "project_task_dependencies" ("project_id");
CREATE INDEX "project_task_deps_dependent_idx"
  ON "project_task_dependencies" ("dependent_task_id");
CREATE INDEX "project_task_deps_predecessor_idx"
  ON "project_task_dependencies" ("predecessor_task_id");

CREATE TABLE "project_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "dependent_project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "predecessor_project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" project_dependency_kind NOT NULL DEFAULT 'finish_to_start',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_dependencies_unique"
    UNIQUE ("dependent_project_id", "predecessor_project_id"),
  CONSTRAINT "project_dependencies_no_self_ref"
    CHECK ("dependent_project_id" <> "predecessor_project_id")
);
CREATE INDEX "project_deps_dependent_idx"
  ON "project_dependencies" ("dependent_project_id");
CREATE INDEX "project_deps_predecessor_idx"
  ON "project_dependencies" ("predecessor_project_id");
CREATE INDEX "project_deps_org_idx"
  ON "project_dependencies" ("organization_id");
