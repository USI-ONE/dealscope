CREATE TYPE "public"."diligence_deal_stage" AS ENUM('prospect', 'nda', 'indication', 'loi', 'exclusivity', 'due_diligence', 'final_review', 'closing', 'closed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."diligence_dialogue_status" AS ENUM('open', 'answered', 'closed');--> statement-breakpoint
CREATE TYPE "public"."diligence_party_invite_role" AS ENUM('viewer', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."diligence_party_role" AS ENUM('acquirer', 'target', 'advisor', 'lender', 'other');--> statement-breakpoint
CREATE TYPE "public"."diligence_request_status" AS ENUM('pending', 'received', 'accepted', 'waived', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."diligence_task_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."diligence_task_status" AS ENUM('open', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TYPE "public"."diligence_vault_access_tier" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."ma_environmental_issue_type" AS ENUM('phase_1_finding', 'phase_2_finding', 'underground_storage_tank', 'asbestos', 'lead_paint', 'mold', 'hazardous_waste', 'regulatory_order', 'permit_violation', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_environmental_severity" AS ENUM('critical', 'high', 'medium', 'low', 'informational');--> statement-breakpoint
CREATE TYPE "public"."ma_environmental_status" AS ENUM('open', 'in_remediation', 'resolved', 'monitored');--> statement-breakpoint
CREATE TYPE "public"."ma_lease_assignable" AS ENUM('yes', 'no', 'with_consent', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ma_lease_type" AS ENUM('operating', 'finance', 'sublease', 'ground_lease');--> statement-breakpoint
CREATE TYPE "public"."ma_ownership_type" AS ENUM('owned', 'leased', 'subleased', 'license_agreement', 'month_to_month');--> statement-breakpoint
CREATE TYPE "public"."ma_property_condition" AS ENUM('excellent', 'good', 'fair', 'poor', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ma_property_type" AS ENUM('office', 'warehouse', 'manufacturing', 'retail', 'data_center', 'lab', 'parking', 'land', 'mixed_use', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_churn_risk" AS ENUM('low', 'medium', 'high', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ma_contract_status" AS ENUM('under_contract', 'month_to_month', 'no_contract', 'expired', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ma_debt_instrument_type" AS ENUM('term_loan', 'revolver', 'line_of_credit', 'equipment_financing', 'mortgage', 'convertible_note', 'sba_loan', 'seller_note', 'bonds', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_statement_type" AS ENUM('income_statement', 'balance_sheet', 'cash_flow', 'trial_balance', 'tax_return', 'audit_report', 'management_accounts');--> statement-breakpoint
CREATE TYPE "public"."ma_working_capital_item_type" AS ENUM('accounts_receivable', 'inventory', 'prepaid', 'accounts_payable', 'accrued_liabilities', 'deferred_revenue', 'other_current_asset', 'other_current_liability');--> statement-breakpoint
CREATE TYPE "public"."ma_benefit_plan_type" AS ENUM('medical', 'dental', 'vision', 'life', 'disability_std', 'disability_ltd', '401k', 'pension', 'hsa', 'fsa', 'pto', 'equity', 'bonus', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_employment_type" AS ENUM('full_time', 'part_time', 'contractor_1099', 'temp', 'intern');--> statement-breakpoint
CREATE TYPE "public"."ma_flight_risk" AS ENUM('high', 'medium', 'low', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ma_labor_matter_status" AS ENUM('active', 'pending', 'resolved', 'expired');--> statement-breakpoint
CREATE TYPE "public"."ma_labor_matter_type" AS ENUM('union_contract', 'cbas', 'labor_dispute', 'eeoc_charge', 'workers_comp_claim', 'osha_citation', 'wage_hour_claim', 'classification_issue', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_retention_risk" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."ma_assignable" AS ENUM('yes', 'no', 'with_consent', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ma_contract_type" AS ENUM('customer', 'vendor', 'employment', 'ip_assignment', 'lease', 'loan', 'nda', 'partnership', 'regulatory', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_ip_type" AS ENUM('patent', 'trademark', 'trade_secret', 'copyright', 'domain', 'software_license', 'open_source_component', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_litigation_claim_type" AS ENUM('employment', 'ip', 'commercial', 'regulatory', 'environmental', 'tax', 'personal_injury', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_litigation_status" AS ENUM('pending', 'active', 'settled', 'dismissed', 'judgment', 'appeal', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ma_plaintiff_or_defendant" AS ENUM('plaintiff', 'defendant', 'third_party');--> statement-breakpoint
CREATE TYPE "public"."ma_regulatory_matter_type" AS ENUM('investigation', 'audit', 'notice', 'consent_order', 'fine', 'license_issue', 'permit_issue', 'other');--> statement-breakpoint
CREATE TYPE "public"."ma_regulatory_status" AS ENUM('open', 'resolved', 'ongoing', 'pending_response');--> statement-breakpoint
CREATE TYPE "public"."vendor_connection_kind" AS ENUM('syncro', 'liongard', 'bitdefender_gravityzone', 'acronis_cyber_cloud', 'titanhq', 'microsoft_csp', 'huntress', 'threatlocker', 'datto_rmm', 'ingram_micro', 'unifi_network');--> statement-breakpoint
CREATE TYPE "public"."vendor_connection_status" AS ENUM('not_configured', 'configured', 'connected', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."project_dependency_kind" AS ENUM('finish_to_start');--> statement-breakpoint
CREATE TYPE "public"."project_document_kind" AS ENUM('deliverable', 'runbook', 'meeting_notes', 'risk_log', 'scope', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_health" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('m365_migration', 'win11_rollout', 'server_replacement', 'network_refresh', 'onboarding', 'security_baseline', 'eol_refresh', 'cybersecurity_audit', 'custom');--> statement-breakpoint
CREATE TYPE "public"."project_milestone_status" AS ENUM('planned', 'in_progress', 'completed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."project_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'in_progress', 'on_hold', 'blocked', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_status_update_kind" AS ENUM('status', 'risk', 'decision', 'note');--> statement-breakpoint
CREATE TYPE "public"."project_task_status" AS ENUM('todo', 'in_progress', 'blocked', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "diligence_data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"track" text,
	"title" text NOT NULL,
	"description" text,
	"status" "diligence_request_status" DEFAULT 'pending' NOT NULL,
	"due_date" date,
	"assigned_to" text,
	"fulfilled_by_file_id" uuid,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_dialogue_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"content" text NOT NULL,
	"from_membership_id" uuid,
	"from_invitation_id" uuid,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_dialogue_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"track" text,
	"subject" text NOT NULL,
	"status" "diligence_dialogue_status" DEFAULT 'open' NOT NULL,
	"submitted_by_membership_id" uuid,
	"submitted_by_invitation_id" uuid,
	"assigned_to_membership_id" uuid,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_engagement_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"actor_membership_id" uuid,
	"actor_invitation_id" uuid,
	"actor_name" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" date,
	"completed_at" timestamp with time zone,
	"completed_by_membership_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "diligence_party_role" DEFAULT 'target' NOT NULL,
	"email_domain" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_party_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "diligence_party_invite_role" DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"invited_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diligence_party_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "diligence_vault_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"track" text,
	"name" text NOT NULL,
	"description" text,
	"blob_url" text NOT NULL,
	"blob_pathname" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"mime_type" text,
	"access_tier" "diligence_vault_access_tier" DEFAULT 'private' NOT NULL,
	"uploaded_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_workstream_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"track" text,
	"title" text NOT NULL,
	"description" text,
	"status" "diligence_task_status" DEFAULT 'open' NOT NULL,
	"priority" "diligence_task_priority" DEFAULT 'medium' NOT NULL,
	"owner_membership_id" uuid,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_environmental_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"property_id" uuid,
	"issue_type" "ma_environmental_issue_type" NOT NULL,
	"severity" "ma_environmental_severity" DEFAULT 'informational' NOT NULL,
	"description" text,
	"assessment_date" date,
	"assessor" text,
	"remediation_required" boolean DEFAULT false NOT NULL,
	"estimated_remediation_cents" integer,
	"status" "ma_environmental_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"property_id" uuid,
	"property_name" text NOT NULL,
	"lessor" text,
	"lease_type" "ma_lease_type" NOT NULL,
	"commencement_date" date,
	"expiry_date" date,
	"renewal_options" text,
	"monthly_rent_cents" integer,
	"annual_rent_cents" integer,
	"rent_escalation" text,
	"security_deposit_cents" integer,
	"assignable" "ma_lease_assignable" DEFAULT 'unknown' NOT NULL,
	"change_of_control_clause" boolean DEFAULT false NOT NULL,
	"termination_clause" text,
	"personal_guarantee" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_real_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"property_name" text NOT NULL,
	"address" text,
	"property_type" "ma_property_type" NOT NULL,
	"ownership_type" "ma_ownership_type" NOT NULL,
	"square_footage" integer,
	"primary_use" text,
	"condition" "ma_property_condition" DEFAULT 'unknown' NOT NULL,
	"estimated_market_value_cents" integer,
	"deferred_maintenance_cents" integer,
	"environmental_issues" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_customer_revenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"annual_revenue_cents" integer,
	"revenue_percent" text,
	"contract_status" "ma_contract_status" DEFAULT 'unknown' NOT NULL,
	"contract_expiry_date" date,
	"churn_risk" "ma_churn_risk" DEFAULT 'unknown' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_debt_instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"instrument_type" "ma_debt_instrument_type" NOT NULL,
	"lender_name" text NOT NULL,
	"principal_cents" integer,
	"outstanding_cents" integer,
	"interest_rate" text,
	"maturity_date" date,
	"personal_guarantee" boolean DEFAULT false NOT NULL,
	"secured" boolean DEFAULT false NOT NULL,
	"collateral" text,
	"change_of_control_clause" boolean DEFAULT false NOT NULL,
	"covenants" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_financial_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"statement_type" "ma_statement_type" NOT NULL,
	"period_start" date,
	"period_end" date,
	"audited" boolean DEFAULT false NOT NULL,
	"auditor_name" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"revenue_cents" integer,
	"gross_profit_cents" integer,
	"ebitda_cents" integer,
	"net_income_cents" integer,
	"total_assets_cents" integer,
	"total_liabilities_cents" integer,
	"total_equity_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_working_capital_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"item_type" "ma_working_capital_item_type" NOT NULL,
	"description" text,
	"amount_cents" integer,
	"aging_days" integer,
	"normalized_amount_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_benefits_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"plan_type" "ma_benefit_plan_type" NOT NULL,
	"carrier" text,
	"plan_description" text,
	"employee_cost_cents" integer,
	"employer_cost_cents" integer,
	"eligible_headcount" integer,
	"enrolled_headcount" integer,
	"renewal_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_headcount_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"department" text NOT NULL,
	"function" text,
	"employment_type" "ma_employment_type" NOT NULL,
	"headcount" integer NOT NULL,
	"average_tenure_months" integer,
	"average_base_salary_cents" integer,
	"location_summary" text,
	"remote_percent" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_key_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"title" text,
	"department" text,
	"tenure_months" integer,
	"retention_risk" "ma_retention_risk" NOT NULL,
	"flight_risk" "ma_flight_risk" DEFAULT 'unknown' NOT NULL,
	"has_non_compete" boolean DEFAULT false NOT NULL,
	"has_non_solicitation" boolean DEFAULT false NOT NULL,
	"has_employment_agreement" boolean DEFAULT false NOT NULL,
	"compensation_band" text,
	"equity_holder" boolean DEFAULT false NOT NULL,
	"retention_incentive_planned" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_labor_matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"matter_type" "ma_labor_matter_type" NOT NULL,
	"description" text,
	"status" "ma_labor_matter_status" DEFAULT 'active' NOT NULL,
	"affected_headcount" integer,
	"expiry_date" date,
	"exposure_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"title" text NOT NULL,
	"contract_type" "ma_contract_type" NOT NULL,
	"parties" text,
	"effective_date" date,
	"expiry_date" date,
	"auto_renews" boolean DEFAULT false NOT NULL,
	"assignable" "ma_assignable" DEFAULT 'unknown' NOT NULL,
	"change_of_control_clause" boolean DEFAULT false NOT NULL,
	"notice_required_days" integer,
	"annual_value_cents" integer,
	"risk_level" "diligence_risk_level" DEFAULT 'info' NOT NULL,
	"summary" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_ip_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"ip_type" "ma_ip_type" NOT NULL,
	"title" text NOT NULL,
	"jurisdiction" text,
	"registration_number" text,
	"filing_date" date,
	"expiry_date" date,
	"owner" text,
	"assigned_to_company" boolean DEFAULT true NOT NULL,
	"encumbered" boolean DEFAULT false NOT NULL,
	"risk_level" "diligence_risk_level" DEFAULT 'info' NOT NULL,
	"summary" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_litigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"case_title" text NOT NULL,
	"case_number" text,
	"court" text,
	"status" "ma_litigation_status" DEFAULT 'pending' NOT NULL,
	"claim_type" "ma_litigation_claim_type" NOT NULL,
	"plaintiff_or_defendant" "ma_plaintiff_or_defendant" NOT NULL,
	"exposure_low_cents" integer,
	"exposure_high_cents" integer,
	"provisioned" boolean DEFAULT false NOT NULL,
	"provision_amount_cents" integer,
	"filed_date" date,
	"expected_resolution_date" date,
	"summary" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ma_regulatory_matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"agency" text NOT NULL,
	"matter_type" "ma_regulatory_matter_type" NOT NULL,
	"status" "ma_regulatory_status" DEFAULT 'open' NOT NULL,
	"description" text,
	"fine_amount_cents" integer,
	"resolved_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_client_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_connection_id" uuid NOT NULL,
	"vendor_client_identifier" text NOT NULL,
	"vendor_client_name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"vendor_client_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "vendor_connection_kind" NOT NULL,
	"display_name" text NOT NULL,
	"vendor_id" uuid,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "vendor_connection_status" DEFAULT 'not_configured' NOT NULL,
	"last_sync_started_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_sync_message" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_seat_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"vendor_connection_id" uuid NOT NULL,
	"vendor_client_identifier" text NOT NULL,
	"vendor_client_name" text NOT NULL,
	"client_id" uuid,
	"product_sku" text NOT NULL,
	"product_name" text NOT NULL,
	"seats" integer NOT NULL,
	"cost_per_seat_cents" integer,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_response" jsonb
);
--> statement-breakpoint
CREATE TABLE "client_security_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"review_date" date NOT NULL,
	"reviewed_by_membership_id" uuid,
	"next_review_date" date,
	"total_seats" integer,
	"total_devices" integer,
	"answers_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"general_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"voice_service_id" uuid NOT NULL,
	"voice_site_id" uuid,
	"ext_number" text,
	"did_number" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"user_type" text,
	"role" text,
	"template" text,
	"department" text,
	"job_title" text,
	"device_type" text,
	"device_mac" text,
	"ringsense_enabled" boolean DEFAULT false NOT NULL,
	"ringsense_role" text,
	"ms_teams" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"voice_service_id" uuid NOT NULL,
	"voice_site_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"ext_number" text,
	"did_number" text,
	"greeting_text" text,
	"business_hours_handler" text,
	"after_hours_handler" text,
	"member_extensions_json" jsonb,
	"routing_options_json" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"voice_service_id" uuid NOT NULL,
	"voice_site_id" uuid,
	"did_number" text NOT NULL,
	"number_type" text,
	"rc_number_type" text,
	"ext_number" text,
	"temp_rc_number" text,
	"losing_carrier" text,
	"billing_phone_number" text,
	"carrier_account_number" text,
	"authorized_user" text,
	"porting_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"service_address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_tier" text,
	"account_uid" text,
	"customer_account_number" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"go_live_date" date,
	"sales_agreement_url" text,
	"sow_url" text,
	"monday_board_url" text,
	"lucidchart_url" text,
	"drive_url" text,
	"porting_link_url" text,
	"usi_pm_membership_id" uuid,
	"vendor_pm_name" text,
	"vendor_pm_email" text,
	"vendor_pm_phone" text,
	"vendor_engineer_name" text,
	"vendor_engineer_email" text,
	"vendor_engineer_phone" text,
	"one_password_item_url" text,
	"last_audited_at" timestamp with time zone,
	"last_audited_by_membership_id" uuid,
	"last_audit_notes" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"voice_service_id" uuid NOT NULL,
	"location_id" uuid,
	"site_name" text NOT NULL,
	"main_phone" text,
	"outbound_caller_id_name" text,
	"hours_of_operation" text,
	"timezone" text,
	"emergency_response_location_nickname" text,
	"shipping_address" text,
	"deployment_date" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"task_id" uuid,
	"comment_id" uuid,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size_bytes" bigint,
	"file_mime_type" text,
	"description" text,
	"uploaded_by_membership_id" uuid,
	"client_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"task_id" uuid,
	"author_membership_id" uuid,
	"body_md" text NOT NULL,
	"client_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dependent_project_id" uuid NOT NULL,
	"predecessor_project_id" uuid NOT NULL,
	"kind" "project_dependency_kind" DEFAULT 'finish_to_start' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "project_document_kind" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"body_md" text,
	"file_url" text,
	"file_mime_type" text,
	"uploaded_by_membership_id" uuid,
	"client_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" date,
	"completed_at" timestamp with time zone,
	"status" "project_milestone_status" DEFAULT 'planned' NOT NULL,
	"assignee_membership_id" uuid,
	"stakeholder_id" uuid,
	"requires_signoff" boolean DEFAULT false NOT NULL,
	"signed_off_at" timestamp with time zone,
	"signed_off_by_stakeholder_id" uuid,
	"signoff_notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"client_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_stakeholders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"role_label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_status_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_membership_id" uuid,
	"kind" "project_status_update_kind" DEFAULT 'status' NOT NULL,
	"health_at_post" "project_health" NOT NULL,
	"body" text NOT NULL,
	"client_visible" boolean DEFAULT true NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"dependent_task_id" uuid NOT NULL,
	"predecessor_task_id" uuid NOT NULL,
	"kind" "project_dependency_kind" DEFAULT 'finish_to_start' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid,
	"parent_task_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" "project_task_status" DEFAULT 'todo' NOT NULL,
	"assignee_membership_id" uuid,
	"stakeholder_id" uuid,
	"requires_signoff" boolean DEFAULT false NOT NULL,
	"signed_off_at" timestamp with time zone,
	"signed_off_by_stakeholder_id" uuid,
	"signoff_notes" text,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"estimated_hours" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "project_kind" DEFAULT 'custom' NOT NULL,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"health" "project_health" DEFAULT 'green' NOT NULL,
	"priority" "project_priority" DEFAULT 'normal' NOT NULL,
	"summary" text,
	"scope_md" text,
	"primary_pm_membership_id" uuid,
	"lead_engineer_membership_id" uuid,
	"planned_start_date" date,
	"planned_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"budget_cents" integer,
	"contract_type_label" text,
	"total_estimated_hours" integer,
	"total_actual_hours" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "long_description" text;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "is_section_header" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "section_label" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_label" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_line1" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_line2" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_city" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_region" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_postal_code" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to_country" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ordered_by" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pickup_by" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "rep" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "via" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "terms_label" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "service_period_label" text;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD COLUMN "source" text DEFAULT 'manual_upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD COLUMN "external_metadata_json" jsonb;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rebill_rate_bitdefender_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rebill_rate_liongard_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rebill_rate_titanhq_cents" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rebill_rate_syncro_remote_cents" integer;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD COLUMN "last_audited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD COLUMN "last_audited_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD COLUMN "last_audit_notes" text;--> statement-breakpoint
ALTER TABLE "diligence_data_requests" ADD CONSTRAINT "diligence_data_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_data_requests" ADD CONSTRAINT "diligence_data_requests_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_data_requests" ADD CONSTRAINT "diligence_data_requests_fulfilled_by_file_id_diligence_vault_files_id_fk" FOREIGN KEY ("fulfilled_by_file_id") REFERENCES "public"."diligence_vault_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_data_requests" ADD CONSTRAINT "diligence_data_requests_created_by_membership_id_memberships_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_messages" ADD CONSTRAINT "diligence_dialogue_messages_thread_id_diligence_dialogue_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."diligence_dialogue_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_messages" ADD CONSTRAINT "diligence_dialogue_messages_from_membership_id_memberships_id_fk" FOREIGN KEY ("from_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_messages" ADD CONSTRAINT "diligence_dialogue_messages_from_invitation_id_diligence_party_invitations_id_fk" FOREIGN KEY ("from_invitation_id") REFERENCES "public"."diligence_party_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_threads" ADD CONSTRAINT "diligence_dialogue_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_threads" ADD CONSTRAINT "diligence_dialogue_threads_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_threads" ADD CONSTRAINT "diligence_dialogue_threads_submitted_by_membership_id_memberships_id_fk" FOREIGN KEY ("submitted_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_threads" ADD CONSTRAINT "diligence_dialogue_threads_submitted_by_invitation_id_diligence_party_invitations_id_fk" FOREIGN KEY ("submitted_by_invitation_id") REFERENCES "public"."diligence_party_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_dialogue_threads" ADD CONSTRAINT "diligence_dialogue_threads_assigned_to_membership_id_memberships_id_fk" FOREIGN KEY ("assigned_to_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_log" ADD CONSTRAINT "diligence_engagement_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_log" ADD CONSTRAINT "diligence_engagement_log_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_log" ADD CONSTRAINT "diligence_engagement_log_actor_membership_id_memberships_id_fk" FOREIGN KEY ("actor_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_log" ADD CONSTRAINT "diligence_engagement_log_actor_invitation_id_diligence_party_invitations_id_fk" FOREIGN KEY ("actor_invitation_id") REFERENCES "public"."diligence_party_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_milestones" ADD CONSTRAINT "diligence_milestones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_milestones" ADD CONSTRAINT "diligence_milestones_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_milestones" ADD CONSTRAINT "diligence_milestones_completed_by_membership_id_memberships_id_fk" FOREIGN KEY ("completed_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_parties" ADD CONSTRAINT "diligence_parties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_parties" ADD CONSTRAINT "diligence_parties_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_party_invitations" ADD CONSTRAINT "diligence_party_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_party_invitations" ADD CONSTRAINT "diligence_party_invitations_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_party_invitations" ADD CONSTRAINT "diligence_party_invitations_party_id_diligence_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."diligence_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_party_invitations" ADD CONSTRAINT "diligence_party_invitations_invited_by_membership_id_memberships_id_fk" FOREIGN KEY ("invited_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_vault_files" ADD CONSTRAINT "diligence_vault_files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_vault_files" ADD CONSTRAINT "diligence_vault_files_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_vault_files" ADD CONSTRAINT "diligence_vault_files_uploaded_by_membership_id_memberships_id_fk" FOREIGN KEY ("uploaded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_workstream_tasks" ADD CONSTRAINT "diligence_workstream_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_workstream_tasks" ADD CONSTRAINT "diligence_workstream_tasks_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_workstream_tasks" ADD CONSTRAINT "diligence_workstream_tasks_owner_membership_id_memberships_id_fk" FOREIGN KEY ("owner_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_workstream_tasks" ADD CONSTRAINT "diligence_workstream_tasks_created_by_membership_id_memberships_id_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_environmental_items" ADD CONSTRAINT "ma_environmental_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_environmental_items" ADD CONSTRAINT "ma_environmental_items_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_environmental_items" ADD CONSTRAINT "ma_environmental_items_property_id_ma_real_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."ma_real_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_leases" ADD CONSTRAINT "ma_leases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_leases" ADD CONSTRAINT "ma_leases_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_leases" ADD CONSTRAINT "ma_leases_property_id_ma_real_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."ma_real_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_real_properties" ADD CONSTRAINT "ma_real_properties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_real_properties" ADD CONSTRAINT "ma_real_properties_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_customer_revenues" ADD CONSTRAINT "ma_customer_revenues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_customer_revenues" ADD CONSTRAINT "ma_customer_revenues_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_debt_instruments" ADD CONSTRAINT "ma_debt_instruments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_debt_instruments" ADD CONSTRAINT "ma_debt_instruments_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_financial_statements" ADD CONSTRAINT "ma_financial_statements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_financial_statements" ADD CONSTRAINT "ma_financial_statements_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_working_capital_items" ADD CONSTRAINT "ma_working_capital_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_working_capital_items" ADD CONSTRAINT "ma_working_capital_items_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_benefits_plans" ADD CONSTRAINT "ma_benefits_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_benefits_plans" ADD CONSTRAINT "ma_benefits_plans_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_headcount_snapshots" ADD CONSTRAINT "ma_headcount_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_headcount_snapshots" ADD CONSTRAINT "ma_headcount_snapshots_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_key_people" ADD CONSTRAINT "ma_key_people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_key_people" ADD CONSTRAINT "ma_key_people_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_labor_matters" ADD CONSTRAINT "ma_labor_matters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_labor_matters" ADD CONSTRAINT "ma_labor_matters_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_contracts" ADD CONSTRAINT "ma_contracts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_contracts" ADD CONSTRAINT "ma_contracts_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_ip_items" ADD CONSTRAINT "ma_ip_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_ip_items" ADD CONSTRAINT "ma_ip_items_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_litigations" ADD CONSTRAINT "ma_litigations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_litigations" ADD CONSTRAINT "ma_litigations_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_regulatory_matters" ADD CONSTRAINT "ma_regulatory_matters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ma_regulatory_matters" ADD CONSTRAINT "ma_regulatory_matters_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_client_mappings" ADD CONSTRAINT "vendor_client_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_client_mappings" ADD CONSTRAINT "vendor_client_mappings_vendor_connection_id_vendor_connections_id_fk" FOREIGN KEY ("vendor_connection_id") REFERENCES "public"."vendor_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_client_mappings" ADD CONSTRAINT "vendor_client_mappings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_connections" ADD CONSTRAINT "vendor_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_connections" ADD CONSTRAINT "vendor_connections_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_seat_snapshots" ADD CONSTRAINT "vendor_seat_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_seat_snapshots" ADD CONSTRAINT "vendor_seat_snapshots_vendor_connection_id_vendor_connections_id_fk" FOREIGN KEY ("vendor_connection_id") REFERENCES "public"."vendor_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_seat_snapshots" ADD CONSTRAINT "vendor_seat_snapshots_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_security_reviews" ADD CONSTRAINT "client_security_reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_security_reviews" ADD CONSTRAINT "client_security_reviews_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_security_reviews" ADD CONSTRAINT "client_security_reviews_reviewed_by_membership_id_memberships_id_fk" FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_extensions" ADD CONSTRAINT "voice_extensions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_extensions" ADD CONSTRAINT "voice_extensions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_extensions" ADD CONSTRAINT "voice_extensions_voice_service_id_voice_services_id_fk" FOREIGN KEY ("voice_service_id") REFERENCES "public"."voice_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_extensions" ADD CONSTRAINT "voice_extensions_voice_site_id_voice_sites_id_fk" FOREIGN KEY ("voice_site_id") REFERENCES "public"."voice_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_flows" ADD CONSTRAINT "voice_flows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_flows" ADD CONSTRAINT "voice_flows_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_flows" ADD CONSTRAINT "voice_flows_voice_service_id_voice_services_id_fk" FOREIGN KEY ("voice_service_id") REFERENCES "public"."voice_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_flows" ADD CONSTRAINT "voice_flows_voice_site_id_voice_sites_id_fk" FOREIGN KEY ("voice_site_id") REFERENCES "public"."voice_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_numbers" ADD CONSTRAINT "voice_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_numbers" ADD CONSTRAINT "voice_numbers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_numbers" ADD CONSTRAINT "voice_numbers_voice_service_id_voice_services_id_fk" FOREIGN KEY ("voice_service_id") REFERENCES "public"."voice_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_numbers" ADD CONSTRAINT "voice_numbers_voice_site_id_voice_sites_id_fk" FOREIGN KEY ("voice_site_id") REFERENCES "public"."voice_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_services" ADD CONSTRAINT "voice_services_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_services" ADD CONSTRAINT "voice_services_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_services" ADD CONSTRAINT "voice_services_usi_pm_membership_id_memberships_id_fk" FOREIGN KEY ("usi_pm_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_services" ADD CONSTRAINT "voice_services_last_audited_by_membership_id_memberships_id_fk" FOREIGN KEY ("last_audited_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sites" ADD CONSTRAINT "voice_sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sites" ADD CONSTRAINT "voice_sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sites" ADD CONSTRAINT "voice_sites_voice_service_id_voice_services_id_fk" FOREIGN KEY ("voice_service_id") REFERENCES "public"."voice_services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sites" ADD CONSTRAINT "voice_sites_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_comment_id_project_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."project_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_attachments" ADD CONSTRAINT "project_attachments_uploaded_by_membership_id_memberships_id_fk" FOREIGN KEY ("uploaded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_dependent_project_id_projects_id_fk" FOREIGN KEY ("dependent_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_predecessor_project_id_projects_id_fk" FOREIGN KEY ("predecessor_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_membership_id_memberships_id_fk" FOREIGN KEY ("uploaded_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_assignee_membership_id_memberships_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stakeholders" ADD CONSTRAINT "project_stakeholders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stakeholders" ADD CONSTRAINT "project_stakeholders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_updates" ADD CONSTRAINT "project_status_updates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_updates" ADD CONSTRAINT "project_status_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_status_updates" ADD CONSTRAINT "project_status_updates_author_membership_id_memberships_id_fk" FOREIGN KEY ("author_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_dependent_task_id_project_tasks_id_fk" FOREIGN KEY ("dependent_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_predecessor_task_id_project_tasks_id_fk" FOREIGN KEY ("predecessor_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_membership_id_memberships_id_fk" FOREIGN KEY ("assignee_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_pm_membership_id_memberships_id_fk" FOREIGN KEY ("primary_pm_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_engineer_membership_id_memberships_id_fk" FOREIGN KEY ("lead_engineer_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dil_req_engagement_idx" ON "diligence_data_requests" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_req_status_idx" ON "diligence_data_requests" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "dil_msg_thread_idx" ON "diligence_dialogue_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "dil_dial_engagement_idx" ON "diligence_dialogue_threads" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_dial_status_idx" ON "diligence_dialogue_threads" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "dil_log_engagement_idx" ON "diligence_engagement_log" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_log_created_idx" ON "diligence_engagement_log" USING btree ("engagement_id","created_at");--> statement-breakpoint
CREATE INDEX "dil_mile_engagement_idx" ON "diligence_milestones" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_party_engagement_idx" ON "diligence_parties" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_inv_engagement_idx" ON "diligence_party_invitations" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_inv_token_idx" ON "diligence_party_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "dil_vault_engagement_idx" ON "diligence_vault_files" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_vault_track_idx" ON "diligence_vault_files" USING btree ("engagement_id","track");--> statement-breakpoint
CREATE INDEX "dil_task_engagement_idx" ON "diligence_workstream_tasks" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_task_status_idx" ON "diligence_workstream_tasks" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "ma_environmental_items_org_idx" ON "ma_environmental_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_environmental_items_engagement_idx" ON "ma_environmental_items" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_environmental_items_property_idx" ON "ma_environmental_items" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "ma_environmental_items_severity_idx" ON "ma_environmental_items" USING btree ("engagement_id","severity");--> statement-breakpoint
CREATE INDEX "ma_leases_org_idx" ON "ma_leases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_leases_engagement_idx" ON "ma_leases" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_leases_property_idx" ON "ma_leases" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "ma_real_properties_org_idx" ON "ma_real_properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_real_properties_engagement_idx" ON "ma_real_properties" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_real_properties_type_idx" ON "ma_real_properties" USING btree ("engagement_id","ownership_type");--> statement-breakpoint
CREATE INDEX "ma_customer_revenues_org_idx" ON "ma_customer_revenues" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_customer_revenues_engagement_idx" ON "ma_customer_revenues" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_debt_instruments_org_idx" ON "ma_debt_instruments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_debt_instruments_engagement_idx" ON "ma_debt_instruments" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_financial_statements_org_idx" ON "ma_financial_statements" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_financial_statements_engagement_idx" ON "ma_financial_statements" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_financial_statements_type_idx" ON "ma_financial_statements" USING btree ("engagement_id","statement_type");--> statement-breakpoint
CREATE INDEX "ma_working_capital_items_org_idx" ON "ma_working_capital_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_working_capital_items_engagement_idx" ON "ma_working_capital_items" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_working_capital_items_type_idx" ON "ma_working_capital_items" USING btree ("engagement_id","item_type");--> statement-breakpoint
CREATE INDEX "ma_benefits_plans_org_idx" ON "ma_benefits_plans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_benefits_plans_engagement_idx" ON "ma_benefits_plans" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_benefits_plans_type_idx" ON "ma_benefits_plans" USING btree ("engagement_id","plan_type");--> statement-breakpoint
CREATE INDEX "ma_headcount_snapshots_org_idx" ON "ma_headcount_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_headcount_snapshots_engagement_idx" ON "ma_headcount_snapshots" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_headcount_snapshots_dept_idx" ON "ma_headcount_snapshots" USING btree ("engagement_id","department");--> statement-breakpoint
CREATE INDEX "ma_key_people_org_idx" ON "ma_key_people" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_key_people_engagement_idx" ON "ma_key_people" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_key_people_risk_idx" ON "ma_key_people" USING btree ("engagement_id","retention_risk");--> statement-breakpoint
CREATE INDEX "ma_labor_matters_org_idx" ON "ma_labor_matters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_labor_matters_engagement_idx" ON "ma_labor_matters" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_labor_matters_type_idx" ON "ma_labor_matters" USING btree ("engagement_id","matter_type");--> statement-breakpoint
CREATE INDEX "ma_labor_matters_status_idx" ON "ma_labor_matters" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "ma_contracts_org_idx" ON "ma_contracts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_contracts_engagement_idx" ON "ma_contracts" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_contracts_type_idx" ON "ma_contracts" USING btree ("engagement_id","contract_type");--> statement-breakpoint
CREATE INDEX "ma_ip_items_org_idx" ON "ma_ip_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_ip_items_engagement_idx" ON "ma_ip_items" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_ip_items_type_idx" ON "ma_ip_items" USING btree ("engagement_id","ip_type");--> statement-breakpoint
CREATE INDEX "ma_litigations_org_idx" ON "ma_litigations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_litigations_engagement_idx" ON "ma_litigations" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_litigations_status_idx" ON "ma_litigations" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE INDEX "ma_regulatory_matters_org_idx" ON "ma_regulatory_matters" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ma_regulatory_matters_engagement_idx" ON "ma_regulatory_matters" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "ma_regulatory_matters_status_idx" ON "ma_regulatory_matters" USING btree ("engagement_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_client_map_conn_ident_unq" ON "vendor_client_mappings" USING btree ("vendor_connection_id","vendor_client_identifier");--> statement-breakpoint
CREATE INDEX "vendor_client_map_client_idx" ON "vendor_client_mappings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "vendor_client_map_org_idx" ON "vendor_client_mappings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_conn_org_kind_unq" ON "vendor_connections" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "vendor_conn_org_idx" ON "vendor_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "seat_snap_conn_idx" ON "vendor_seat_snapshots" USING btree ("vendor_connection_id","captured_at");--> statement-breakpoint
CREATE INDEX "seat_snap_client_idx" ON "vendor_seat_snapshots" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "seat_snap_product_idx" ON "vendor_seat_snapshots" USING btree ("vendor_connection_id","vendor_client_identifier","product_sku","captured_at");--> statement-breakpoint
CREATE INDEX "seat_snap_org_idx" ON "vendor_seat_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "csr_client_idx" ON "client_security_reviews" USING btree ("client_id","review_date");--> statement-breakpoint
CREATE INDEX "csr_org_idx" ON "client_security_reviews" USING btree ("organization_id","review_date");--> statement-breakpoint
CREATE INDEX "voice_extensions_client_idx" ON "voice_extensions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "voice_extensions_site_idx" ON "voice_extensions" USING btree ("voice_site_id");--> statement-breakpoint
CREATE INDEX "voice_extensions_did_idx" ON "voice_extensions" USING btree ("did_number");--> statement-breakpoint
CREATE INDEX "voice_extensions_ext_idx" ON "voice_extensions" USING btree ("voice_service_id","ext_number");--> statement-breakpoint
CREATE INDEX "voice_flows_client_idx" ON "voice_flows" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "voice_flows_kind_idx" ON "voice_flows" USING btree ("voice_service_id","kind");--> statement-breakpoint
CREATE INDEX "voice_numbers_client_idx" ON "voice_numbers" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "voice_numbers_did_idx" ON "voice_numbers" USING btree ("did_number");--> statement-breakpoint
CREATE INDEX "voice_numbers_status_idx" ON "voice_numbers" USING btree ("voice_service_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_services_client_unq" ON "voice_services" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "voice_services_org_idx" ON "voice_services" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "voice_services_audit_idx" ON "voice_services" USING btree ("last_audited_at");--> statement-breakpoint
CREATE INDEX "voice_sites_client_idx" ON "voice_sites" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "voice_sites_service_idx" ON "voice_sites" USING btree ("voice_service_id");--> statement-breakpoint
CREATE INDEX "project_attachments_project_idx" ON "project_attachments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_attachments_task_idx" ON "project_attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "project_attachments_milestone_idx" ON "project_attachments" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "project_attachments_comment_idx" ON "project_attachments" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "project_comments_project_idx" ON "project_comments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_comments_task_idx" ON "project_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "project_comments_milestone_idx" ON "project_comments" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "project_deps_dependent_idx" ON "project_dependencies" USING btree ("dependent_project_id");--> statement-breakpoint
CREATE INDEX "project_deps_predecessor_idx" ON "project_dependencies" USING btree ("predecessor_project_id");--> statement-breakpoint
CREATE INDEX "project_deps_org_idx" ON "project_dependencies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "project_documents_project_idx" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_milestones_project_idx" ON "project_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_milestones_assignee_idx" ON "project_milestones" USING btree ("assignee_membership_id");--> statement-breakpoint
CREATE INDEX "project_milestones_stakeholder_idx" ON "project_milestones" USING btree ("stakeholder_id");--> statement-breakpoint
CREATE INDEX "project_stakeholders_project_idx" ON "project_stakeholders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_status_updates_project_idx" ON "project_status_updates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_status_updates_posted_idx" ON "project_status_updates" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "project_task_deps_project_idx" ON "project_task_dependencies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_task_deps_dependent_idx" ON "project_task_dependencies" USING btree ("dependent_task_id");--> statement-breakpoint
CREATE INDEX "project_task_deps_predecessor_idx" ON "project_task_dependencies" USING btree ("predecessor_task_id");--> statement-breakpoint
CREATE INDEX "project_tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tasks_milestone_idx" ON "project_tasks" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "project_tasks_assignee_idx" ON "project_tasks" USING btree ("assignee_membership_id");--> statement-breakpoint
CREATE INDEX "project_tasks_stakeholder_idx" ON "project_tasks" USING btree ("stakeholder_id");--> statement-breakpoint
CREATE INDEX "project_tasks_parent_idx" ON "project_tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_code_idx" ON "projects" USING btree ("organization_id","code");--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_location_id_client_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."client_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_network_circuits" ADD CONSTRAINT "client_network_circuits_last_audited_by_membership_id_memberships_id_fk" FOREIGN KEY ("last_audited_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_lines_location_idx" ON "invoice_lines" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "vbills_source_idx" ON "vendor_bills" USING btree ("organization_id","source");--> statement-breakpoint
CREATE INDEX "circuits_audit_idx" ON "client_network_circuits" USING btree ("last_audited_at");