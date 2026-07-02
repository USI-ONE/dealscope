-- Per-system credential audit tracking. Every voice_service and every
-- internet circuit gets fields for:
--   • a 1Password item URL (where the operating creds live)
--   • last_audited_at + last_audited_by_membership_id + notes
--
-- USI's rule: credentials must be verified working every 30 days. The
-- UI flags anything older than 30 days as overdue and surfaces it on
-- /upcoming for the daily punch list.
--
-- client_network_circuits already has one_password_item_url; we only
-- add the audit columns there. voice_services gets both.

ALTER TABLE "voice_services"
  ADD COLUMN IF NOT EXISTS "one_password_item_url" text;
--> statement-breakpoint
ALTER TABLE "voice_services"
  ADD COLUMN IF NOT EXISTS "last_audited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "voice_services"
  ADD COLUMN IF NOT EXISTS "last_audited_by_membership_id" uuid
    REFERENCES "memberships"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "voice_services"
  ADD COLUMN IF NOT EXISTS "last_audit_notes" text;
--> statement-breakpoint

ALTER TABLE "client_network_circuits"
  ADD COLUMN IF NOT EXISTS "last_audited_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "client_network_circuits"
  ADD COLUMN IF NOT EXISTS "last_audited_by_membership_id" uuid
    REFERENCES "memberships"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "client_network_circuits"
  ADD COLUMN IF NOT EXISTS "last_audit_notes" text;
--> statement-breakpoint

-- Surface audit-due lookups quickly: when did each system last get
-- audited? Index lets /upcoming find overdue ones with a single sort.
CREATE INDEX IF NOT EXISTS "voice_services_audit_idx"
  ON "voice_services" ("last_audited_at" NULLS FIRST);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circuits_audit_idx"
  ON "client_network_circuits" ("last_audited_at" NULLS FIRST);
