-- Stakeholder sign-off for tasks + milestones.
--
-- Model: each task/milestone CAN require explicit sign-off from a
-- client-side stakeholder before it's truly considered closed. When
-- requires_signoff=true and the row is marked "done"/"completed" but
-- has no signed_off_at, it's in a pending sign-off state — the UI
-- shows an amber "Awaiting Britney's sign-off" badge.
--
-- The operator records the sign-off on the client's behalf (USI is
-- the system of record; we don't have a client portal yet). The
-- recorded fields are: who signed off, when, optional notes.
--
-- ON DELETE SET NULL on signed_off_by_stakeholder_id — if the
-- stakeholder is later removed from the project, the sign-off
-- audit trail survives but the FK clears.

ALTER TABLE "project_tasks"
  ADD COLUMN "requires_signoff" boolean NOT NULL DEFAULT false;
ALTER TABLE "project_tasks"
  ADD COLUMN "signed_off_at" timestamp with time zone;
ALTER TABLE "project_tasks"
  ADD COLUMN "signed_off_by_stakeholder_id" uuid
  REFERENCES "project_stakeholders"("id") ON DELETE SET NULL;
ALTER TABLE "project_tasks"
  ADD COLUMN "signoff_notes" text;

ALTER TABLE "project_milestones"
  ADD COLUMN "requires_signoff" boolean NOT NULL DEFAULT false;
ALTER TABLE "project_milestones"
  ADD COLUMN "signed_off_at" timestamp with time zone;
ALTER TABLE "project_milestones"
  ADD COLUMN "signed_off_by_stakeholder_id" uuid
  REFERENCES "project_stakeholders"("id") ON DELETE SET NULL;
ALTER TABLE "project_milestones"
  ADD COLUMN "signoff_notes" text;
