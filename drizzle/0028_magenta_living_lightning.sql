CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"registrar" text,
	"vendor_id" uuid,
	"registrar_service_id" uuid,
	"expires_at" date,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"billable" boolean DEFAULT false NOT NULL,
	"rebill_rate_cents" integer,
	"one_password_item_url" text,
	"notes" text,
	"audited_at" timestamp with time zone,
	"audited_by_membership_id" uuid,
	"validated_at" timestamp with time zone,
	"validated_by_membership_id" uuid,
	"billing_reconciled_at" timestamp with time zone,
	"billing_reconciled_by_membership_id" uuid,
	"owner_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "audited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "audited_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "validated_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "billing_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "billing_reconciled_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "owner_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "renewal_date" date;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "auto_renew" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "audited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "audited_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "validated_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "billing_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "billing_reconciled_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "owner_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_registrar_service_id_services_id_fk" FOREIGN KEY ("registrar_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domains_org_idx" ON "domains" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "domains_client_idx" ON "domains" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "domains_name_idx" ON "domains" USING btree ("name");--> statement-breakpoint
CREATE INDEX "domains_expires_idx" ON "domains" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "licenses_renewal_idx" ON "licenses" USING btree ("renewal_date");--> statement-breakpoint
CREATE INDEX "services_renewal_idx" ON "services" USING btree ("renewal_date");