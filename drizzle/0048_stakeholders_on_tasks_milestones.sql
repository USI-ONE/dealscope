-- Add an optional stakeholder pointer to tasks + milestones so the
-- operator can mark a client-side person on each item (e.g. "Britney
-- is the decision-maker for A-16 — 5-year hardware budget").
--
-- Distinct from assignee_membership_id: assignee is a USI internal
-- member (who's doing the work), stakeholder is a client-side
-- contact (whose input/approval the task hinges on).
--
-- ON DELETE SET NULL — if a stakeholder row is removed from the
-- project, tasks pointing at it just lose the pointer rather than
-- get cascade-deleted.

ALTER TABLE "project_milestones"
  ADD COLUMN "stakeholder_id" uuid
  REFERENCES "project_stakeholders"("id") ON DELETE SET NULL;
CREATE INDEX "project_milestones_stakeholder_idx"
  ON "project_milestones" ("stakeholder_id");

ALTER TABLE "project_tasks"
  ADD COLUMN "stakeholder_id" uuid
  REFERENCES "project_stakeholders"("id") ON DELETE SET NULL;
CREATE INDEX "project_tasks_stakeholder_idx"
  ON "project_tasks" ("stakeholder_id");
