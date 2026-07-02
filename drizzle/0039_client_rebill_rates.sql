-- Per-client third-party rebill rates for the PS-style monthly invoice
-- generator. Mirrors the existing `support_rate_full_compute_cents`
-- pattern — one nullable integer column per product type. NULL means
-- "fall back to template default"; an explicit value (including 0)
-- overrides.
--
-- Used by ps-product-templates.resolveProductRate() between the
-- license-row lookup and the template default.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "rebill_rate_bitdefender_cents" integer;
--> statement-breakpoint
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "rebill_rate_liongard_cents" integer;
--> statement-breakpoint
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "rebill_rate_titanhq_cents" integer;
--> statement-breakpoint
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "rebill_rate_syncro_remote_cents" integer;
