CREATE TYPE "public"."hardware_billing_tier" AS ENUM('full_compute_node', 'kiosk_node', 'virtual_machine_node', 'managed_mobile_device', 'not_billable');--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "billing_tier" "hardware_billing_tier" DEFAULT 'not_billable' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "support_rate_full_compute_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "support_rate_kiosk_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "support_rate_vm_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "support_rate_managed_mobile_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "support_rate_additional_user_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "additional_user_count" integer DEFAULT 0 NOT NULL;