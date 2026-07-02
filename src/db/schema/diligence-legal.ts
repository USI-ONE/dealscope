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
import { diligenceEngagements, diligenceRiskLevelEnum } from "./diligence";

/* ============================================================================
 * ENUMS
 * ========================================================================== */

export const maContractTypeEnum = pgEnum("ma_contract_type", [
  "customer",
  "vendor",
  "employment",
  "ip_assignment",
  "lease",
  "loan",
  "nda",
  "partnership",
  "regulatory",
  "other",
]);

export const maAssignableEnum = pgEnum("ma_assignable", [
  "yes",
  "no",
  "with_consent",
  "unknown",
]);

export const maIpTypeEnum = pgEnum("ma_ip_type", [
  "patent",
  "trademark",
  "trade_secret",
  "copyright",
  "domain",
  "software_license",
  "open_source_component",
  "other",
]);

export const maLitigationStatusEnum = pgEnum("ma_litigation_status", [
  "pending",
  "active",
  "settled",
  "dismissed",
  "judgment",
  "appeal",
  "closed",
]);

export const maLitigationClaimTypeEnum = pgEnum("ma_litigation_claim_type", [
  "employment",
  "ip",
  "commercial",
  "regulatory",
  "environmental",
  "tax",
  "personal_injury",
  "other",
]);

export const maPlaintiffOrDefendantEnum = pgEnum("ma_plaintiff_or_defendant", [
  "plaintiff",
  "defendant",
  "third_party",
]);

export const maRegulatoryMatterTypeEnum = pgEnum("ma_regulatory_matter_type", [
  "investigation",
  "audit",
  "notice",
  "consent_order",
  "fine",
  "license_issue",
  "permit_issue",
  "other",
]);

export const maRegulatoryStatusEnum = pgEnum("ma_regulatory_status", [
  "open",
  "resolved",
  "ongoing",
  "pending_response",
]);

/* ============================================================================
 * TABLES
 * ========================================================================== */

/**
 * Legal contracts and agreements inventory for the target company.
 * Tracks assignability, change-of-control clauses, and notice requirements
 * that are material to an M&A transaction.
 */
export const maContracts = pgTable(
  "ma_contracts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contractType: maContractTypeEnum("contract_type").notNull(),
    parties: text("parties"),
    effectiveDate: date("effective_date"),
    expiryDate: date("expiry_date"),
    autoRenews: boolean("auto_renews").notNull().default(false),
    /** Whether the contract can be assigned on a change of control. */
    assignable: maAssignableEnum("assignable").notNull().default("unknown"),
    /** True if the contract contains an explicit change-of-control clause. */
    changeOfControlClause: boolean("change_of_control_clause").notNull().default(false),
    /** Days of notice required to terminate or avoid auto-renewal. */
    noticeRequiredDays: integer("notice_required_days"),
    /** Annual value or cost of this contract in cents. */
    annualValueCents: integer("annual_value_cents"),
    riskLevel: diligenceRiskLevelEnum("risk_level").notNull().default("info"),
    summary: text("summary"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_contracts_org_idx").on(t.organizationId),
    engagementIdx: index("ma_contracts_engagement_idx").on(t.engagementId),
    typeIdx: index("ma_contracts_type_idx").on(t.engagementId, t.contractType),
  }),
);

/**
 * Intellectual property inventory for the target company.
 * Flags ownership gaps (assigned to individual vs. company) and encumbrances.
 */
export const maIpItems = pgTable(
  "ma_ip_items",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    ipType: maIpTypeEnum("ip_type").notNull(),
    title: text("title").notNull(),
    /** Country or region of registration/protection. */
    jurisdiction: text("jurisdiction"),
    registrationNumber: text("registration_number"),
    filingDate: date("filing_date"),
    expiryDate: date("expiry_date"),
    /** Legal owner — the company entity, a founder, or a third party. */
    owner: text("owner"),
    /** True if formally assigned to the company entity (not a founder/individual). */
    assignedToCompany: boolean("assigned_to_company").notNull().default(true),
    /** True if pledged as collateral or licensed exclusively to others. */
    encumbered: boolean("encumbered").notNull().default(false),
    riskLevel: diligenceRiskLevelEnum("risk_level").notNull().default("info"),
    summary: text("summary"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_ip_items_org_idx").on(t.organizationId),
    engagementIdx: index("ma_ip_items_engagement_idx").on(t.engagementId),
    typeIdx: index("ma_ip_items_type_idx").on(t.engagementId, t.ipType),
  }),
);

/**
 * Litigation and dispute matter log for the target company.
 * Captures exposure estimates and provisioning status for diligence pricing.
 */
export const maLitigations = pgTable(
  "ma_litigations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    caseTitle: text("case_title").notNull(),
    caseNumber: text("case_number"),
    /** Court, arbitral forum, or administrative body. */
    court: text("court"),
    status: maLitigationStatusEnum("status").notNull().default("pending"),
    claimType: maLitigationClaimTypeEnum("claim_type").notNull(),
    plaintiffOrDefendant: maPlaintiffOrDefendantEnum("plaintiff_or_defendant").notNull(),
    /** Low-end exposure estimate in cents. */
    exposureLowCents: integer("exposure_low_cents"),
    /** High-end exposure estimate in cents. */
    exposureHighCents: integer("exposure_high_cents"),
    /** True if the company has set aside a financial reserve for this matter. */
    provisioned: boolean("provisioned").notNull().default(false),
    /** Amount of the financial reserve in cents, if provisioned. */
    provisionAmountCents: integer("provision_amount_cents"),
    filedDate: date("filed_date"),
    expectedResolutionDate: date("expected_resolution_date"),
    summary: text("summary"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_litigations_org_idx").on(t.organizationId),
    engagementIdx: index("ma_litigations_engagement_idx").on(t.engagementId),
    statusIdx: index("ma_litigations_status_idx").on(t.engagementId, t.status),
  }),
);

/**
 * Regulatory compliance matters: investigations, audits, consent orders,
 * fines, and licensing/permit issues.
 */
export const maRegulatoryMatters = pgTable(
  "ma_regulatory_matters",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    /** Regulatory agency (e.g. "SEC", "FTC", "EPA", "DOL", "EEOC"). */
    agency: text("agency").notNull(),
    matterType: maRegulatoryMatterTypeEnum("matter_type").notNull(),
    status: maRegulatoryStatusEnum("status").notNull().default("open"),
    description: text("description"),
    /** Fine or penalty amount in cents, if applicable. */
    fineAmountCents: integer("fine_amount_cents"),
    resolvedDate: date("resolved_date"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("ma_regulatory_matters_org_idx").on(t.organizationId),
    engagementIdx: index("ma_regulatory_matters_engagement_idx").on(t.engagementId),
    statusIdx: index("ma_regulatory_matters_status_idx").on(t.engagementId, t.status),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */

export const maContractsRelations = relations(maContracts, ({ one }) => ({
  organization: one(organizations, {
    fields: [maContracts.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maContracts.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const maIpItemsRelations = relations(maIpItems, ({ one }) => ({
  organization: one(organizations, {
    fields: [maIpItems.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maIpItems.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const maLitigationsRelations = relations(maLitigations, ({ one }) => ({
  organization: one(organizations, {
    fields: [maLitigations.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maLitigations.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const maRegulatoryMattersRelations = relations(maRegulatoryMatters, ({ one }) => ({
  organization: one(organizations, {
    fields: [maRegulatoryMatters.organizationId],
    references: [organizations.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [maRegulatoryMatters.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type MaContract = typeof maContracts.$inferSelect;
export type NewMaContract = typeof maContracts.$inferInsert;
export type MaIpItem = typeof maIpItems.$inferSelect;
export type NewMaIpItem = typeof maIpItems.$inferInsert;
export type MaLitigation = typeof maLitigations.$inferSelect;
export type NewMaLitigation = typeof maLitigations.$inferInsert;
export type MaRegulatoryMatter = typeof maRegulatoryMatters.$inferSelect;
export type NewMaRegulatoryMatter = typeof maRegulatoryMatters.$inferInsert;
