CREATE TABLE "client_tier_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"full_compute" integer DEFAULT 0 NOT NULL,
	"kiosk" integer DEFAULT 0 NOT NULL,
	"virtual_machine" integer DEFAULT 0 NOT NULL,
	"managed_mobile" integer DEFAULT 0 NOT NULL,
	"not_billable" integer DEFAULT 0 NOT NULL,
	"additional_users" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_tier_snapshots" ADD CONSTRAINT "client_tier_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tier_snapshots" ADD CONSTRAINT "client_tier_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_tier_snapshots_client_date_unq" ON "client_tier_snapshots" USING btree ("client_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "client_tier_snapshots_date_idx" ON "client_tier_snapshots" USING btree ("snapshot_date");