import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { diligenceEngagements } from "./diligence";

/* ============================================================================
 * ENUMS
 * ========================================================================== */

export const maEmploymentTypeEnum = pgEnum("ma_employment_type", [
  "full_time",
  "part_time",
  "contractor_1099",
  "temp",
  "intern",
]);

export const maBenefitPlanTypeEnum = pgEnum("ma_benefit_plan_type", [
  "medical",
  "dental",
  "vision",
  "life",
  "disability_std",
  "disability_ltd",
  "401k",
  "pension",
  "hsa",
  "fsa",
  "pto",
  "equity",
  "bonus",
  "other",
]);

export const maRetentionRiskEnum = pgEnum("ma_retention_risk", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const maFlightRiskEnum = pgEnum("ma_flight_risk", [
  "high",
  "medium",
  "low",
  "unknown",
]);

export const maLaborMatterTypeEnum = pgEnum("ma_labor_matter_type", [
  "union_contract",
  "cbas",
  "labor_dispute",
  "eeoc_charge",
  "workers_comp_claim",
  "osha_citation",
  "wage_hour_claim",
  "classification_issue",
  "other",
]);

export const maLaborMatterStatusEnum = pgEnum("ma_labor_matter_status", [
  "active",
  "pending",
  "resolved",
  "expired",
]);

/* ============================================================================
 * TABLES
 * ========================================================================== */

/**
 * Headcount snapshot by department and employment type.
 * Captures workforce composition, tenure, compensation bands, and remote
 * work posture at the time of diligence.
 */
export const maHeadcountSnapshots = pgTable(
  "ma_headcount_snapshots",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    department: text("department").notNull(),
    /** Functional group within the department (e.g. "Engineering", "Sales"). */
    function: text("function"),
    employmentType: maEmploymentTypeEnum("employment_type").notNull(),
    /** Number of employees/workers in this bucket. */
    headcount: integer("headcount").notNull(),
    /** Average tenure in months for this group. */
    averageTenureMonths: integer("average_tenure_months"),
    /** Average base salary per person in cents. */
    averageBaseSalaryCents: integer("average_base_salary_cents"),
    /** Summary of work locations (e.g. "Austin TX, Remote — US only"). */
    locationSummary: text("location_summary"),
    /** Percentage of this group that works remotely (0–100). */
    remotePercent: integer("remote_percent"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_headcount_snapshots_org_idx").on(t.organizationId),
    engagementIdx: index("ma_headcount_snapshots_engagement_idx").on(t.engagementId),
    deptIdx: index("ma_headcount_snapshots_dept_idx").on(
      t.engagementId,
      t.department,
    ),
  }),
);

/**
 * Employee benefits plan inventory.
 * Captures employer cost and enrollment data to estimate total compensation
 * burden and identify post-close benefit harmonization costs.
 */
export const maBenefitsPlans = pgTable(
  "ma_benefits_plans",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    planType: maBenefitPlanTypeEnum("plan_type").notNull(),
    /** Insurance carrier or plan provider. */
    carrier: text("carrier"),
    /** Narrative description of the plan design. */
    planDescription: text("plan_description"),
    /** Monthly premium contribution per enrolled employee in cents. */
    employeeCostCents: integer("employee_cost_cents"),
    /** Monthly employer cost per enrolled employee in cents. */
    employerCostCents: integer("employer_cost_cents"),
    /** Total employees eligible for this plan. */
    eligibleHeadcount: integer("eligible_headcount"),
    /** Total employees actually enrolled. */
    enrolledHeadcount: integer("enrolled_headcount"),
    renewalDate: date("renewal_date"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_benefits_plans_org_idx").on(t.organizationId),
    engagementIdx: index("ma_benefits_plans_engagement_idx").on(t.engagementId),
    typeIdx: index("ma_benefits_plans_type_idx").on(t.engagementId, t.planType),
  }),
);

/**
 * Key person risk assessment.
 * Identifies individuals whose departure would materially harm the business
 * and flags retention, non-compete, and equity status for deal planning.
 */
export const maKeyPeople = pgTable(
  "ma_key_people",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    title: text("title"),
    department: text("department"),
    /** How long this person has been with the company in months. */
    tenureMonths: integer("tenure_months"),
    /** How damaging it would be to the business if this person left. */
    retentionRisk: maRetentionRiskEnum("retention_risk").notNull(),
    /** How likely this person is to voluntarily leave. */
    flightRisk: maFlightRiskEnum("flight_risk").notNull().default("unknown"),
    /** True if this person has a signed non-compete agreement. */
    hasNonCompete: boolean("has_non_compete").notNull().default(false),
    /** True if this person has a signed non-solicitation agreement. */
    hasNonSolicitation: boolean("has_non_solicitation").notNull().default(false),
    /** True if this person has a formal employment agreement (vs. at-will). */
    hasEmploymentAgreement: boolean("has_employment_agreement").notNull().default(false),
    /**
     * Approximate compensation band — no exact figures.
     * E.g. "$120k–$140k + equity".
     */
    compensationBand: text("compensation_band"),
    /** True if this person holds company equity (options, restricted stock, etc.). */
    equityHolder: boolean("equity_holder").notNull().default(false),
    /** True if the acquirer is planning a retention incentive for this person. */
    retentionIncentivePlanned: boolean("retention_incentive_planned").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_key_people_org_idx").on(t.organizationId),
    engagementIdx: index("ma_key_people_engagement_idx").on(t.engagementId),
    riskIdx: index("ma_key_people_risk_idx").on(t.engagementId, t.retentionRisk),
  }),
);

/**
 * Union contracts, labor disputes, and workforce compliance matters.
 * Covers collective bargaining agreements, EEOC charges, wage-and-hour claims,
 * OSHA citations, and worker classification issues.
 */
export const maLaborMatters = pgTable(
  "ma_labor_matters",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    matterType: maLaborMatterTypeEnum("matter_type").notNull(),
    description: text("description"),
    status: maLaborMatterStatusEnum("status").notNull().default("active"),
    /** Number of employees affected by this matter. */
    affectedHeadcount: integer("affected_headcount"),
    /** Expiry date for contracts, or expected resolution date for disputes. */
    expiryDate: date("expiry_date"),
    /** Estimated financial exposure in cents, if applicable. */
    exposureCents: integer("exposure_cents"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_labor_matters_org_idx").on(t.organizationId),
    engagementIdx: index("ma_labor_matters_engagement_idx").on(t.engagementId),
    typeIdx: index("ma_labor_matters_type_idx").on(t.engagementId, t.matterType),
    statusIdx: index("ma_labor_matters_status_idx").on(t.engagementId, t.status),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */

export const maHeadcountSnapshotsRelations = relations(
  maHeadcountSnapshots,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [maHeadcountSnapshots.organizationId],
      references: [organizations.id],
    }),
    engagement: one(diligenceEngagements, {
      fields: [maHeadcountSnapshots.engagementId],
      references: [diligenceEngagements.id],
    }),
  }),
);

export const maBenefitsPlansRelations = relations(maBenefitsPlans, ({ one }) => ({
  organization: one(organizations, {
    fields: [maBenefitsPlans.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maBenefitsPlans.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const maKeyPeopleRelations = relations(maKeyPeople, ({ one }) => ({
  organization: one(organizations, {
    fields: [maKeyPeople.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maKeyPeople.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const maLaborMattersRelations = relations(maLaborMatters, ({ one }) => ({
  organization: one(organizations, {
    fields: [maLaborMatters.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maLaborMatters.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type MaHeadcountSnapshot = typeof maHeadcountSnapshots.$inferSelect;
export type NewMaHeadcountSnapshot = typeof maHeadcountSnapshots.$inferInsert;
export type MaBenefitsPlan = typeof maBenefitsPlans.$inferSelect;
export type NewMaBenefitsPlan = typeof maBenefitsPlans.$inferInsert;
export type MaKeyPerson = typeof maKeyPeople.$inferSelect;
export type NewMaKeyPerson = typeof maKeyPeople.$inferInsert;
export type MaLaborMatter = typeof maLaborMatters.$inferSelect;
export type NewMaLaborMatter = typeof maLaborMatters.$inferInsert;
