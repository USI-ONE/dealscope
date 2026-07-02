-- Add ingram_micro to the vendor_connection_kind enum so we can store
-- credentials for Ingram Micro's Cloud Marketplace (CMP) API. This is
-- USI's CSP distributor for Microsoft 365 — the Ingram API is the
-- authoritative source for what USI is billed for each month and the
-- per-customer M365 seat counts that flow into the PS invoice.

ALTER TYPE "public"."vendor_connection_kind" ADD VALUE IF NOT EXISTS 'ingram_micro';
