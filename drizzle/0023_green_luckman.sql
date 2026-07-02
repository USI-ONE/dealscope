CREATE TYPE "public"."it_order_attachment_kind" AS ENUM('quote', 'sales_order', 'purchase_order', 'invoice', 'packing_slip', 'approval_evidence', 'configuration_notes', 'completion_evidence', 'other');--> statement-breakpoint
CREATE TYPE "public"."it_order_event_kind" AS ENUM('status_change', 'comment', 'notification_sent', 'file_attached', 'approval_recorded');--> statement-breakpoint
CREATE TYPE "public"."it_order_line_category" AS ENUM('hardware', 'software', 'peripheral', 'service', 'subscription', 'consumable', 'other');--> statement-breakpoint
CREATE TYPE "public"."it_order_status" AS ENUM('draft', 'submitted', 'quoted', 'quote_sent_to_client', 'client_approved', 'ordered', 'received', 'being_configured', 'ready_to_ship', 'shipped', 'delivered', 'complete', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_provisioning_kind" AS ENUM('onboarding', 'offboarding', 'change');--> statement-breakpoint
CREATE TYPE "public"."user_provisioning_status" AS ENUM('draft', 'submitted', 'in_progress', 'ready_for_handoff', 'handed_off', 'cancelled');--> statement-breakpoint
CREATE TABLE "it_order_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "it_order_attachment_kind" DEFAULT 'other' NOT NULL,
	"label" text NOT NULL,
	"url" text,
	"filename" text,
	"mime_type" text,
	"size_bytes" integer,
	"notes" text,
	"uploaded_by_membership_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "it_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "it_order_event_kind" NOT NULL,
	"text" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_membership_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "it_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"category" "it_order_line_category" DEFAULT 'hardware' NOT NULL,
	"description" text NOT NULL,
	"sku" text,
	"vendor_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer,
	"line_total_cents" integer,
	"received_quantity" integer,
	"serials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "it_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ref_code" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"business_justification" text,
	"status" "it_order_status" DEFAULT 'draft' NOT NULL,
	"client_id" uuid,
	"submitted_by_membership_id" uuid,
	"procurement_owner_membership_id" uuid,
	"needed_by_date" timestamp with time zone,
	"purchase_order_number" text,
	"sales_order_number" text,
	"invoice_number" text,
	"vendor_id" uuid,
	"approval_method" text,
	"approval_evidence" text,
	"approved_at" timestamp with time zone,
	"approved_by_name" text,
	"approved_by_email" text,
	"carrier" text,
	"tracking_id" text,
	"tracking_url" text,
	"ship_to_address" text,
	"ship_to_contact" text,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"configuration_summary" text,
	"completion_notes" text,
	"completed_at" timestamp with time zone,
	"estimated_total_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_provisioning_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ref_code" text NOT NULL,
	"kind" "user_provisioning_kind" NOT NULL,
	"status" "user_provisioning_status" DEFAULT 'draft' NOT NULL,
	"client_id" uuid,
	"subject_full_name" text NOT NULL,
	"subject_email" text,
	"subject_title" text,
	"subject_department" text,
	"subject_manager_name" text,
	"subject_manager_email" text,
	"subject_phone" text,
	"subject_location" text,
	"start_date" date,
	"copy_from_user" text,
	"last_day" date,
	"mailbox_disposition" text,
	"mailbox_forward_to" text,
	"hardware_disposition" text,
	"data_retention_plan" text,
	"requested_by_membership_id" uuid,
	"fulfilled_by_membership_id" uuid,
	"notify_recipient_name" text,
	"notify_recipient_email" text,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"notes" text,
	"submitted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"handed_off_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "procurement_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "sales_email" text;--> statement-breakpoint
ALTER TABLE "it_order_attachments" ADD CONSTRAINT "it_order_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_attachments" ADD CONSTRAINT "it_order_attachments_order_id_it_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."it_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_attachments" ADD CONSTRAINT "it_order_attachments_uploaded_by_membership_id_memberships_id_fk" FOREIGN KEY ("uploaded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_events" ADD CONSTRAINT "it_order_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_events" ADD CONSTRAINT "it_order_events_order_id_it_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."it_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_events" ADD CONSTRAINT "it_order_events_by_membership_id_memberships_id_fk" FOREIGN KEY ("by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_lines" ADD CONSTRAINT "it_order_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_lines" ADD CONSTRAINT "it_order_lines_order_id_it_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."it_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_order_lines" ADD CONSTRAINT "it_order_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_orders" ADD CONSTRAINT "it_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_orders" ADD CONSTRAINT "it_orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_orders" ADD CONSTRAINT "it_orders_submitted_by_membership_id_memberships_id_fk" FOREIGN KEY ("submitted_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_orders" ADD CONSTRAINT "it_orders_procurement_owner_membership_id_memberships_id_fk" FOREIGN KEY ("procurement_owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "it_orders" ADD CONSTRAINT "it_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_requested_by_membership_id_memberships_id_fk" FOREIGN KEY ("requested_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_provisioning_requests" ADD CONSTRAINT "user_provisioning_requests_fulfilled_by_membership_id_memberships_id_fk" FOREIGN KEY ("fulfilled_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "it_order_attachments_order_idx" ON "it_order_attachments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "it_order_events_order_idx" ON "it_order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "it_order_lines_order_idx" ON "it_order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "it_orders_org_idx" ON "it_orders" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "it_orders_status_idx" ON "it_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "it_orders_client_idx" ON "it_orders" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "it_orders_ref_code_uq" ON "it_orders" USING btree ("organization_id","ref_code");--> statement-breakpoint
CREATE INDEX "user_provisioning_requests_org_idx" ON "user_provisioning_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_provisioning_requests_status_idx" ON "user_provisioning_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_provisioning_requests_client_idx" ON "user_provisioning_requests" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_provisioning_requests_ref_code_uq" ON "user_provisioning_requests" USING btree ("organization_id","ref_code");