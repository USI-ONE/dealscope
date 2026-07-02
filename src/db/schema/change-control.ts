/**
 * Change control management — formal RFC workflow per client.
 *
 * Schema mirrors the Change Management Policy SOP:
 *   - Standard / Normal / Emergency change types
 *   - Impact + Likelihood + computed Rating risk model
 *   - Internal vs Client-managed environment
 *   - Implementer / System Owner / Change Manager roles
 *   - CAB Required + PIR Required gating
 *   - Approval method documentation (in-app / phone / Teams / email / etc.)
 *   - Evidence sub-table for approval records, config snapshots, logs,
 *     screenshots, validation results, rollback evidence, comms.
 *   - Standard Change Catalog for pre-approved low-risk repeatable work
 *
 * On close, a `client_events` ledger row is auto-created so the
 * historical change log is the union of formal CRs + ad-hoc events.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
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
import { clientEvents } from "./runbook-procedures";

export const changeRequestStatusEnum = pgEnum("change_request_status", [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "scheduled",
  "in_progress",
  "implemented",
  "reviewed",
  "rolled_back",
  "cancelled",
]);

/** Legacy field — kept for back-compat with existing rows. New code
 *  uses `changeType` + `riskRating` + `riskImpact`/`riskLikelihood`. */
export const changeRequestRiskEnum = pgEnum("change_request_risk", [
  "low",
  "standard",
  "high",
  "emergency",
]);

/** Per the policy SOP §1.3. */
export const changeRequestTypeEnum = pgEnum("change_request_type", [
  "standard", // pre-approved, repeatable, references catalog entry
  "normal", // planned change, lightweight CAB review
  "emergency", // urgent service-restoring change, retroactive review
]);

/** Per policy §1.5: Impact × Likelihood → overall Risk Rating. */
export const changeRequestImpactEnum = pgEnum("change_request_impact", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const changeRequestLikelihoodEnum = pgEnum(
  "change_request_likelihood",
  ["low", "medium", "high"],
);

/** The overall risk rating, computed from impact × likelihood at edit
 *  time but stored explicitly so historical records don't drift. */
export const changeRequestRatingEnum = pgEnum("change_request_rating", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const changeRequestEnvironmentEnum = pgEnum(
  "change_request_environment",
  ["internal", "client"],
);

/** Per policy §3 step 8 — outcome categories. */
export const changeRequestOutcomeEnum = pgEnum("change_request_outcome", [
  "successful",
  "successful_with_issues",
  "rolled_back",
  "failed",
]);

/* ============================================================================
 * Standard Change Catalog (policy §5).
 *
 * Pre-approved, low-risk, repeatable changes. A CR with type=standard
 * MUST reference a catalog entry. Each entry carries the runbook,
 * validation steps, and rollback steps that govern any execution.
 * ========================================================================== */
export const standardChangeCatalog = pgTable(
  "standard_change_catalog",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Stable code shown on CRs — "SC-001" style. */
    code: text("code").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    runbookSteps: text("runbook_steps"),
    validationSteps: text("validation_steps"),
    rollbackSteps: text("rollback_steps"),
    /** Default risk rating for new CRs cloned from this catalog entry. */
    defaultRiskRating: changeRequestRatingEnum("default_risk_rating")
      .notNull()
      .default("low"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("standard_change_catalog_org_idx").on(t.organizationId),
    codeUq: uniqueIndex("standard_change_catalog_code_uq").on(
      t.organizationId,
      t.code,
    ),
  }),
);

export type StandardChangeCatalogEntry =
  typeof standardChangeCatalog.$inferSelect;
export type NewStandardChangeCatalogEntry =
  typeof standardChangeCatalog.$inferInsert;

/* ============================================================================
 * Approver capture (jsonb on the CR row).
 * ========================================================================== */
export type ChangeApprover = {
  id: string;
  name: string;
  role: string;
  organization: string | null;
  email: string | null;
  decision: "pending" | "approved" | "rejected" | "abstained";
  decidedAt: string | null;
  comments: string | null;
  /** How the decision was captured — see policy §3 step 3.
   *  "in_app" = recorded directly in TechOS by an authenticated user
   *  "phone" / "teams" / "email" / "in_person" = out-of-band channel
   *  "other" = anything else (sticky note, change board minutes, etc.) */
  approvalMethod:
    | "in_app"
    | "phone"
    | "teams"
    | "email"
    | "in_person"
    | "other"
    | null;
  /** Evidence supporting the decision — link to email thread, Teams
   *  message id, summary of phone call, attached screenshot reference. */
  approvalEvidence: string | null;
  /** Who in TechOS recorded the decision (if it was captured by USI on
   *  behalf of the approver). */
  recordedByMembershipId: string | null;
  recordedAt: string | null;
};

/* ============================================================================
 * Change Request — the central row.
 * ========================================================================== */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    refCode: text("ref_code").notNull(),

    title: text("title").notNull(),
    summary: text("summary"),
    businessJustification: text("business_justification"),

    /* ---- Classification (policy §1.3 + §1.5) ----------------------------- */
    /** Standard / Normal / Emergency. */
    changeType: changeRequestTypeEnum("change_type").notNull().default("normal"),
    /** Internal IT vs Client-managed environment. */
    environment: changeRequestEnvironmentEnum("environment")
      .notNull()
      .default("client"),
    /** Per the policy each change must record impact + likelihood. */
    riskImpact: changeRequestImpactEnum("risk_impact")
      .notNull()
      .default("medium"),
    riskLikelihood: changeRequestLikelihoodEnum("risk_likelihood")
      .notNull()
      .default("medium"),
    /** The overall Risk Rating (low / medium / high / critical). High &
     *  Critical require CAB review per policy §1.5. */
    riskRating: changeRequestRatingEnum("risk_rating")
      .notNull()
      .default("medium"),
    /** True if this change requires a CAB review (lightweight or full). */
    cabRequired: boolean("cab_required").notNull().default(false),
    /** True if a Post-Implementation Review must be filed at close. */
    pirRequired: boolean("pir_required").notNull().default(false),
    /** Pointer to a Standard Change Catalog entry — required when
     *  changeType = standard. */
    standardChangeCatalogId: uuid("standard_change_catalog_id").references(
      () => standardChangeCatalog.id,
      { onDelete: "set null" },
    ),

    /** Legacy column kept so existing data isn't lost. New rows leave it
     *  on the default; UI uses changeType + riskRating instead. */
    riskClass: changeRequestRiskEnum("risk_class").notNull().default("standard"),
    status: changeRequestStatusEnum("status").notNull().default("draft"),

    /* ---- Workflow planning fields --------------------------------------- */
    implementationPlan: text("implementation_plan"),
    rollbackPlan: text("rollback_plan"),
    testPlan: text("test_plan"),
    /** Policy SOP step 6 — explicit validation plan. */
    validationPlan: text("validation_plan"),
    communicationPlan: text("communication_plan"),

    /* ---- Impact ---------------------------------------------------------- */
    affectedSystems: jsonb("affected_systems")
      .$type<string[]>()
      .notNull()
      .default([]),
    expectedDowntimeMinutes: integer("expected_downtime_minutes"),
    impactStatement: text("impact_statement"),

    /* ---- Roles & responsibilities (policy §1.6) ------------------------- */
    requestedByMembershipId: uuid("requested_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Who's running the change. */
    implementerMembershipId: uuid("implementer_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** USI's change manager for this CR. */
    changeManagerMembershipId: uuid(
      "change_manager_membership_id",
    ).references(() => memberships.id, { onDelete: "set null" }),
    /** The system / service owner — usually a contact at the client. */
    systemOwnerName: text("system_owner_name"),
    systemOwnerEmail: text("system_owner_email"),

    /* ---- Schedule -------------------------------------------------------- */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualEnd: timestamp("actual_end", { withTimezone: true }),

    /* ---- CCB approval tracking ------------------------------------------- */
    approvers: jsonb("approvers")
      .$type<ChangeApprover[]>()
      .notNull()
      .default([]),

    /* ---- Communication tracking (policy §3 step 4) ---------------------- */
    /** Free text summary — when notice was sent, to whom, channel. */
    communicationsLog: text("communications_log"),

    /* ---- Post-implementation review (policy §3 step 8) ------------------ */
    postReviewOutcome: changeRequestOutcomeEnum("post_review_outcome"),
    /** Planned vs actual narrative. */
    pirPlannedVsActual: text("pir_planned_vs_actual"),
    pirRootCause: text("pir_root_cause"),
    /** Free text — what we'd do differently / preventive actions. */
    pirPreventiveActions: text("pir_preventive_actions"),
    /** Legacy — folded into pirRootCause / preventive actions. */
    postReviewIssues: text("post_review_issues"),
    postReviewLessons: text("post_review_lessons"),
    /** Has the runbook / docs been updated post-change? */
    documentationUpdated: boolean("documentation_updated")
      .notNull()
      .default(false),
    reviewedByMembershipId: uuid("reviewed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    /* ---- Linked ledger / incidents -------------------------------------- */
    /** The auto-created ledger event on close. */
    linkedEventId: uuid("linked_event_id").references(() => clientEvents.id, {
      onDelete: "set null",
    }),
    /** Additional related incidents. JSONB array of client_events ids. */
    relatedEventIds: jsonb("related_event_ids")
      .$type<string[]>()
      .notNull()
      .default([]),

    ...timestamps,
  },
  (t) => ({
    clientIdx: index("change_requests_client_idx").on(t.clientId),
    statusIdx: index("change_requests_status_idx").on(t.status),
    typeIdx: index("change_requests_type_idx").on(t.changeType),
    refCodeUq: uniqueIndex("change_requests_ref_code_uq").on(
      t.organizationId,
      t.refCode,
    ),
  }),
);

export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  client: one(clients, {
    fields: [changeRequests.clientId],
    references: [clients.id],
  }),
  organization: one(organizations, {
    fields: [changeRequests.organizationId],
    references: [organizations.id],
  }),
  linkedEvent: one(clientEvents, {
    fields: [changeRequests.linkedEventId],
    references: [clientEvents.id],
  }),
  standardChangeCatalogEntry: one(standardChangeCatalog, {
    fields: [changeRequests.standardChangeCatalogId],
    references: [standardChangeCatalog.id],
  }),
}));

export type ChangeRequest = typeof changeRequests.$inferSelect;
export type NewChangeRequest = typeof changeRequests.$inferInsert;

/* ============================================================================
 * Change Request Evidence (policy §1.8).
 *
 * Attachments / linked artifacts that document the change. Stored as a
 * sub-table so each piece of evidence has its own metadata (kind /
 * captured by / captured at / source url).
 * ========================================================================== */
export const changeRequestEvidenceKindEnum = pgEnum(
  "change_request_evidence_kind",
  [
    "approval_record",
    "pre_change_snapshot",
    "post_change_snapshot",
    "log",
    "screenshot",
    "validation_result",
    "rollback_evidence",
    "communication",
    "other",
  ],
);

export const changeRequestEvidence = pgTable(
  "change_request_evidence",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    changeRequestId: uuid("change_request_id")
      .notNull()
      .references(() => changeRequests.id, { onDelete: "cascade" }),
    kind: changeRequestEvidenceKindEnum("kind").notNull().default("other"),
    label: text("label").notNull(),
    /** Free-form — could be a SharePoint URL, file path, ticket id, etc. */
    url: text("url"),
    /** Inline notes / paste-in transcript / command output / context. */
    notes: text("notes"),
    capturedByMembershipId: uuid("captured_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => ({
    crIdx: index("change_request_evidence_cr_idx").on(t.changeRequestId),
  }),
);

export type ChangeRequestEvidence =
  typeof changeRequestEvidence.$inferSelect;
export type NewChangeRequestEvidence =
  typeof changeRequestEvidence.$inferInsert;
