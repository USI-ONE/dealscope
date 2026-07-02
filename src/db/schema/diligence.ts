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
import { INDUSTRY_ENUM_VALUES } from "@/lib/diligence/industries";

export const diligenceEngagementStatusEnum = pgEnum("diligence_engagement_status", [
  "planning",
  "in_progress",
  "drafting",
  "delivered",
]);

/**
 * Industry of the diligence target. Drives which industry-specific
 * questions appear in the questionnaire. The full list lives in
 * `src/lib/diligence/industries.ts` so the UI dropdown and the DB
 * enum stay in sync.
 */
export const industryEnum = pgEnum("industry", INDUSTRY_ENUM_VALUES);

export const diligenceSessionModeEnum = pgEnum("diligence_session_mode", [
  "onsite",
  "remote",
  "hybrid",
]);

export const diligenceAttendeeSideEnum = pgEnum("diligence_attendee_side", [
  "target",
  "interviewer",
]);

export const diligenceArtifactKindEnum = pgEnum("diligence_artifact_kind", [
  "application",
  "server",
  "network_site",
  "identity",
  "vendor",
  "license",
  "ai_tool",
  "intercompany_dependency",
  "key_person",
  "contract",
  "dataset",
  "integration",
  "process_gap",
  "other",
]);

export const diligenceRiskLevelEnum = pgEnum("diligence_risk_level", [
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);

export const diligenceFindingSeverityEnum = pgEnum("diligence_finding_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const diligenceFindingStatusEnum = pgEnum("diligence_finding_status", [
  "open",
  "mitigated",
  "accepted",
  "closed",
]);

export const diligenceCostTimingEnum = pgEnum("diligence_cost_timing", [
  "pre_close",
  "first_30",
  "thirty_to_90",
  "ninety_to_180",
  "ongoing",
]);

export const diligenceEngagements = pgTable(
  "diligence_engagements",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    targetCompanyName: text("target_company_name").notNull(),
    codename: text("codename"),
    status: diligenceEngagementStatusEnum("status").notNull().default("planning"),
    industry: industryEnum("industry"),
    leadInterviewerMembershipId: uuid("lead_interviewer_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    partners: text("partners"),
    summary: text("summary"),
    kickoffDate: date("kickoff_date"),
    deliveryDate: date("delivery_date"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("dil_eng_org_idx").on(t.organizationId),
    clientIdx: index("dil_eng_client_idx").on(t.clientId),
  }),
);

export const diligenceSessions = pgTable(
  "diligence_sessions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes"),
    location: text("location"),
    mode: diligenceSessionModeEnum("mode").notNull().default("onsite"),
    notes: text("notes"),
    summary: text("summary"),
    rawNotesJson: jsonb("raw_notes_json"),
    audioUrl: text("audio_url"),
    audioChunksJson: jsonb("audio_chunks_json").$type<string[]>().notNull().default([]),
    transcriptText: text("transcript_text"),
    /** Pipeline status: 'none' | 'uploading' | 'transcribing' | 'extracting' | 'done' | 'error' */
    transcriptStatus: text("transcript_status").notNull().default("none"),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_sess_engagement_idx").on(t.engagementId),
  }),
);

export const diligenceAttendees = pgTable(
  "diligence_attendees",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => diligenceSessions.id, { onDelete: "cascade" }),
    side: diligenceAttendeeSideEnum("side").notNull(),
    fullName: text("full_name").notNull(),
    title: text("title"),
    email: text("email"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    sessionIdx: index("dil_att_session_idx").on(t.sessionId),
  }),
);

export const diligenceArtifacts = pgTable(
  "diligence_artifacts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => diligenceSessions.id, {
      onDelete: "set null",
    }),
    kind: diligenceArtifactKindEnum("kind").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    data: jsonb("data").$type<Record<string, string>>().default({}),
    riskLevel: diligenceRiskLevelEnum("risk_level").notNull().default("info"),
    needsAttention: boolean("needs_attention").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_art_engagement_idx").on(t.engagementId),
    kindIdx: index("dil_art_kind_idx").on(t.kind),
  }),
);

export const diligenceFindings = pgTable(
  "diligence_findings",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    refCode: text("ref_code").notNull(),
    severity: diligenceFindingSeverityEnum("severity").notNull(),
    title: text("title").notNull(),
    narrative: text("narrative"),
    relatedArtifactIds: jsonb("related_artifact_ids").$type<string[]>().notNull().default([]),
    status: diligenceFindingStatusEnum("status").notNull().default("open"),
    immediate: boolean("immediate").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_fnd_engagement_idx").on(t.engagementId),
    refUnq: uniqueIndex("dil_fnd_ref_unq").on(t.engagementId, t.refCode),
  }),
);

export const diligenceCostLines = pgTable(
  "diligence_cost_lines",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    workItem: text("work_item").notNull(),
    lowCents: integer("low_cents").notNull().default(0),
    highCents: integer("high_cents").notNull().default(0),
    recurring: boolean("recurring").notNull().default(false),
    timing: diligenceCostTimingEnum("timing").notNull().default("first_30"),
    category: text("category"),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    findingId: uuid("finding_id").references(() => diligenceFindings.id, { onDelete: "set null" }),
    costType: text("cost_type"),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_cost_engagement_idx").on(t.engagementId),
  }),
);

export const diligenceQuestions = pgTable(
  "diligence_questions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    question: text("question").notNull(),
    followUps: jsonb("follow_ups").$type<string[]>().notNull().default([]),
    artifactKindHint: diligenceArtifactKindEnum("artifact_kind_hint"),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("dil_q_org_idx").on(t.organizationId),
    catIdx: index("dil_q_cat_idx").on(t.organizationId, t.category),
  }),
);

export const diligenceQuestionResponses = pgTable(
  "diligence_question_responses",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => diligenceSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => diligenceQuestions.id, { onDelete: "cascade" }),
    response: text("response"),
    satisfactory: boolean("satisfactory").notNull().default(false),
    followUpsSurfaced: jsonb("follow_ups_surfaced").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => ({
    sessionQUnq: uniqueIndex("dil_qr_session_q_unq").on(t.sessionId, t.questionId),
  }),
);

/**
 * Engagement-level question responses. The question catalog itself
 * lives in code (`src/lib/diligence/question-library.ts`) — stable
 * `question_key` strings reference the library entries. Most diligence
 * answers don't belong to a specific session (they're the cumulative
 * "what do we know" snapshot), so this is keyed by engagement, not
 * session.
 */
export const diligenceEngagementResponses = pgTable(
  "diligence_engagement_responses",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    /** JSONB so any QuestionKind can be persisted without schema churn. */
    value: jsonb("value"),
    /** "We got a clear answer" flag — drives % satisfactory progress. */
    satisfactory: boolean("satisfactory").notNull().default(false),
    notes: text("notes"),
    answeredByMembershipId: uuid("answered_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_eng_resp_engagement_idx").on(t.engagementId),
    keyUnq: uniqueIndex("dil_eng_resp_eng_key_unq").on(
      t.engagementId,
      t.questionKey,
    ),
  }),
);

export const diligenceBriefings = pgTable(
  "diligence_briefings",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => diligenceEngagements.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    generatedByMembershipId: uuid("generated_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    contentJson: jsonb("content_json").notNull(),
    docxBlobUrl: text("docx_blob_url"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    engagementIdx: index("dil_brief_engagement_idx").on(t.engagementId),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */
export const diligenceEngagementsRelations = relations(
  diligenceEngagements,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [diligenceEngagements.organizationId],
      references: [organizations.id],
    }),
    client: one(clients, {
      fields: [diligenceEngagements.clientId],
      references: [clients.id],
    }),
    leadInterviewer: one(memberships, {
      fields: [diligenceEngagements.leadInterviewerMembershipId],
      references: [memberships.id],
    }),
    sessions: many(diligenceSessions),
    artifacts: many(diligenceArtifacts),
    findings: many(diligenceFindings),
    costLines: many(diligenceCostLines),
    briefings: many(diligenceBriefings),
    responses: many(diligenceEngagementResponses),
  }),
);

export const diligenceEngagementResponsesRelations = relations(
  diligenceEngagementResponses,
  ({ one }) => ({
    engagement: one(diligenceEngagements, {
      fields: [diligenceEngagementResponses.engagementId],
      references: [diligenceEngagements.id],
    }),
    answeredBy: one(memberships, {
      fields: [diligenceEngagementResponses.answeredByMembershipId],
      references: [memberships.id],
    }),
  }),
);

export const diligenceSessionsRelations = relations(diligenceSessions, ({ one, many }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceSessions.engagementId],
    references: [diligenceEngagements.id],
  }),
  attendees: many(diligenceAttendees),
  artifacts: many(diligenceArtifacts),
  questionResponses: many(diligenceQuestionResponses),
}));

export const diligenceAttendeesRelations = relations(diligenceAttendees, ({ one }) => ({
  session: one(diligenceSessions, {
    fields: [diligenceAttendees.sessionId],
    references: [diligenceSessions.id],
  }),
}));

export const diligenceArtifactsRelations = relations(diligenceArtifacts, ({ one }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceArtifacts.engagementId],
    references: [diligenceEngagements.id],
  }),
  session: one(diligenceSessions, {
    fields: [diligenceArtifacts.sessionId],
    references: [diligenceSessions.id],
  }),
}));

export const diligenceFindingsRelations = relations(diligenceFindings, ({ one, many }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceFindings.engagementId],
    references: [diligenceEngagements.id],
  }),
  costLines: many(diligenceCostLines),
}));

export const diligenceCostLinesRelations = relations(diligenceCostLines, ({ one }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceCostLines.engagementId],
    references: [diligenceEngagements.id],
  }),
  finding: one(diligenceFindings, {
    fields: [diligenceCostLines.findingId],
    references: [diligenceFindings.id],
  }),
}));

export const diligenceQuestionsRelations = relations(diligenceQuestions, ({ many }) => ({
  responses: many(diligenceQuestionResponses),
}));

export const diligenceQuestionResponsesRelations = relations(
  diligenceQuestionResponses,
  ({ one }) => ({
    session: one(diligenceSessions, {
      fields: [diligenceQuestionResponses.sessionId],
      references: [diligenceSessions.id],
    }),
    question: one(diligenceQuestions, {
      fields: [diligenceQuestionResponses.questionId],
      references: [diligenceQuestions.id],
    }),
  }),
);

export const diligenceBriefingsRelations = relations(diligenceBriefings, ({ one }) => ({
  engagement: one(diligenceEngagements, {
    fields: [diligenceBriefings.engagementId],
    references: [diligenceEngagements.id],
  }),
}));

export type DiligenceEngagement = typeof diligenceEngagements.$inferSelect;
export type NewDiligenceEngagement = typeof diligenceEngagements.$inferInsert;
export type DiligenceSession = typeof diligenceSessions.$inferSelect;
export type NewDiligenceSession = typeof diligenceSessions.$inferInsert;
export type DiligenceAttendee = typeof diligenceAttendees.$inferSelect;
export type DiligenceArtifact = typeof diligenceArtifacts.$inferSelect;
export type NewDiligenceArtifact = typeof diligenceArtifacts.$inferInsert;
export type DiligenceFinding = typeof diligenceFindings.$inferSelect;
export type NewDiligenceFinding = typeof diligenceFindings.$inferInsert;
export type DiligenceCostLine = typeof diligenceCostLines.$inferSelect;
export type NewDiligenceCostLine = typeof diligenceCostLines.$inferInsert;
export type DiligenceQuestion = typeof diligenceQuestions.$inferSelect;
export type DiligenceBriefing = typeof diligenceBriefings.$inferSelect;
export type DiligenceEngagementResponse =
  typeof diligenceEngagementResponses.$inferSelect;
export type NewDiligenceEngagementResponse =
  typeof diligenceEngagementResponses.$inferInsert;
