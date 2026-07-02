CREATE TYPE "public"."client_page_kind" AS ENUM('overview', 'location', 'guide', 'note');--> statement-breakpoint
CREATE TABLE "client_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"parent_page_id" uuid,
	"location_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "client_page_kind" DEFAULT 'note' NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_path" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_pages" ADD CONSTRAINT "client_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_pages" ADD CONSTRAINT "client_pages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_pages" ADD CONSTRAINT "client_pages_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_pages" ADD CONSTRAINT "client_pages_created_by_membership_id_memberships_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_pages_client_idx" ON "client_pages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_pages_parent_idx" ON "client_pages" USING btree ("parent_page_id");--> statement-breakpoint
CREATE INDEX "client_pages_location_idx" ON "client_pages" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_pages_client_slug_unq" ON "client_pages" USING btree ("client_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "client_pages_source_path_unq" ON "client_pages" USING btree ("client_id","source_path");