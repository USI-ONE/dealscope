-- Per-client security posture reviews. Each row is a snapshot of the
-- 14-question security checklist taken at one point in time. Operator
-- creates new reviews periodically (typically quarterly); they're
-- append-only so the history shows posture drift.
--
-- Answers live in JSONB so we can evolve the checklist without
-- migrations. Shape:
--   {
--     "sat.training_scheduled": {
--        "status": "yes" | "partial" | "no" | "na",
--        "detail": "free-text platform name, gap, etc.",
--        "autoFilled": boolean   // true = derived from system data at save time
--     },
--     ...one entry per question key from security-checklist-questions.ts
--   }

CREATE TABLE IF NOT EXISTS "client_security_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "review_date" date NOT NULL,
  "reviewed_by_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "next_review_date" date,
  "total_seats" integer,
  "total_devices" integer,
  "answers_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "general_notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csr_client_idx"
  ON "client_security_reviews" ("client_id", "review_date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csr_org_idx"
  ON "client_security_reviews" ("organization_id", "review_date" DESC);
