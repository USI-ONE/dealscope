ALTER TABLE "hardware" ADD COLUMN "not_on_contract" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "is_kiosk" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "autoelevate_status" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "intune_enrolled" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "entra_joined" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "threatlocker_running" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "windows11_readiness" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "customer_asset_tag" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "usi_asset_tag" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "splashtop_uuid" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "local_administrators" text;--> statement-breakpoint
ALTER TABLE "hardware" ADD COLUMN "imei" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "latest_csat" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "latest_csat_comment" text;