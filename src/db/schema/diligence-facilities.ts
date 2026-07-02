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

export const maPropertyTypeEnum = pgEnum("ma_property_type", [
  "office",
  "warehouse",
  "manufacturing",
  "retail",
  "data_center",
  "lab",
  "parking",
  "land",
  "mixed_use",
  "other",
]);

export const maOwnershipTypeEnum = pgEnum("ma_ownership_type", [
  "owned",
  "leased",
  "subleased",
  "license_agreement",
  "month_to_month",
]);

export const maPropertyConditionEnum = pgEnum("ma_property_condition", [
  "excellent",
  "good",
  "fair",
  "poor",
  "unknown",
]);

export const maLeaseTypeEnum = pgEnum("ma_lease_type", [
  "operating",
  "finance",
  "sublease",
  "ground_lease",
]);

export const maLeaseAssignableEnum = pgEnum("ma_lease_assignable", [
  "yes",
  "no",
  "with_consent",
  "unknown",
]);

export const maEnvironmentalIssueTypeEnum = pgEnum("ma_environmental_issue_type", [
  "phase_1_finding",
  "phase_2_finding",
  "underground_storage_tank",
  "asbestos",
  "lead_paint",
  "mold",
  "hazardous_waste",
  "regulatory_order",
  "permit_violation",
  "other",
]);

export const maEnvironmentalSeverityEnum = pgEnum("ma_environmental_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export const maEnvironmentalStatusEnum = pgEnum("ma_environmental_status", [
  "open",
  "in_remediation",
  "resolved",
  "monitored",
]);

/* ============================================================================
 * TABLES
 * ========================================================================== */

/**
 * Real property inventory for the target company.
 * Captures both owned and leased properties with condition and environmental
 * flags that affect deal pricing and post-close obligations.
 */
export const maRealProperties = pgTable(
  "ma_real_properties",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    propertyName: text("property_name").notNull(),
    address: text("address"),
    propertyType: maPropertyTypeEnum("property_type").notNull(),
    ownershipType: maOwnershipTypeEnum("ownership_type").notNull(),
    /** Total square footage of the property. */
    squareFootage: integer("square_footage"),
    /** Description of how the business uses this space. */
    primaryUse: text("primary_use"),
    condition: maPropertyConditionEnum("condition").notNull().default("unknown"),
    /** Estimated fair market value in cents, for owned properties. */
    estimatedMarketValueCents: integer("estimated_market_value_cents"),
    /** Estimated cost of deferred maintenance items in cents. */
    deferredMaintenanceCents: integer("deferred_maintenance_cents"),
    /** True if there are known or suspected environmental issues. */
    environmentalIssues: boolean("environmental_issues").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_real_properties_org_idx").on(t.organizationId),
    engagementIdx: index("ma_real_properties_engagement_idx").on(t.engagementId),
    typeIdx: index("ma_real_properties_type_idx").on(
      t.engagementId,
      t.ownershipType,
    ),
  }),
);

/**
 * Lease schedule for the target company.
 * Surfaces change-of-control clauses, assignability, and personal guarantees
 * that require landlord consent or affect deal structure.
 */
export const maLeases = pgTable(
  "ma_leases",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    /** Optional FK to the associated real property record. */
    propertyId: uuid("property_id").references(() => maRealProperties.id, {
      onDelete: "set null",
    }),
    /** Denormalized property name for quick display without a join. */
    propertyName: text("property_name").notNull(),
    /** Landlord or lessor entity name. */
    lessor: text("lessor"),
    leaseType: maLeaseTypeEnum("lease_type").notNull(),
    commencementDate: date("commencement_date"),
    expiryDate: date("expiry_date"),
    /** Narrative description of renewal options (e.g. "Two 5-year options at market"). */
    renewalOptions: text("renewal_options"),
    /** Monthly base rent in cents. */
    monthlyRentCents: integer("monthly_rent_cents"),
    /** Annual base rent in cents. */
    annualRentCents: integer("annual_rent_cents"),
    /** Rent escalation schedule (e.g. "3% annual" or "CPI"). */
    rentEscalation: text("rent_escalation"),
    /** Security deposit held by the landlord in cents. */
    securityDepositCents: integer("security_deposit_cents"),
    /** Whether the lease can be assigned on a change of control. */
    assignable: maLeaseAssignableEnum("assignable").notNull().default("unknown"),
    /** True if the lease contains an explicit change-of-control clause. */
    changeOfControlClause: boolean("change_of_control_clause").notNull().default(false),
    /** Termination right description, if any. */
    terminationClause: text("termination_clause"),
    /** True if the lease is personally guaranteed by a founder or owner. */
    personalGuarantee: boolean("personal_guarantee").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_leases_org_idx").on(t.organizationId),
    engagementIdx: index("ma_leases_engagement_idx").on(t.engagementId),
    propertyIdx: index("ma_leases_property_idx").on(t.propertyId),
  }),
);

/**
 * Environmental issues and Phase I/II assessment findings.
 * Each item is tied to an engagement and optionally to a specific property.
 */
export const maEnvironmentalItems = pgTable(
  "ma_environmental_items",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    /** Optional FK to the affected property. */
    propertyId: uuid("property_id").references(() => maRealProperties.id, {
      onDelete: "set null",
    }),
    issueType: maEnvironmentalIssueTypeEnum("issue_type").notNull(),
    severity: maEnvironmentalSeverityEnum("severity").notNull().default("informational"),
    description: text("description"),
    assessmentDate: date("assessment_date"),
    /** Name of the environmental consultant or assessor. */
    assessor: text("assessor"),
    /** True if active remediation is required. */
    remediationRequired: boolean("remediation_required").notNull().default(false),
    /** Estimated cost of remediation in cents. */
    estimatedRemediationCents: integer("estimated_remediation_cents"),
    status: maEnvironmentalStatusEnum("status").notNull().default("open"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_environmental_items_org_idx").on(t.organizationId),
    engagementIdx: index("ma_environmental_items_engagement_idx").on(t.engagementId),
    propertyIdx: index("ma_environmental_items_property_idx").on(t.propertyId),
    severityIdx: index("ma_environmental_items_severity_idx").on(
      t.engagementId,
      t.severity,
    ),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */

export const maRealPropertiesRelations = relations(
  maRealProperties,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [maRealProperties.organizationId],
      references: [organizations.id],
    }),
    engagement: one(diligenceEngagements, {
      fields: [maRealProperties.engagementId],
      references: [diligenceEngagements.id],
    }),
    leases: many(maLeases),
    environmentalItems: many(maEnvironmentalItems),
  }),
);

export const maLeasesRelations = relations(maLeases, ({ one }) => ({
  organization: one(organizations, {
    fields: [maLeases.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maLeases.engagementId],
    references: [diligenceEngagements.id],
  }),
  property: one(maRealProperties, {
    fields: [maLeases.propertyId],
    references: [maRealProperties.id],
  }),
}));

export const maEnvironmentalItemsRelations = relations(
  maEnvironmentalItems,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [maEnvironmentalItems.organizationId],
      references: [organizations.id],
    }),
    engagement: one(diligenceEngagements, {
      fields: [maEnvironmentalItems.engagementId],
      references: [diligenceEngagements.id],
    }),
    property: one(maRealProperties, {
      fields: [maEnvironmentalItems.propertyId],
      references: [maRealProperties.id],
    }),
  }),
);

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type MaRealProperty = typeof maRealProperties.$inferSelect;
export type NewMaRealProperty = typeof maRealProperties.$inferInsert;
export type MaLease = typeof maLeases.$inferSelect;
export type NewMaLease = typeof maLeases.$inferInsert;
export type MaEnvironmentalItem = typeof maEnvironmentalItems.$inferSelect;
export type NewMaEnvironmentalItem = typeof maEnvironmentalItems.$inferInsert;
