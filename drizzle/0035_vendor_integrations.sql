-- Multi-vendor integration schema:
--   vendor_connections      — per-org credentials for each external SaaS
--   vendor_client_mappings  — vendor tenant id → TechOS client
--   vendor_seat_snapshots   — append-only seat counts from periodic syncs

DO $$ BEGIN
  CREATE TYPE "public"."vendor_connection_kind" AS ENUM (
    'syncro',
    'liongard',
    'bitdefender_gravityzone',
    'acronis_cyber_cloud',
    'titanhq',
    'microsoft_csp',
    'huntress',
    'threatlocker',
    'datto_rmm'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."vendor_connection_status" AS ENUM (
    'not_configured',
    'configured',
    'connected',
    'failed',
    'disabled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_connections" (
  "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"          uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "kind"                     "vendor_connection_kind" NOT NULL,
  "display_name"             text NOT NULL,
  "vendor_id"                uuid REFERENCES "vendors"("id") ON DELETE SET NULL,
  "config_json"              jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status"                   "vendor_connection_status" NOT NULL DEFAULT 'not_configured',
  "last_sync_started_at"     timestamptz,
  "last_sync_at"             timestamptz,
  "last_sync_message"        text,
  "enabled"                  boolean NOT NULL DEFAULT true,
  "created_at"               timestamptz NOT NULL DEFAULT now(),
  "updated_at"               timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_conn_org_kind_unq"
  ON "vendor_connections" ("organization_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_conn_org_idx"
  ON "vendor_connections" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_client_mappings" (
  "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"             uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vendor_connection_id"        uuid NOT NULL REFERENCES "vendor_connections"("id") ON DELETE CASCADE,
  "vendor_client_identifier"    text NOT NULL,
  "vendor_client_name"          text NOT NULL,
  "client_id"                   uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "vendor_client_url"           text,
  "created_at"                  timestamptz NOT NULL DEFAULT now(),
  "updated_at"                  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_client_map_conn_ident_unq"
  ON "vendor_client_mappings" ("vendor_connection_id", "vendor_client_identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_client_map_client_idx"
  ON "vendor_client_mappings" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendor_client_map_org_idx"
  ON "vendor_client_mappings" ("organization_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_seat_snapshots" (
  "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"             uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "vendor_connection_id"        uuid NOT NULL REFERENCES "vendor_connections"("id") ON DELETE CASCADE,
  "vendor_client_identifier"    text NOT NULL,
  "vendor_client_name"          text NOT NULL,
  "client_id"                   uuid REFERENCES "clients"("id") ON DELETE SET NULL,
  "product_sku"                 text NOT NULL,
  "product_name"                text NOT NULL,
  "seats"                       integer NOT NULL,
  "cost_per_seat_cents"         integer,
  "period_start"                timestamptz,
  "period_end"                  timestamptz,
  "captured_at"                 timestamptz NOT NULL DEFAULT now(),
  "raw_response"                jsonb
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "seat_snap_conn_idx"
  ON "vendor_seat_snapshots" ("vendor_connection_id", "captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seat_snap_client_idx"
  ON "vendor_seat_snapshots" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seat_snap_product_idx"
  ON "vendor_seat_snapshots" ("vendor_connection_id", "vendor_client_identifier", "product_sku", "captured_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seat_snap_org_idx"
  ON "vendor_seat_snapshots" ("organization_id");
