-- Performance indexes on hot read paths. No schema changes, no data
-- migration — just smarter access patterns for the query plans we
-- already use.
--
-- All CREATE INDEX statements use IF NOT EXISTS so this is idempotent
-- and safe to re-apply. We don't use CONCURRENTLY (it has to run
-- outside a transaction and is overkill at this row volume), but we
-- pick narrow indexes so building them is cheap.

-- 1. client_pages had ZERO indexes. Every runbook page render
--    full-scans this table. Add the indexes we actually filter on.
CREATE INDEX IF NOT EXISTS "client_pages_client_idx"
  ON "client_pages" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_pages_client_active_idx"
  ON "client_pages" ("client_id", "sort_order")
  WHERE "archived_at" IS NULL;
--> statement-breakpoint

-- 2. hardware: the "active devices of one tier for one client" path
--    is hit by the billing math + the security review + the per-client
--    page. Add a covering composite.
CREATE INDEX IF NOT EXISTS "hardware_client_status_tier_idx"
  ON "hardware" ("client_id", "status", "billing_tier");
--> statement-breakpoint

-- 3. vendor_seat_snapshots: per-client latest-per-SKU lookup runs on
--    every client page + billing page + reconciliation. We have
--    seat_snap_client_idx but it doesn't carry captured_at, so the
--    "latest per family" subquery has to sort. Add a covering index.
CREATE INDEX IF NOT EXISTS "seat_snap_client_captured_idx"
  ON "vendor_seat_snapshots" ("client_id", "captured_at" DESC);
--> statement-breakpoint

-- 4. hardware_heartbeats: the new peak-day billing query groups by
--    (billing_tier, heartbeat_date) per client. The existing
--    (client_id, heartbeat_date) index doesn't carry billing_tier so
--    Postgres still has to fetch every row. Wider index pays off.
CREATE INDEX IF NOT EXISTS "hardware_heartbeats_client_tier_date_idx"
  ON "hardware_heartbeats" ("client_id", "billing_tier", "heartbeat_date");
--> statement-breakpoint

-- 5. invoice_lines: "show invoice with all its lines in order" reads
--    every line for one invoice — already covered by
--    invoice_lines_invoice_idx — but the rebill reports also slice by
--    source_kind (license vs service vs client_rebill_rate). Narrow
--    helper.
CREATE INDEX IF NOT EXISTS "invoice_lines_source_idx"
  ON "invoice_lines" ("source_kind", "source_id");
--> statement-breakpoint

-- 6. clients: the org-wide clients list orders by name with a status
--    filter ("active") and an archived filter. Composite helps the
--    common case.
CREATE INDEX IF NOT EXISTS "clients_org_status_name_idx"
  ON "clients" ("organization_id", "status", "name")
  WHERE "archived_at" IS NULL;
