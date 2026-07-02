CREATE TABLE "diligence_engagement_applicable_standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"standard_id" uuid NOT NULL,
	"is_required" integer DEFAULT 1 NOT NULL,
	"rationale" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diligence_engagement_control_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"engagement_id" uuid NOT NULL,
	"control_id" uuid NOT NULL,
	"status" "assessment_status" DEFAULT 'unknown' NOT NULL,
	"score" integer,
	"evidence" text,
	"assessed_by_membership_id" uuid,
	"assessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diligence_engagement_applicable_standards" ADD CONSTRAINT "diligence_engagement_applicable_standards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_applicable_standards" ADD CONSTRAINT "diligence_engagement_applicable_standards_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_applicable_standards" ADD CONSTRAINT "diligence_engagement_applicable_standards_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_control_assessments" ADD CONSTRAINT "diligence_engagement_control_assessments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_control_assessments" ADD CONSTRAINT "diligence_engagement_control_assessments_engagement_id_diligence_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."diligence_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_control_assessments" ADD CONSTRAINT "diligence_engagement_control_assessments_control_id_standard_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."standard_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diligence_engagement_control_assessments" ADD CONSTRAINT "diligence_engagement_control_assessments_assessed_by_membership_id_memberships_id_fk" FOREIGN KEY ("assessed_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dil_eng_app_standards_engagement_idx" ON "diligence_engagement_applicable_standards" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_eng_app_standards_standard_idx" ON "diligence_engagement_applicable_standards" USING btree ("standard_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dil_eng_app_standards_uq" ON "diligence_engagement_applicable_standards" USING btree ("engagement_id","standard_id");--> statement-breakpoint
CREATE INDEX "dil_eng_control_assess_engagement_idx" ON "diligence_engagement_control_assessments" USING btree ("engagement_id");--> statement-breakpoint
CREATE INDEX "dil_eng_control_assess_control_idx" ON "diligence_engagement_control_assessments" USING btree ("control_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dil_eng_control_assess_uq" ON "diligence_engagement_control_assessments" USING btree ("engagement_id","control_id");