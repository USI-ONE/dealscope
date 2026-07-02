-- Add 'source' + 'external_id' to vendor_bills so we can distinguish
-- bills auto-pulled from a vendor's API (Ingram Reseller, future
-- Acronis billing API, etc.) from bills uploaded by hand as PDFs.
--
-- The Ingram invoice sync uses (organization_id, vendor_id,
-- external_id) as its dedup key — Ingram's invoice_number is reused
-- across orgs in their database (it's a sequence on their side, not
-- a per-reseller key), so we scope by vendor + org. external_id
-- stores the canonical Ingram invoice_number for traceability.

ALTER TABLE "vendor_bills"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual_upload';
--> statement-breakpoint
ALTER TABLE "vendor_bills"
  ADD COLUMN IF NOT EXISTS "external_id" text;
--> statement-breakpoint
ALTER TABLE "vendor_bills"
  ADD COLUMN IF NOT EXISTS "external_metadata_json" jsonb;
--> statement-breakpoint
-- Idempotent upsert key for API-sourced bills. NULL external_id rows
-- (manual uploads) are excluded so the existing flow is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "vbills_org_vendor_external_id_unq"
  ON "vendor_bills" ("organization_id", "vendor_id", "external_id")
  WHERE "external_id" IS NOT NULL;
--> statement-breakpoint
-- Faster filtering on the bills list page when the user wants to see
-- only API-sourced bills or only manual uploads.
CREATE INDEX IF NOT EXISTS "vbills_source_idx"
  ON "vendor_bills" ("organization_id", "source");
