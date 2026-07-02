CREATE TYPE "public"."app_registration_cred_status" AS ENUM('current', 'expiring_soon', 'expired', 'no_secret', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."app_registration_status" AS ENUM('active', 'stale', 'to_review', 'to_remove', 'removed');--> statement-breakpoint
CREATE TYPE "public"."directory_sync" AS ENUM('none', 'entra_connect', 'ad_fs', 'azure_ad_connect_cloud_sync', 'scim', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('handover', 'network_diagram', 'license_cert', 'contract', 'runbook', 'soc2_report', 'policy', 'vendor_doc', 'other');--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('entra_id', 'google_workspace', 'okta', 'active_directory', 'jumpcloud', 'auth0', 'other');--> statement-breakpoint
CREATE TYPE "public"."mailbox_kind" AS ENUM('user', 'shared', 'service', 'distribution_list', 'security_group', 'mail_enabled_security', 'external_contact', 'other');--> statement-breakpoint
CREATE TYPE "public"."mfa_posture" AS ENUM('all_required', 'admin_only', 'conditional', 'not_enforced', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."observation_kind" AS ENUM('cleanup', 'validate', 'risk', 'follow_up', 'decision_pending', 'other');--> statement-breakpoint
CREATE TYPE "public"."observation_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."observation_status" AS ENUM('open', 'in_progress', 'blocked', 'resolved', 'wont_fix');--> statement-breakpoint
CREATE TABLE "client_app_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"application_id" text,
	"display_name" text NOT NULL,
	"app_created_at" date,
	"secret_status" "app_registration_cred_status" DEFAULT 'unknown' NOT NULL,
	"secret_expires_at" date,
	"cert_status" "app_registration_cred_status" DEFAULT 'unknown' NOT NULL,
	"cert_expires_at" date,
	"status" "app_registration_status" DEFAULT 'active' NOT NULL,
	"purpose" text,
	"flag_for_review" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "document_kind" DEFAULT 'other' NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"added_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"identity_provider" "identity_provider" DEFAULT 'entra_id' NOT NULL,
	"primary_domain" text,
	"tenant_default_domain" text,
	"tenant_id" text,
	"domain_registrar" text,
	"directory_sync" "directory_sync" DEFAULT 'none' NOT NULL,
	"mfa_posture" "mfa_posture" DEFAULT 'unknown' NOT NULL,
	"conditional_access_notes" text,
	"sso_consumers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"primary_email" text NOT NULL,
	"display_name" text,
	"kind" "mailbox_kind" DEFAULT 'user' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"litigation_hold" boolean DEFAULT false NOT NULL,
	"license_summary" text,
	"delegated_to_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" "observation_kind" DEFAULT 'validate' NOT NULL,
	"severity" "observation_severity" DEFAULT 'medium' NOT NULL,
	"status" "observation_status" DEFAULT 'open' NOT NULL,
	"assigned_to_membership_id" uuid,
	"due_date" date,
	"resolved_at" timestamp with time zone,
	"resolved_by_membership_id" uuid,
	"resolution_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_app_registrations" ADD CONSTRAINT "client_app_registrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_app_registrations" ADD CONSTRAINT "client_app_registrations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_added_by_membership_id_memberships_id_fk" FOREIGN KEY ("added_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_identities" ADD CONSTRAINT "client_identities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_identities" ADD CONSTRAINT "client_identities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mailboxes" ADD CONSTRAINT "client_mailboxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mailboxes" ADD CONSTRAINT "client_mailboxes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_assigned_to_membership_id_memberships_id_fk" FOREIGN KEY ("assigned_to_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_resolved_by_membership_id_memberships_id_fk" FOREIGN KEY ("resolved_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_app_reg_client_idx" ON "client_app_registrations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_app_reg_org_idx" ON "client_app_registrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_documents_client_idx" ON "client_documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_documents_org_idx" ON "client_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_identities_client_unq" ON "client_identities" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_identities_org_idx" ON "client_identities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_mailboxes_client_idx" ON "client_mailboxes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_mailboxes_org_idx" ON "client_mailboxes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_mailboxes_client_email_unq" ON "client_mailboxes" USING btree ("client_id","primary_email");--> statement-breakpoint
CREATE INDEX "client_observations_client_idx" ON "client_observations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_observations_org_idx" ON "client_observations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_observations_status_idx" ON "client_observations" USING btree ("client_id","status");