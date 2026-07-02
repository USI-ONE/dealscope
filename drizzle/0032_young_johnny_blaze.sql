CREATE TYPE "public"."license_category" AS ENUM('edr_mdr_xdr', 'email_security', 'productivity_suite', 'identity_sso', 'pam_vaulting', 'mdm_endpoint_mgmt', 'remote_access', 'backup_dr', 'project_management', 'communication', 'file_storage', 'compliance_grc', 'ai_productivity', 'document_signing', 'industry_specific', 'network_infrastructure', 'psa_rmm', 'other_saas');--> statement-breakpoint
ALTER TABLE "license_assignments" ADD COLUMN "hardware_id" uuid;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "category" "license_category" DEFAULT 'other_saas' NOT NULL;--> statement-breakpoint
ALTER TABLE "license_assignments" ADD CONSTRAINT "license_assignments_hardware_id_hardware_id_fk" FOREIGN KEY ("hardware_id") REFERENCES "public"."hardware"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "license_assign_hardware_idx" ON "license_assignments" USING btree ("hardware_id");--> statement-breakpoint
CREATE UNIQUE INDEX "license_assign_lic_hw_unq" ON "license_assignments" USING btree ("license_id","hardware_id");