import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { memberships, organizations } from "./organizations";
import { diligenceEngagements } from "./diligence";

/* ============================================================================
 * ENUMS
 * ========================================================================== */

export const diligenceDealStageEnum = pgEnum("diligence_deal_stage", [
  "prospect",
  "nda",
  "indication",
  "loi",
  "exclusivity",
  "due_diligence",
  "final_review",
  "closing",
  "closed",
  "terminated",
]);

export const diligenceVaultAccessTierEnum = pgEnum("diligence_vault_access_tier", [
  "private",   // team-only
  "shared",    // visible to invited deal-room parties
]);

export const diligenceRequestStatusEnum = pgEnum("diligence_request_status", [
  "pending",
  "received",
  "accepted",
  "waived",
  "rejected",
]);

export const diligenceTaskStatusEnum = pgEnum("diligence_task_status", [
  "open",
  "in_progress",
  "blocked",
  "done",
]);

export const diligenceTaskPriorityEnum = pgEnum("diligence_task_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const diligencePartyRoleEnum = pgEnum("diligence_party_role", [
  "acquirer",
  "target",
  "advisor",
  "lender",
  "other",
]);

export const diligencePartyInviteRoleEnum = pgEnum("diligence_party_invite_role", [
  "viewer",      // read-only vault access + dialogue replies
  "contributor", // can upload vault files + submit data requests
]);

export const diligenceDialogueStatusEnum = pgEnum("diligence_dialogue_status", [
  "open",
  "answered",
  "closed",
]);

/* ============================================================================
 * DEAL VAULT — file hosting via Vercel Blob
 * ========================================================================== */

export const diligenceVaultFiles = pgTable(
  "diligence_vault_files",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    /** Which diligence track this file relates to (null = general). */
    track: text("track"),
    name: text("name").notNull(),
    description: text("description"),
    blobUrl: text("blob_url").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    mimeType: text("mime_type"),
    accessTier: diligenceVaultAccessTierEnum("access_tier").notNull().default("private"),
    uploadedByMembershipId: uuid("uploaded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_vault_engagement_idx").on(t.engagementId),
    trackIdx: index("dil_vault_track_idx").on(t.engagementId, t.track),
  }),
);

/* ============================================================================
 * DATA REQUESTS — structured request list sent to counterparty
 * ========================================================================== */

export const diligenceDataRequests = pgTable(
  "diligence_data_requests",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    /** Diligence track this request belongs to (null = general). */
    track: text("track"),
    title: text("title").notNull(),
    description: text("description"),
    status: diligenceRequestStatusEnum("status").notNull().default("pending"),
    dueDate: date("due_date"),
    /** Free-text name of person/team responsible on the counterparty side. */
    assignedTo: text("assigned_to"),
    /** If fulfilled, link to the vault file that satisfies this request. */
    fulfilledByFileId: uuid("fulfilled_by_file_id").references(
      () => diligenceVaultFiles.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_req_engagement_idx").on(t.engagementId),
    statusIdx: index("dil_req_status_idx").on(t.engagementId, t.status),
  }),
);

/* ============================================================================
 * WORKSTREAM TASKS — action items and owner assignments
 * ========================================================================== */

export const diligenceWorkstreamTasks = pgTable(
  "diligence_workstream_tasks",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    track: text("track"),
    title: text("title").notNull(),
    description: text("description"),
    status: diligenceTaskStatusEnum("status").notNull().default("open"),
    priority: diligenceTaskPriorityEnum("priority").notNull().default("medium"),
    ownerMembershipId: uuid("owner_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_task_engagement_idx").on(t.engagementId),
    statusIdx: index("dil_task_status_idx").on(t.engagementId, t.status),
  }),
);

/* ============================================================================
 * MILESTONES — deal-stage progress checkpoints
 * ========================================================================== */

export const diligenceMilestones = pgTable(
  "diligence_milestones",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: date("target_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByMembershipId: uuid("completed_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_mile_engagement_idx").on(t.engagementId),
  }),
);

/* ============================================================================
 * DEAL ROOM PARTIES — counterparties and advisors
 * ========================================================================== */

export const diligenceParties = pgTable(
  "diligence_parties",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: diligencePartyRoleEnum("role").notNull().default("target"),
    emailDomain: text("email_domain"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_party_engagement_idx").on(t.engagementId),
  }),
);

/* ============================================================================
 * PARTY INVITATIONS — magic-link access for external deal room participants
 * ========================================================================== */

export const diligencePartyInvitations = pgTable(
  "diligence_party_invitations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => diligenceParties.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    /** Scoped role for this individual. */
    role: diligencePartyInviteRoleEnum("role").notNull().default("viewer"),
    /** Token included in the invite link — single-use magic link. */
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    invitedByMembershipId: uuid("invited_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_inv_engagement_idx").on(t.engagementId),
    tokenIdx: index("dil_inv_token_idx").on(t.token),
  }),
);

/* ============================================================================
 * DIALOGUE — structured Q&A threads between team and parties
 * ========================================================================== */

export const diligenceDialogueThreads = pgTable(
  "diligence_dialogue_threads",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    track: text("track"),
    subject: text("subject").notNull(),
    status: diligenceDialogueStatusEnum("status").notNull().default("open"),
    /** If submitted by a team member. */
    submittedByMembershipId: uuid("submitted_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** If submitted by an external party invitation. */
    submittedByInvitationId: uuid("submitted_by_invitation_id").references(
      () => diligencePartyInvitations.id,
      { onDelete: "set null" },
    ),
    assignedToMembershipId: uuid("assigned_to_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Internal threads are not visible to deal room parties. */
    isInternal: boolean("is_internal").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_dial_engagement_idx").on(t.engagementId),
    statusIdx: index("dil_dial_status_idx").on(t.engagementId, t.status),
  }),
);

export const diligenceDialogueMessages = pgTable(
  "diligence_dialogue_messages",
  {
    id: id(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => diligenceDialogueThreads.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    fromMembershipId: uuid("from_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    fromInvitationId: uuid("from_invitation_id").references(
      () => diligencePartyInvitations.id,
      { onDelete: "set null" },
    ),
    /** Internal notes are only visible to the acquiring team. */
    isInternal: boolean("is_internal").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    threadIdx: index("dil_msg_thread_idx").on(t.threadId),
  }),
);

/* ============================================================================
 * ENGAGEMENT LOG — audit trail
 * ========================================================================== */

export const diligenceEngagementLog = pgTable(
  "diligence_engagement_log",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    actorMembershipId: uuid("actor_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    actorInvitationId: uuid("actor_invitation_id").references(
      () => diligencePartyInvitations.id,
      { onDelete: "set null" },
    ),
    /** Display name captured at log time so it survives membership deletion. */
    actorName: text("actor_name"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    engagementIdx: index("dil_log_engagement_idx").on(t.engagementId),
    createdIdx: index("dil_log_created_idx").on(t.engagementId, t.createdAt),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */

export const diligenceVaultFilesRelations = relations(diligenceVaultFiles, ({ one }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceVaultFiles.engagementId],
    references: [diligenceEngagements.id],
  }),
  uploadedBy: one(memberships, {
    fields: [diligenceVaultFiles.uploadedByMembershipId],
    references: [memberships.id],
  }),
}));

export const diligenceDataRequestsRelations = relations(diligenceDataRequests, ({ one }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceDataRequests.engagementId],
    references: [diligenceEngagements.id],
  }),
  fulfilledByFile: one(diligenceVaultFiles, {
    fields: [diligenceDataRequests.fulfilledByFileId],
    references: [diligenceVaultFiles.id],
  }),
}));

export const diligenceWorkstreamTasksRelations = relations(diligenceWorkstreamTasks, ({ one }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceWorkstreamTasks.engagementId],
    references: [diligenceEngagements.id],
  }),
  owner: one(memberships, {
    fields: [diligenceWorkstreamTasks.ownerMembershipId],
    references: [memberships.id],
  }),
}));

export const diligenceMilestonesRelations = relations(diligenceMilestones, ({ one }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceMilestones.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export const diligencePartiesRelations = relations(diligenceParties, ({ one, many }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceParties.engagementId],
    references: [diligenceEngagements.id],
  }),
  invitations: many(diligencePartyInvitations),
}));

export const diligencePartyInvitationsRelations = relations(
  diligencePartyInvitations,
  ({ one }) => ({
    party: one(diligenceParties, {
      fields: [diligencePartyInvitations.partyId],
      references: [diligenceParties.id],
    }),
    engagement: one(diligenceEngagements, {
      fields: [diligencePartyInvitations.engagementId],
      references: [diligenceEngagements.id],
    }),
  }),
);

export const diligenceDialogueThreadsRelations = relations(
  diligenceDialogueThreads,
  ({ one, many }) => ({
    engagement: one(diligenceEngagements, {
      fields: [diligenceDialogueThreads.engagementId],
      references: [diligenceEngagements.id],
    }),
    messages: many(diligenceDialogueMessages),
  }),
);

export const diligenceDialogueMessagesRelations = relations(
  diligenceDialogueMessages,
  ({ one }) => ({
    thread: one(diligenceDialogueThreads, {
      fields: [diligenceDialogueMessages.threadId],
      references: [diligenceDialogueThreads.id],
    }),
  }),
);

export const diligenceEngagementLogRelations = relations(
  diligenceEngagementLog,
  ({ one }) => ({
    engagement: one(diligenceEngagements, {
      fields: [diligenceEngagementLog.engagementId],
      references: [diligenceEngagements.id],
    }),
  }),
);

/* ============================================================================
 * EXPORTED TYPES
 * ========================================================================== */

export type DiligenceVaultFile = typeof diligenceVaultFiles.$inferSelect;
export type NewDiligenceVaultFile = typeof diligenceVaultFiles.$inferInsert;
export type DiligenceDataRequest = typeof diligenceDataRequests.$inferSelect;
export type NewDiligenceDataRequest = typeof diligenceDataRequests.$inferInsert;
export type DiligenceWorkstreamTask = typeof diligenceWorkstreamTasks.$inferSelect;
export type NewDiligenceWorkstreamTask = typeof diligenceWorkstreamTasks.$inferInsert;
export type DiligenceMilestone = typeof diligenceMilestones.$inferSelect;
export type NewDiligenceMilestone = typeof diligenceMilestones.$inferInsert;
export type DiligenceParty = typeof diligenceParties.$inferSelect;
export type DiligencePartyInvitation = typeof diligencePartyInvitations.$inferSelect;
export type DiligenceDialogueThread = typeof diligenceDialogueThreads.$inferSelect;
export type DiligenceDialogueMessage = typeof diligenceDialogueMessages.$inferSelect;
export type DiligenceEngagementLog = typeof diligenceEngagementLog.$inferSelect;
