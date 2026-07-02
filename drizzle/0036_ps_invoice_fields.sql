-- PS-style invoice fields:
--   invoices       — header fields (P.O., Ship-To, Rep, VIA, Terms, service period)
--   invoice_lines  — location_id, sku (first-class), long_description (multi-line
--                    bulleted body), is_section_header + section_label
-- All additive + nullable so the existing buildMonthlyContractInvoice +
-- hardware-invoice-from-order flows keep working without code changes
-- until they're migrated.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "po_number"              text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ship_to_label"          text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ship_to_line1"          text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ship_to_line2"          text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ship_to_city"           text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ship_to_region"         text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ship_to_postal_code"    text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ship_to_country"        text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "ordered_by"             text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pickup_by"              text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "rep"                    text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "via"                    text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "terms_label"            text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "service_period_label"   text;
--> statement-breakpoint

ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "location_id"        uuid REFERENCES "client_locations"("id") ON DELETE SET NULL;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "sku"                text;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "long_description"   text;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "is_section_header"  boolean NOT NULL DEFAULT false;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "section_label"      text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invoice_lines_location_idx"
  ON "invoice_lines" ("location_id");
