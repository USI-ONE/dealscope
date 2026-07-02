-- Voice / phone service runbook tables.
--
-- One client_id can have one voice_services row (e.g. their RingCentral
-- account). Underneath it: per-site config, per-user extensions, DID
-- inventory, and call-flow structures (queues / IVRs / auto-attendants /
-- hunt groups). The shape generalizes across RingCentral, MS Teams
-- Voice, 8x8, Zoom Phone, etc.
--
-- All tables are organization-scoped + client-scoped so they can be
-- safely listed per-client and never bleed across.

CREATE TABLE IF NOT EXISTS "voice_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,                  -- "RingCentral", "Microsoft Teams Voice", "8x8", etc.
  "provider_tier" text,                       -- "Advanced", "Premium", etc.
  "account_uid" text,                         -- vendor account ID
  "customer_account_number" text,             -- on the vendor's billing side
  "status" text NOT NULL DEFAULT 'planning', -- 'planning' | 'porting' | 'live' | 'deprecated'
  "go_live_date" date,
  "sales_agreement_url" text,
  "sow_url" text,
  "monday_board_url" text,
  "lucidchart_url" text,
  "drive_url" text,
  "porting_link_url" text,
  "usi_pm_membership_id" uuid REFERENCES "memberships"("id") ON DELETE SET NULL,
  "vendor_pm_name" text,
  "vendor_pm_email" text,
  "vendor_pm_phone" text,
  "vendor_engineer_name" text,
  "vendor_engineer_email" text,
  "vendor_engineer_phone" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "voice_services_client_unq"
  ON "voice_services" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_services_org_idx"
  ON "voice_services" ("organization_id");
--> statement-breakpoint

-- Per-site voice config. site_name is the raw string from the BRD;
-- location_id links to client_locations when we can fuzzy-match the
-- name, else NULL (operator can link later via UI).
CREATE TABLE IF NOT EXISTS "voice_sites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "voice_service_id" uuid NOT NULL REFERENCES "voice_services"("id") ON DELETE CASCADE,
  "location_id" uuid REFERENCES "client_locations"("id") ON DELETE SET NULL,
  "site_name" text NOT NULL,
  "main_phone" text,
  "outbound_caller_id_name" text,
  "hours_of_operation" text,
  "timezone" text,
  "emergency_response_location_nickname" text,
  "shipping_address" text,
  "deployment_date" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_sites_client_idx"
  ON "voice_sites" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_sites_service_idx"
  ON "voice_sites" ("voice_service_id");
--> statement-breakpoint

-- Per-user extension. One row per assigned extension (User, Fax,
-- VirtualUser). Optionally linked to a memberships row when the
-- user is internal, or just held as free-form contact data for
-- client-owned users.
CREATE TABLE IF NOT EXISTS "voice_extensions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "voice_service_id" uuid NOT NULL REFERENCES "voice_services"("id") ON DELETE CASCADE,
  "voice_site_id" uuid REFERENCES "voice_sites"("id") ON DELETE SET NULL,
  "ext_number" text,                          -- "1001"
  "did_number" text,                          -- "1 (660) 362-1347"
  "first_name" text,
  "last_name" text,
  "email" text,
  "user_type" text,                           -- "User (RingEX)" | "Fax (eFax)" | "VirtualUser"
  "role" text,                                -- "Super Admin" | "Standard"
  "template" text,
  "department" text,
  "job_title" text,
  "device_type" text,                         -- "Mitel IP480G" | "Yealink T54W" | "Polycom VVX450"
  "device_mac" text,
  "ringsense_enabled" boolean NOT NULL DEFAULT false,
  "ringsense_role" text,
  "ms_teams" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_extensions_client_idx"
  ON "voice_extensions" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_extensions_site_idx"
  ON "voice_extensions" ("voice_site_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_extensions_did_idx"
  ON "voice_extensions" ("did_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_extensions_ext_idx"
  ON "voice_extensions" ("voice_service_id", "ext_number");
--> statement-breakpoint

-- DID / number inventory. Includes porting metadata so we can track
-- numbers in flight.
CREATE TABLE IF NOT EXISTS "voice_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "voice_service_id" uuid NOT NULL REFERENCES "voice_services"("id") ON DELETE CASCADE,
  "voice_site_id" uuid REFERENCES "voice_sites"("id") ON DELETE SET NULL,
  "did_number" text NOT NULL,                 -- the DID (or main number)
  "number_type" text,                         -- "Local US" | "Toll-Free" | "Fax"
  "rc_number_type" text,                      -- "User" | "Main" | "Queue" | "AutoAttendant"
  "ext_number" text,                          -- extension assigned to this DID
  "temp_rc_number" text,                      -- pre-port RC-issued temp #
  "losing_carrier" text,                      -- previous provider
  "billing_phone_number" text,                -- the BTN on the carrier
  "carrier_account_number" text,
  "authorized_user" text,                     -- person on the LOA
  "porting_date" date,
  "status" text NOT NULL DEFAULT 'pending',   -- 'pending' | 'porting' | 'active' | 'released'
  "service_address" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_numbers_client_idx"
  ON "voice_numbers" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_numbers_did_idx"
  ON "voice_numbers" ("did_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_numbers_status_idx"
  ON "voice_numbers" ("voice_service_id", "status");
--> statement-breakpoint

-- Call-flow structures: call queues, IVRs, auto-attendants, hunt
-- groups. Single table with a 'kind' discriminator so the UI can
-- render each section as a list.
CREATE TABLE IF NOT EXISTS "voice_flows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "voice_service_id" uuid NOT NULL REFERENCES "voice_services"("id") ON DELETE CASCADE,
  "voice_site_id" uuid REFERENCES "voice_sites"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,                       -- 'call_queue' | 'ivr' | 'auto_attendant' | 'hunt_group'
  "name" text NOT NULL,
  "ext_number" text,
  "did_number" text,
  "greeting_text" text,
  "business_hours_handler" text,
  "after_hours_handler" text,
  "member_extensions_json" jsonb,             -- array of ext strings
  "routing_options_json" jsonb,               -- raw kind-specific config blob
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_flows_client_idx"
  ON "voice_flows" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_flows_kind_idx"
  ON "voice_flows" ("voice_service_id", "kind");
