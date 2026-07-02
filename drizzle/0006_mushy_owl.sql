CREATE TYPE "public"."industry" AS ENUM('accounting_finance', 'agriculture', 'architecture_engineering', 'automotive_dealer', 'automotive_repair', 'behavioral_health', 'biotech_pharma', 'childcare', 'construction_general', 'construction_specialty', 'dental', 'distribution_wholesale', 'ecommerce', 'education_higher', 'education_k12', 'education_other', 'energy_utilities', 'faith_religious', 'financial_advisory', 'fitness_wellness', 'food_beverage_production', 'funeral_services', 'government_local', 'government_state', 'healthcare_practice', 'home_services', 'hospitality', 'hotel_lodging', 'insurance', 'it_services_msp', 'legal_services', 'logistics_3pl', 'manufacturing_discrete', 'manufacturing_process', 'marketing_agency', 'media_broadcast', 'media_production', 'mining_aggregates', 'nonprofit', 'oil_gas', 'pet_services', 'pharmacy', 'professional_services', 'property_management', 'real_estate_brokerage', 'recreation_entertainment', 'restaurant_full_service', 'restaurant_qsr', 'retail_brick_mortar', 'salon_spa', 'security_services', 'senior_living', 'staffing_recruiting', 'technology_software', 'telecom_carrier', 'transportation_freight', 'transportation_passenger', 'veterinary', 'waste_management', 'other');--> statement-breakpoint
CREATE TABLE "diligence_engagement_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"value" jsonb,
	"satisfactory" boolean DEFAULT false NOT NULL,
	"notes" text,
	"answered_by_membership_id" uuid,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diligence_engagements" ADD COLUMN "industry" "industry";--> statement-breakpoint
ALTER TABLE "diligence_engagement_responses" ADD CONSTRAINT "diligence_engagement_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_responses" ADD CONSTRAINT "diligence_engagement_responses_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_responses" ADD CONSTRAINT "diligence_engagement_responses_answered_by_membership_id_memberships_id_fk" FOREIGN KEY ("answered_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dil_eng_resp_engagement_idx" ON "diligence_engagement_responses" USING btree ("engagement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dil_eng_resp_eng_key_unq" ON "diligence_engagement_responses" USING btree ("engagement_id","question_key");