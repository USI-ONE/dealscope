ALTER TYPE "public"."procedure_kind" ADD VALUE 'device_onboarding' BEFORE 'password_rotation';--> statement-breakpoint
ALTER TYPE "public"."procedure_kind" ADD VALUE 'device_offboarding' BEFORE 'password_rotation';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "autoelevate_status" text;