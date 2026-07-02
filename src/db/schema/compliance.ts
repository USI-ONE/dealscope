/**
 * Compliance / standards & gap assessments.
 *
 * Mental model:
 *   - A `standard` is a reusable rubric ("USI Baseline", "CIS Controls
 *     IG1", a cyber-insurance carrier's attestation list, a custom
 *     industry framework). Owned by the org.
 *   - A standard has a tree of `standard_controls`. Two-level hierarchy:
 *     a control with parent_id = null is a domain header; a control
 *     with parent_id set is a leaf. Self-referencing FK keeps it
 *     flexible without a separate domains table.
 *   - For each (client, control) we store a `client_control_assessment`
 *     with a status, optional score, free-form evidence/notes, and
 *     timestamps. Gaps = anything not "compliant".
 *
 * Trend tracking: every assessment carries assessed_at; for snapshotting
 * over time we'll add an `assessment_snapshots` table later. V1 just
 * keeps the latest state per (client, control).
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { memberships, organizations } from "./organizations";
import { clients } from "./clients";
import { ownershipGroups } from "./ownership-groups";
import { diligenceEngagements } from "./diligence";

export const standardSourceEnum = pgEnum("standard_source", [
  "internal",
  "cis_v8",
  "nist_csf_2",
  "iso_27001",
  "soc2",
  "hipaa",
  "pci_dss",
  "cyber_insurance",
  "industry_specific",
  "custom",
]);

export const assessmentStatusEnum = pgEnum("assessment_status", [
  "compliant",
  "partial",
  "non_compliant",
  "not_applicable",
  "unknown",
]);

export const standards = pgTable(
  "standards",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Optional — when set, the standard "belongs" to that ownership
     *  group (e.g., a PE firm's portfolio baseline) and auto-applies
     *  to every client whose ownership_group_id matches. Null means
     *  the standard is owned by the org generally and has to be
     *  explicitly applied per-client via client_applicable_standards. */
    ownershipGroupId: uuid("ownership_group_id").references(
      () => ownershipGroups.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    description: text("description"),
    version: text("version"),
    source: standardSourceEnum("source").notNull().default("internal"),
    /** Once published, controls become read-only-ish (deletes restricted)
     *  so assessments don't lose their underlying rubric mid-stream. */
    isPublished: integer("is_published").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("standards_org_idx").on(t.organizationId),
    ownershipGroupIdx: index("standards_ownership_group_idx").on(
      t.ownershipGroupId,
    ),
  }),
);

export const standardsRelations = relations(standards, ({ many }) => ({
  controls: many(standardControls),
}));

export type Standard = typeof standards.$inferSelect;
export type NewStandard = typeof standards.$inferInsert;

export const standardControls = pgTable(
  "standard_controls",
  {
    id: id(),
    standardId: uuid("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
    /** null = top-level domain header; non-null = leaf control under that domain. */
    parentId: uuid("parent_id"),
    /** Free-form code shown to users — "1.1", "AC-2", "CIS-4.1", whatever. */
    code: text("code"),
    title: text("title").notNull(),
    description: text("description"),
    /** "What good looks like" guidance — what evidence the assessor should expect. */
    guidance: text("guidance"),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    standardIdx: index("standard_controls_standard_idx").on(t.standardId),
    parentIdx: index("standard_controls_parent_idx").on(t.parentId),
  }),
);

export const standardControlsRelations = relations(
  standardControls,
  ({ one, many }) => ({
    standard: one(standards, {
      fields: [standardControls.standardId],
      references: [standards.id],
    }),
    parent: one(standardControls, {
      fields: [standardControls.parentId],
      references: [standardControls.id],
      relationName: "control_parent",
    }),
    children: many(standardControls, { relationName: "control_parent" }),
  }),
);

export type StandardControl = typeof standardControls.$inferSelect;
export type NewStandardControl = typeof standardControls.$inferInsert;

export const clientControlAssessments = pgTable(
  "client_control_assessments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    controlId: uuid("control_id")
      .notNull()
      .references(() => standardControls.id, { onDelete: "cascade" }),
    status: assessmentStatusEnum("status").notNull().default("unknown"),
    /** Optional 0-100 maturity score for stakeholders who want a number. */
    score: integer("score"),
    /** Free-form. Links to procedures, CRs, vendor records, etc. */
    evidence: text("evidence"),
    assessedByMembershipId: uuid("assessed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    assessedAt: timestamp("assessed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_control_assessments_client_idx").on(t.clientId),
    controlIdx: index("client_control_assessments_control_idx").on(t.controlId),
    uniqClientControl: uniqueIndex("client_control_assessments_uq").on(
      t.clientId,
      t.controlId,
    ),
  }),
);

export const clientControlAssessmentsRelations = relations(
  clientControlAssessments,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientControlAssessments.clientId],
      references: [clients.id],
    }),
    control: one(standardControls, {
      fields: [clientControlAssessments.controlId],
      references: [standardControls.id],
    }),
  }),
);

export type ClientControlAssessment =
  typeof clientControlAssessments.$inferSelect;
export type NewClientControlAssessment =
  typeof clientControlAssessments.$inferInsert;

/* ============================================================================
 * Per-client applicable standards.
 *
 * A client's applicable standards = the union of:
 *   - rows in this table (explicit per-client opt-in)
 *   - standards whose ownership_group_id matches the client's
 *     ownership_group_id (auto-applied via portfolio membership)
 *
 * The is_required flag distinguishes "this client MUST attain this
 * standard" (drives the AI brief's recommendations) from "we're
 * tracking it as aspirational" (informational only).
 * ========================================================================== */
export const clientApplicableStandards = pgTable(
  "client_applicable_standards",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    standardId: uuid("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
    /** True = the client must attain this standard (regulatory, contractual,
     *  insurance). False = aspirational / internal goal, won't drive
     *  remediation prioritization. */
    isRequired: integer("is_required").notNull().default(1),
    /** Why the standard applies — "PCI required because we accept cards",
     *  "client's cyber-insurance carrier requires this", etc. */
    rationale: text("rationale"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_applicable_standards_client_idx").on(t.clientId),
    standardIdx: index("client_applicable_standards_standard_idx").on(
      t.standardId,
    ),
    uniqClientStandard: uniqueIndex("client_applicable_standards_uq").on(
      t.clientId,
      t.standardId,
    ),
  }),
);

export type ClientApplicableStandard =
  typeof clientApplicableStandards.$inferSelect;
export type NewClientApplicableStandard =
  typeof clientApplicableStandards.$inferInsert;

/* ============================================================================
 * Per-engagement compliance.
 *
 * Mirror of the client-side tables, but scoped to a diligence engagement
 * (the target). Lets the team measure what discovery has uncovered
 * against the standard during the engagement, without yet creating a
 * client record for the target.
 * ========================================================================== */
export const diligenceEngagementApplicableStandards = pgTable(
  "diligence_engagement_applicable_standards",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    standardId: uuid("standard_id")
      .notNull()
      .references(() => standards.id, { onDelete: "cascade" }),
    /** True = the target must attain this standard post-close. */
    isRequired: integer("is_required").notNull().default(1),
    rationale: text("rationale"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_eng_app_standards_engagement_idx").on(
      t.engagementId,
    ),
    standardIdx: index("dil_eng_app_standards_standard_idx").on(t.standardId),
    uniqEngagementStandard: uniqueIndex("dil_eng_app_standards_uq").on(
      t.engagementId,
      t.standardId,
    ),
  }),
);

export type DiligenceEngagementApplicableStandard =
  typeof diligenceEngagementApplicableStandards.$inferSelect;
export type NewDiligenceEngagementApplicableStandard =
  typeof diligenceEngagementApplicableStandards.$inferInsert;

export const diligenceEngagementControlAssessments = pgTable(
  "diligence_engagement_control_assessments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    controlId: uuid("control_id")
      .notNull()
      .references(() => standardControls.id, { onDelete: "cascade" }),
    status: assessmentStatusEnum("status").notNull().default("unknown"),
    score: integer("score"),
    evidence: text("evidence"),
    assessedByMembershipId: uuid("assessed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    assessedAt: timestamp("assessed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_eng_control_assess_engagement_idx").on(
      t.engagementId,
    ),
    controlIdx: index("dil_eng_control_assess_control_idx").on(t.controlId),
    uniqEngagementControl: uniqueIndex("dil_eng_control_assess_uq").on(
      t.engagementId,
      t.controlId,
    ),
  }),
);

export type DiligenceEngagementControlAssessment =
  typeof diligenceEngagementControlAssessments.$inferSelect;
export type NewDiligenceEngagementControlAssessment =
  typeof diligenceEngagementControlAssessments.$inferInsert;
