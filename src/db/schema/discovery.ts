/**
 * Pre-install site discovery — a field-first, phone-first walkthrough
 * that captures everything an install team needs to scope a
 * rip-and-replace without a second visit.
 *
 * The question set is code-defined (src/lib/discovery/templates), so the
 * database only stores what the walker captured:
 *   - discovery_projects  — one per site walk
 *   - discovery_answers   — one row per (project, question key)
 *   - discovery_records   — repeating inventory rows (switches, APs,
 *                           workstations, servers, cameras, risks, …)
 *   - discovery_photos    — photos attached to a question, a record,
 *                           or the project as a whole
 *
 * Records and answers use client-generated ids / natural keys so a walker
 * can keep working with no signal (basements, server rooms) and the
 * device outbox replays the writes idempotently once back online.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
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
import { diligenceEngagements } from "./diligence";

export const discoveryProjectStatusEnum = pgEnum("discovery_project_status", [
  "planning",
  "in_progress",
  "review",
  "complete",
  "cancelled",
]);

export const discoveryProjects = pgTable(
  "discovery_projects",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Which code-defined template drives the question set. */
    templateKey: text("template_key").notNull().default("pre_install_v1"),
    status: discoveryProjectStatusEnum("status").notNull().default("planning"),

    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    engagementId: uuid("engagement_id").references(
      () => diligenceEngagements.id,
      { onDelete: "set null" },
    ),

    siteAddress: text("site_address"),
    leadMembershipId: uuid("lead_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    scheduledDate: date("scheduled_date"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    summary: text("summary"),
    /** Section keys the walker marked N/A as a whole (e.g. no IDFs). */
    naSections: jsonb("na_sections").$type<string[]>().notNull().default([]),

    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("discovery_projects_org_idx").on(t.organizationId),
    clientIdx: index("discovery_projects_client_idx").on(t.clientId),
  }),
);

/**
 * Answer payload. `v` is the primary answer; the rest are the secondary
 * columns the checklist carries on some rows (qty, risk, condition, …).
 */
export type DiscoveryAnswerValue = {
  v?: string | number | boolean | string[] | Record<string, string> | null;
  extras?: Record<string, string | number | null>;
  /** Couldn't be answered on site — counts as addressed, tracked as an open follow-up. */
  followUp?: boolean;
};

export const discoveryAnswers = pgTable(
  "discovery_answers",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => discoveryProjects.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    value: jsonb("value").$type<DiscoveryAnswerValue>().notNull().default({}),
    notApplicable: boolean("not_applicable").notNull().default(false),
    notes: text("notes"),
    answeredByMembershipId: uuid("answered_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Client-side edit time — last-writer-wins when the outbox replays. */
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    projectKeyUq: uniqueIndex("discovery_answers_project_key_uq").on(
      t.projectId,
      t.questionKey,
    ),
  }),
);

export const discoveryRecords = pgTable(
  "discovery_records",
  {
    /** Client-generated so records can be created offline. */
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => discoveryProjects.id, { onDelete: "cascade" }),
    /** Template table key, e.g. "access_switches", "workstations". */
    tableKey: text("table_key").notNull(),
    data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    projectTableIdx: index("discovery_records_project_table_idx").on(
      t.projectId,
      t.tableKey,
    ),
  }),
);

export const discoveryPhotos = pgTable(
  "discovery_photos",
  {
    /** Client-generated so the outbox can retry registration safely. */
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => discoveryProjects.id, { onDelete: "cascade" }),
    /** Exactly one of questionKey / recordId is normally set; both null
     *  means a general project photo. */
    questionKey: text("question_key"),
    recordId: uuid("record_id").references(() => discoveryRecords.id, {
      onDelete: "cascade",
    }),
    /** Section the photo was taken from — used for gallery grouping. */
    sectionKey: text("section_key"),

    url: text("url").notNull(),
    pathname: text("pathname").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    widthPx: integer("width_px"),
    heightPx: integer("height_px"),
    caption: text("caption"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    /** Picked by the walker to appear in the client assessment. */
    inReport: boolean("in_report").notNull().default(false),

    uploadedByMembershipId: uuid("uploaded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("discovery_photos_project_idx").on(t.projectId),
    questionIdx: index("discovery_photos_question_idx").on(
      t.projectId,
      t.questionKey,
    ),
    recordIdx: index("discovery_photos_record_idx").on(t.recordId),
  }),
);

/* ============================================================================
 * Network topologies — extracted by Claude vision from a UniFi/controller
 * topology screenshot, a whiteboard, a hand-drawn diagram, or notes on a
 * floor plan, then reviewed and edited by the walker.
 * ========================================================================== */
export type TopologyNode = {
  id: string;
  label: string;
  type: string;
  make?: string | null;
  model?: string | null;
  ip?: string | null;
  mac?: string | null;
  location?: string | null;
  notes?: string | null;
  confidence?: "high" | "medium" | "low";
  /** Set once the node has been pushed into the walk's inventory. */
  recordId?: string | null;
};

export type TopologyLink = {
  id: string;
  from: string;
  to: string;
  medium?: string | null;
  speed?: string | null;
  fromPort?: string | null;
  toPort?: string | null;
  label?: string | null;
  confidence?: "high" | "medium" | "low";
};

export type TopologyGraph = {
  summary: string;
  nodes: TopologyNode[];
  links: TopologyLink[];
  vlans: Array<{ id: string; name?: string | null; subnet?: string | null; notes?: string | null }>;
  locations: Array<{ name: string; notes?: string | null }>;
  uncertainties: string[];
};

export const discoveryTopologies = pgTable(
  "discovery_topologies",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => discoveryProjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** unifi | whiteboard | handwritten | floorplan | other */
    sourceKind: text("source_kind").notNull().default("other"),
    sourcePhotoIds: jsonb("source_photo_ids").$type<string[]>().notNull().default([]),
    /** extracting | ready | error */
    status: text("status").notNull().default("extracting"),
    graph: jsonb("graph").$type<TopologyGraph | null>(),
    error: text("error"),
    model: text("model"),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("discovery_topologies_project_idx").on(t.projectId),
  }),
);

export type DiscoveryTopology = typeof discoveryTopologies.$inferSelect;

export const discoveryProjectsRelations = relations(
  discoveryProjects,
  ({ one, many }) => ({
    client: one(clients, {
      fields: [discoveryProjects.clientId],
      references: [clients.id],
    }),
    engagement: one(diligenceEngagements, {
      fields: [discoveryProjects.engagementId],
      references: [diligenceEngagements.id],
    }),
    answers: many(discoveryAnswers),
    records: many(discoveryRecords),
    photos: many(discoveryPhotos),
  }),
);

export const discoveryAnswersRelations = relations(
  discoveryAnswers,
  ({ one }) => ({
    project: one(discoveryProjects, {
      fields: [discoveryAnswers.projectId],
      references: [discoveryProjects.id],
    }),
  }),
);

export const discoveryRecordsRelations = relations(
  discoveryRecords,
  ({ one, many }) => ({
    project: one(discoveryProjects, {
      fields: [discoveryRecords.projectId],
      references: [discoveryProjects.id],
    }),
    photos: many(discoveryPhotos),
  }),
);

export const discoveryPhotosRelations = relations(
  discoveryPhotos,
  ({ one }) => ({
    project: one(discoveryProjects, {
      fields: [discoveryPhotos.projectId],
      references: [discoveryProjects.id],
    }),
    record: one(discoveryRecords, {
      fields: [discoveryPhotos.recordId],
      references: [discoveryRecords.id],
    }),
  }),
);

export type DiscoveryProject = typeof discoveryProjects.$inferSelect;
export type DiscoveryAnswer = typeof discoveryAnswers.$inferSelect;
export type DiscoveryRecord = typeof discoveryRecords.$inferSelect;
export type DiscoveryPhoto = typeof discoveryPhotos.$inferSelect;

export const DISCOVERY_STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  review: "In review",
  complete: "Complete",
  cancelled: "Cancelled",
};

/**
 * Cached AI narrative for a client-facing report. `kind` is "site" (key =
 * project id) or "portfolio" (key = hash of the selected project ids).
 * `sourceHash` fingerprints the walk data it was written from, so the page
 * can tell when it is out of date.
 */
export const discoveryReports = pgTable(
  "discovery_reports",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    reportKey: text("report_key").notNull(),
    sourceHash: text("source_hash").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    model: text("model"),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    keyIdx: uniqueIndex("discovery_reports_key_idx").on(t.organizationId, t.kind, t.reportKey),
  }),
);

/**
 * Remediation work for a walk. Generated from the assessment findings,
 * flagged inventory and planned drops (`sourceRef` keeps that idempotent),
 * or added by hand. Closing a finding-sourced task resolves that finding
 * in the client assessment, so the grade improves as the crew works.
 */
export const discoveryTasks = pgTable(
  "discovery_tasks",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => discoveryProjects.id, { onDelete: "cascade" }),
    /** finding | item | drop | manual */
    source: text("source").notNull().default("manual"),
    /** e.g. "finding:network.firewall", "item:<recordId>", "drop:drop_ap" */
    sourceRef: text("source_ref"),
    area: text("area"),
    title: text("title").notNull(),
    detail: text("detail"),
    /** Blocker | High | Medium | Low */
    priority: text("priority").notNull().default("Medium"),
    /** open | in_progress | done | skipped */
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByMembershipId: uuid("completed_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    createdByMembershipId: uuid("created_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("discovery_tasks_project_idx").on(t.projectId),
  }),
);
export type DiscoveryTask = typeof discoveryTasks.$inferSelect;

/**
 * A no-login form sent to someone at the client (branch manager etc.)
 * with the walk's open questions. Answers write straight into
 * discovery_answers; `responses` keeps what was submitted, for the record.
 */
export const discoveryInfoRequests = pgTable(
  "discovery_info_requests",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => discoveryProjects.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    recipientName: text("recipient_name"),
    recipientEmail: text("recipient_email"),
    message: text("message"),
    questionKeys: jsonb("question_keys").$type<string[]>().notNull().default([]),
    responses: jsonb("responses")
      .$type<Record<string, { v: string | string[] | Record<string, string> | null; unknown?: boolean; note?: string }>>()
      .notNull()
      .default({}),
    /** open | submitted | closed */
    status: text("status").notNull().default("open"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByMembershipId: uuid("created_by_membership_id").references(() => memberships.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => ({
    tokenIdx: uniqueIndex("discovery_info_requests_token_idx").on(t.token),
    projectIdx: index("discovery_info_requests_project_idx").on(t.projectId),
  }),
);
export type DiscoveryInfoRequest = typeof discoveryInfoRequests.$inferSelect;
