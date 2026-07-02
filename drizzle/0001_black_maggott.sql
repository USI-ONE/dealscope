ALTER TABLE "clients" ADD COLUMN "support_baseline_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "support_rate_per_node_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "support_billable_hardware_kinds" jsonb DEFAULT '["server","workstation","laptop"]'::jsonb NOT NULL;