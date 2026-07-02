CREATE TYPE "public"."service_category" AS ENUM('internet', 'phone_voice', 'voip', 'cellular', 'backup', 'cameras', 'alarm', 'physical_security', 'mdm', 'dns', 'domain_registrar', 'web_hosting', 'email_hosting', 'fax', 'printing', 'electric_utility', 'gas_utility', 'water_utility', 'saas', 'other');--> statement-breakpoint
CREATE TYPE "public"."service_paid_by" AS ENUM('usi', 'client_direct');--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "category" "service_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "paid_by" "service_paid_by" DEFAULT 'usi' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "account_number" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "support_phone" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "support_email" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "support_portal_url" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "vendor_contact_name" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "vendor_contact_phone" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "vendor_contact_email" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "login_username" text;--> statement-breakpoint
CREATE INDEX "services_category_idx" ON "services" USING btree ("category");