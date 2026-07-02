CREATE TYPE "public"."role" AS ENUM('owner', 'executive', 'manager', 'member');--> statement-breakpoint
CREATE TYPE "public"."billable_status" AS ENUM('draft', 'approved', 'billed', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."contract_kind" AS ENUM('msa', 'sow', 'subscription', 'license', 'support', 'nda', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('active', 'expired', 'terminated', 'draft');--> statement-breakpoint
CREATE TYPE "public"."hardware_kind" AS ENUM('server', 'workstation', 'laptop', 'firewall', 'switch', 'ap', 'printer', 'phone', 'mobile', 'tablet', 'appliance', 'other');--> statement-breakpoint
CREATE TYPE "public"."hardware_status" AS ENUM('active', 'spare', 'retired', 'lost');--> statement-breakpoint
CREATE TYPE "public"."license_billing_period" AS ENUM('monthly', 'annual', 'per_seat_monthly', 'per_seat_annual', 'perpetual', 'consumption');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('active', 'expired', 'lapsed', 'draft');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('managed', 'break_fix', 'project', 'recurring', 'advisory', 'other');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('active', 'paused', 'ended', 'draft');--> statement-breakpoint
CREATE TYPE "public"."vendor_bill_status" AS ENUM('received', 'approved', 'paid', 'disputed', 'void');--> statement-breakpoint
CREATE TYPE "public"."vendor_status" AS ENUM('active', 'inactive', 'evaluating');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('prospect', 'active', 'on_hold', 'former');--> statement-breakpoint
CREATE TYPE "public"."diligence_artifact_kind" AS ENUM('application', 'server', 'network_site', 'identity', 'vendor', 'license', 'ai_tool', 'intercompany_dependency', 'key_person', 'contract', 'dataset', 'integration', 'process_gap', 'other');--> statement-breakpoint
CREATE TYPE "public"."diligence_attendee_side" AS ENUM('target', 'interviewer');--> statement-breakpoint
CREATE TYPE "public"."diligence_cost_timing" AS ENUM('pre_close', 'first_30', 'thirty_to_90', 'ninety_to_180', 'ongoing');--> statement-breakpoint
CREATE TYPE "public"."diligence_engagement_status" AS ENUM('planning', 'in_progress', 'drafting', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."diligence_finding_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."diligence_finding_status" AS ENUM('open', 'mitigated', 'accepted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."diligence_risk_level" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."diligence_session_mode" AS ENUM('onsite', 'remote', 'hybrid');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "billables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"license_id" uuid,
	"service_id" uuid,
	"vendor_bill_line_id" uuid,
	"description" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"quantity" integer,
	"cost_basis_cents" integer DEFAULT 0 NOT NULL,
	"markup_pct" integer DEFAULT 0 NOT NULL,
	"markup_cents" integer DEFAULT 0 NOT NULL,
	"rebill_cents" integer DEFAULT 0 NOT NULL,
	"status" "billable_status" DEFAULT 'draft' NOT NULL,
	"invoiced_at" date,
	"invoice_reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid,
	"client_id" uuid,
	"title" text NOT NULL,
	"kind" "contract_kind" DEFAULT 'subscription' NOT NULL,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"starts_at" date,
	"ends_at" date,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"notice_period_days" integer,
	"annual_value_cents" integer,
	"one_password_item_url" text,
	"document_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardware" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"location_id" uuid,
	"vendor_id" uuid,
	"kind" "hardware_kind" DEFAULT 'other' NOT NULL,
	"label" text NOT NULL,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"asset_tag" text,
	"status" "hardware_status" DEFAULT 'active' NOT NULL,
	"purchased_at" date,
	"warranty_ends_at" date,
	"os_name" text,
	"os_version" text,
	"cpu_label" text,
	"ram_gb" integer,
	"disk_gb" integer,
	"last_ip" text,
	"last_seen_at" timestamp with time zone,
	"is_eol" boolean DEFAULT false NOT NULL,
	"eol_date" date,
	"rmm_agent" text,
	"edr_agent" text,
	"backup_agent" text,
	"assigned_to_label" text,
	"assigned_to_email" text,
	"one_password_item_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"license_id" uuid NOT NULL,
	"client_id" uuid,
	"assignee_label" text NOT NULL,
	"assignee_email" text,
	"assigned_at" date,
	"ended_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid,
	"client_id" uuid,
	"contract_id" uuid,
	"product_name" text NOT NULL,
	"sku" text,
	"seats_total" integer,
	"billing_period" "license_billing_period" DEFAULT 'annual' NOT NULL,
	"status" "license_status" DEFAULT 'active' NOT NULL,
	"starts_at" date,
	"renewal_date" date,
	"cost_basis_cents" integer,
	"rebill_rate_cents" integer,
	"markup_pct" integer,
	"one_password_item_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"vendor_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"kind" "service_kind" DEFAULT 'recurring' NOT NULL,
	"status" "service_status" DEFAULT 'active' NOT NULL,
	"starts_at" date,
	"ends_at" date,
	"monthly_rebill_rate_cents" integer,
	"cost_basis_cents" integer,
	"markup_pct" integer,
	"one_password_item_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"description" text NOT NULL,
	"sku" text,
	"quantity" integer,
	"unit_cost_cents" integer,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"period_start" date,
	"period_end" date,
	"matched_license_id" uuid,
	"matched_service_id" uuid,
	"extraction_confidence" integer,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"invoice_number" text,
	"period_start" date,
	"period_end" date,
	"received_at" date,
	"due_at" date,
	"paid_at" date,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"status" "vendor_bill_status" DEFAULT 'received' NOT NULL,
	"pdf_blob_url" text,
	"pdf_filename" text,
	"extraction_status" text,
	"extraction_metadata_json" jsonb,
	"notes" text,
	"uploaded_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "vendor_status" DEFAULT 'active' NOT NULL,
	"website" text,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"primary_contact_phone" text,
	"account_number" text,
	"one_password_item_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text DEFAULT 'US' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"subnet" text,
	"isp" text,
	"isp_circuit_id" text,
	"security_posture" text,
	"network_notes" text,
	"is_client_owned_network" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"primary_domain" text,
	"industry" text,
	"account_manager_membership_id" uuid,
	"syncro_customer_id" text,
	"monthly_recurring_cents" integer,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"session_id" uuid,
	"kind" "diligence_artifact_kind" NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"data" jsonb DEFAULT '{}'::jsonb,
	"risk_level" "diligence_risk_level" DEFAULT 'info' NOT NULL,
	"needs_attention" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"side" "diligence_attendee_side" NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"generated_by_membership_id" uuid,
	"content_json" jsonb NOT NULL,
	"docx_blob_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_cost_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"work_item" text NOT NULL,
	"low_cents" integer DEFAULT 0 NOT NULL,
	"high_cents" integer DEFAULT 0 NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"timing" "diligence_cost_timing" DEFAULT 'first_30' NOT NULL,
	"category" text,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid,
	"target_company_name" text NOT NULL,
	"codename" text,
	"status" "diligence_engagement_status" DEFAULT 'planning' NOT NULL,
	"lead_interviewer_membership_id" uuid,
	"partners" text,
	"summary" text,
	"kickoff_date" date,
	"delivery_date" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"ref_code" text NOT NULL,
	"severity" "diligence_finding_severity" NOT NULL,
	"title" text NOT NULL,
	"narrative" text,
	"related_artifact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "diligence_finding_status" DEFAULT 'open' NOT NULL,
	"immediate" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_question_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"response" text,
	"satisfactory" boolean DEFAULT false NOT NULL,
	"follow_ups_surfaced" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" text NOT NULL,
	"question" text NOT NULL,
	"follow_ups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artifact_kind_hint" "diligence_artifact_kind",
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"duration_minutes" integer,
	"location" text,
	"mode" "diligence_session_mode" DEFAULT 'onsite' NOT NULL,
	"notes" text,
	"summary" text,
	"raw_notes_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"finance_access" boolean DEFAULT false NOT NULL,
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"primary_domain" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billables" ADD CONSTRAINT "billables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billables" ADD CONSTRAINT "billables_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billables" ADD CONSTRAINT "billables_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billables" ADD CONSTRAINT "billables_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billables" ADD CONSTRAINT "billables_vendor_bill_line_id_vendor_bill_lines_id_fk" FOREIGN KEY ("vendor_bill_line_id") REFERENCES "public"."vendor_bill_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware" ADD CONSTRAINT "hardware_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware" ADD CONSTRAINT "hardware_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware" ADD CONSTRAINT "hardware_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware" ADD CONSTRAINT "hardware_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_bill_id_vendor_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."vendor_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_matched_license_id_licenses_id_fk" FOREIGN KEY ("matched_license_id") REFERENCES "public"."licenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_matched_service_id_services_id_fk" FOREIGN KEY ("matched_service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_uploaded_by_membership_id_memberships_id_fk" FOREIGN KEY ("uploaded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_locations" ADD CONSTRAINT "client_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_locations" ADD CONSTRAINT "client_locations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_manager_membership_id_memberships_id_fk" FOREIGN KEY ("account_manager_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_artifacts" ADD CONSTRAINT "diligence_artifacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_artifacts" ADD CONSTRAINT "diligence_artifacts_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_artifacts" ADD CONSTRAINT "diligence_artifacts_session_id_diligence_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diligence_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_attendees" ADD CONSTRAINT "diligence_attendees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_attendees" ADD CONSTRAINT "diligence_attendees_session_id_diligence_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diligence_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_briefings" ADD CONSTRAINT "diligence_briefings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_briefings" ADD CONSTRAINT "diligence_briefings_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_briefings" ADD CONSTRAINT "diligence_briefings_generated_by_membership_id_memberships_id_fk" FOREIGN KEY ("generated_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_cost_lines" ADD CONSTRAINT "diligence_cost_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_cost_lines" ADD CONSTRAINT "diligence_cost_lines_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagements" ADD CONSTRAINT "diligence_engagements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagements" ADD CONSTRAINT "diligence_engagements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagements" ADD CONSTRAINT "diligence_engagements_lead_interviewer_membership_id_memberships_id_fk" FOREIGN KEY ("lead_interviewer_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_findings" ADD CONSTRAINT "diligence_findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_findings" ADD CONSTRAINT "diligence_findings_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_question_responses" ADD CONSTRAINT "diligence_question_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_question_responses" ADD CONSTRAINT "diligence_question_responses_session_id_diligence_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diligence_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_question_responses" ADD CONSTRAINT "diligence_question_responses_question_id_diligence_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."diligence_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_questions" ADD CONSTRAINT "diligence_questions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_sessions" ADD CONSTRAINT "diligence_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_sessions" ADD CONSTRAINT "diligence_sessions_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billables_org_idx" ON "billables" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "billables_client_idx" ON "billables" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "billables_period_idx" ON "billables" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "contracts_org_idx" ON "contracts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "contracts_vendor_idx" ON "contracts" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "contracts_client_idx" ON "contracts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "hardware_org_idx" ON "hardware" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hardware_client_idx" ON "hardware" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "hardware_location_idx" ON "hardware" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "hardware_serial_idx" ON "hardware" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "license_assign_license_idx" ON "license_assignments" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "license_assign_client_idx" ON "license_assignments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "licenses_org_idx" ON "licenses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "licenses_vendor_idx" ON "licenses" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "licenses_client_idx" ON "licenses" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "licenses_product_idx" ON "licenses" USING btree ("product_name");--> statement-breakpoint
CREATE INDEX "services_org_idx" ON "services" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "services_client_idx" ON "services" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "services_vendor_idx" ON "services" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vbill_lines_bill_idx" ON "vendor_bill_lines" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "vbill_lines_lic_idx" ON "vendor_bill_lines" USING btree ("matched_license_id");--> statement-breakpoint
CREATE INDEX "vbill_lines_svc_idx" ON "vendor_bill_lines" USING btree ("matched_service_id");--> statement-breakpoint
CREATE INDEX "vbills_org_idx" ON "vendor_bills" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "vbills_vendor_idx" ON "vendor_bills" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vbills_invoice_idx" ON "vendor_bills" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "vendors_org_slug_unq" ON "vendors" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "vendors_org_idx" ON "vendors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_locations_client_idx" ON "client_locations" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_org_slug_unq" ON "clients" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "clients_org_idx" ON "clients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dil_art_engagement_idx" ON "diligence_artifacts" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_art_kind_idx" ON "diligence_artifacts" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "dil_att_session_idx" ON "diligence_attendees" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "dil_brief_engagement_idx" ON "diligence_briefings" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_cost_engagement_idx" ON "diligence_cost_lines" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_eng_org_idx" ON "diligence_engagements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dil_eng_client_idx" ON "diligence_engagements" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "dil_fnd_engagement_idx" ON "diligence_findings" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dil_fnd_ref_unq" ON "diligence_findings" USING btree ("engagement_id","ref_code");--> statement-breakpoint
CREATE UNIQUE INDEX "dil_qr_session_q_unq" ON "diligence_question_responses" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "dil_q_org_idx" ON "diligence_questions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "dil_q_cat_idx" ON "diligence_questions" USING btree ("organization_id","category");--> statement-breakpoint
CREATE INDEX "dil_sess_engagement_idx" ON "diligence_sessions" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_unq" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");