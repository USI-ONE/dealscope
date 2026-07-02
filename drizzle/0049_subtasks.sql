-- Subtasks — single-level nesting on project_tasks.
--
-- A row with parent_task_id IS NULL is a top-level "task." A row with
-- parent_task_id NOT NULL is a "subtask" of that parent. The server
-- action enforces the one-level limit: a task can have a parent OR
-- children, not both — so we never end up with sub-subtasks.
--
-- ON DELETE CASCADE: deleting a parent task deletes its subtasks.
-- That matches operator intent — subtasks are not standalone work
-- items, they're a decomposition of their parent.

ALTER TABLE "project_tasks"
  ADD COLUMN "parent_task_id" uuid
  REFERENCES "project_tasks"("id") ON DELETE CASCADE;

CREATE INDEX "project_tasks_parent_idx"
  ON "project_tasks" ("parent_task_id");
