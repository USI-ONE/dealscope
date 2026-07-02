/**
 * Project Management tables — MSP-focused PM tool inside TechOS.
 *
 * The model is deliberately shaped to MSP project work, not generic
 * task management:
 *
 *   projects               One row per engagement-style project. Every
 *                          project is owned by exactly one TechOS client
 *                          (no internal-only projects in v1). Carries
 *                          the high-level status, RAG health, planned
 *                          vs actual dates, scope, and PM/lead engineer
 *                          assignments.
 *
 *   project_milestones     Major phases / deliverables — "discovery
 *                          complete", "tenant cutover", "post-cutover
 *                          stabilization". Ordered, targetable, and
 *                          referenced in the client-facing report as
 *                          the timeline backbone.
 *
 *   project_tasks          Actionable work items. Optionally nested under
 *                          a milestone so the milestone rollup can
 *                          compute % complete. Each task has an assignee
 *                          (membership), status, due date, position.
 *                          No time-entries in v1 per operator decision
 *                          — % complete drives reporting.
 *
 *   project_status_updates Narrative status posts the PM writes
 *                          weekly/biweekly. Each captures a snapshot of
 *                          health at post time so the report shows
 *                          health drift over time. Marked client_visible
 *                          when ready for the client report; otherwise
 *                          internal-only.
 *
 *   project_documents      Deliverables, runbooks, meeting notes,
 *                          risk-log entries. Holds either a markdown
 *                          body or an external file URL. client_visible
 *                          flag controls report inclusion.
 *
 * Tenancy
 * ───────
 * organization_id is on every table (org-level isolation, same as the
 * rest of TechOS). client_id on `projects` is the per-client tenancy
 * boundary used when generating client-facing reports — the report
 * generator filters strictly to that client_id and never crosses over.
 *
 * Why no time entries in v1
 * ─────────────────────────
 * Operator chose "milestones + task completion only" for v1. A future
 * `project_time_entries` table can attach with project_id + task_id
 * (nullable) + membership_id + hours + billable + entry_date, fed
 * either by manual entry OR by aggregating Syncro ticket time tagged
 * with a project code. Schema is forward-compatible — no migration
 * pain expected.
 */
import {
  bigint,
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
import { relations } from "drizzle-orm";
import { clients } from "./clients";
import { memberships, organizations } from "./organizations";
import { id, timestamps } from "./_shared";

/* --- enums --- */

export const projectStatusEnum = pgEnum("project_status", [
  "planning",
  "in_progress",
  "on_hold",
  "blocked",
  "completed",
  "cancelled",
]);

export const projectHealthEnum = pgEnum("project_health", [
  "green",
  "amber",
  "red",
]);

export const projectPriorityEnum = pgEnum("project_priority", [
  "low",
  "normal",
  "high",
  "critical",
]);

/**
 * Project kind — pre-canned MSP project templates. Drives template
 * selection on the new-project page and groups projects in the org-wide
 * list. `custom` is the escape hatch for one-offs that don't fit a
 * canonical category.
 */
export const projectKindEnum = pgEnum("project_kind", [
  "m365_migration",
  "win11_rollout",
  "server_replacement",
  "network_refresh",
  "onboarding",
  "security_baseline",
  "eol_refresh",
  "cybersecurity_audit",
  "custom",
]);

export const projectMilestoneStatusEnum = pgEnum(
  "project_milestone_status",
  ["planned", "in_progress", "completed", "missed"],
);

export const projectTaskStatusEnum = pgEnum("project_task_status", [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);

export const projectStatusUpdateKindEnum = pgEnum(
  "project_status_update_kind",
  ["status", "risk", "decision", "note"],
);

export const projectDocumentKindEnum = pgEnum("project_document_kind", [
  "deliverable",
  "runbook",
  "meeting_notes",
  "risk_log",
  "scope",
  "other",
]);

/**
 * Dependency kind — v1 only supports finish-to-start (the predecessor
 * must finish before the dependent can start). The classic MS Project
 * model has four kinds (FS/SS/FF/SF); we can add the others without
 * touching the table when an operator asks.
 */
export const projectDependencyKindEnum = pgEnum("project_dependency_kind", [
  "finish_to_start",
]);

/* --- projects --- */

export const projects = pgTable(
  "projects",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The client this project is FOR. Required — every project belongs
     *  to exactly one client. Cross-client / internal-only projects are
     *  not in v1 scope. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Operator-facing code like PROJ-2026-042. Unique per org. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: projectKindEnum("kind").notNull().default("custom"),
    status: projectStatusEnum("status").notNull().default("planning"),
    health: projectHealthEnum("health").notNull().default("green"),
    priority: projectPriorityEnum("priority").notNull().default("normal"),
    /** Short one-line description shown in the list view. */
    summary: text("summary"),
    /** Full scope statement — markdown. Renders on the project detail
     *  page and (when filled) in the client report's Scope section. */
    scopeMd: text("scope_md"),
    /** Project manager — typically owns the client-facing comms +
     *  status reports. */
    primaryPmMembershipId: uuid("primary_pm_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Lead engineer — owns delivery + technical scope. */
    leadEngineerMembershipId: uuid("lead_engineer_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    plannedStartDate: date("planned_start_date"),
    plannedEndDate: date("planned_end_date"),
    actualStartDate: date("actual_start_date"),
    actualEndDate: date("actual_end_date"),
    /** Budget in cents — sized as integer because the values are
     *  modest (typical MSP project is $1k–$200k). */
    budgetCents: integer("budget_cents"),
    /** Quoted contract type — fixed-fee vs T&M shapes how billing
     *  reads. Currently a plain text label so operators can write
     *  "fixed_fee", "T&M", "subscription", etc. */
    contractTypeLabel: text("contract_type_label"),
    /** Total estimated hours at the project level — used by the report
     *  alongside the task-level estimates. */
    totalEstimatedHours: integer("total_estimated_hours"),
    /** Manually-entered actual hours — backs the report until we wire
     *  time entries in v2. */
    totalActualHours: integer("total_actual_hours"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("projects_org_idx").on(t.organizationId),
    clientIdx: index("projects_client_idx").on(t.clientId),
    statusIdx: index("projects_status_idx").on(t.status),
    codeIdx: index("projects_code_idx").on(t.organizationId, t.code),
  }),
);

/* --- milestones --- */

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: date("target_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: projectMilestoneStatusEnum("status").notNull().default("planned"),
    /** USI-side owner of this milestone — typically the lead engineer
     *  or the PM whose name the operator wants on this phase. Distinct
     *  from per-task assignees. */
    assigneeMembershipId: uuid("assignee_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Client-side person this milestone hinges on (sign-off, input,
     *  approval). Distinct from assigneeMembershipId — the assignee
     *  is USI-internal (doing the work), the stakeholder is at the
     *  client. FK declared lazily on the references table since the
     *  projectStakeholders table is defined below in this file. */
    stakeholderId: uuid("stakeholder_id"),
    /** When true, this milestone needs an explicit stakeholder sign-
     *  off before closure. UI shows an amber "Awaiting sign-off"
     *  state when status="completed" but signedOffAt is null. */
    requiresSignoff: boolean("requires_signoff").notNull().default(false),
    signedOffAt: timestamp("signed_off_at", { withTimezone: true }),
    /** Stakeholder who signed off. Defaults to the assigned stakeholder
     *  but operator can override (e.g. if a different person at the
     *  client actually approved). */
    signedOffByStakeholderId: uuid("signed_off_by_stakeholder_id"),
    signoffNotes: text("signoff_notes"),
    /** Display order within the project. */
    position: integer("position").notNull().default(0),
    /** Include in the client-facing report. Most milestones are
     *  client_visible by default; internal-only milestones can be
     *  toggled off. */
    clientVisible: boolean("client_visible").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_milestones_project_idx").on(t.projectId),
    assigneeIdx: index("project_milestones_assignee_idx").on(
      t.assigneeMembershipId,
    ),
    stakeholderIdx: index("project_milestones_stakeholder_idx").on(
      t.stakeholderId,
    ),
  }),
);

/* --- tasks --- */

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Optional milestone parent. Tasks without a milestone show up
     *  in an "Unassigned" bucket in the UI. */
    milestoneId: uuid("milestone_id").references(() => projectMilestones.id, {
      onDelete: "set null",
    }),
    /** Self-reference for subtasks. NULL = top-level task; non-NULL =
     *  subtask of that parent. Single-level nesting only — enforced
     *  in the server action (a row with parent_task_id set may not
     *  itself be the parent of another row). FK is declared with
     *  AnyPgColumn since Drizzle can't auto-infer self-references. */
    parentTaskId: uuid("parent_task_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: projectTaskStatusEnum("status").notNull().default("todo"),
    assigneeMembershipId: uuid("assignee_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Client-side person this task hinges on. Optional. */
    stakeholderId: uuid("stakeholder_id"),
    /** Same sign-off mechanic as milestones. When task is "done" with
     *  requiresSignoff=true + signedOffAt=null, the UI shows an amber
     *  "Awaiting [stakeholder]'s sign-off" badge until the operator
     *  records the approval. */
    requiresSignoff: boolean("requires_signoff").notNull().default(false),
    signedOffAt: timestamp("signed_off_at", { withTimezone: true }),
    signedOffByStakeholderId: uuid("signed_off_by_stakeholder_id"),
    signoffNotes: text("signoff_notes"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    estimatedHours: integer("estimated_hours"),
    /** Display order within the milestone (or root if unassigned). */
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_tasks_project_idx").on(t.projectId),
    milestoneIdx: index("project_tasks_milestone_idx").on(t.milestoneId),
    assigneeIdx: index("project_tasks_assignee_idx").on(t.assigneeMembershipId),
    stakeholderIdx: index("project_tasks_stakeholder_idx").on(t.stakeholderId),
    parentIdx: index("project_tasks_parent_idx").on(t.parentTaskId),
  }),
);

/* --- status updates --- */

export const projectStatusUpdates = pgTable(
  "project_status_updates",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorMembershipId: uuid("author_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    kind: projectStatusUpdateKindEnum("kind").notNull().default("status"),
    /** Snapshot of project.health at the moment of posting — used to
     *  render the trend line on the client report. */
    healthAtPost: projectHealthEnum("health_at_post").notNull(),
    /** Markdown body. */
    body: text("body").notNull(),
    /** When true, this update is included in client-facing reports. */
    clientVisible: boolean("client_visible").notNull().default(true),
    postedAt: timestamp("posted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_status_updates_project_idx").on(t.projectId),
    postedIdx: index("project_status_updates_posted_idx").on(t.postedAt),
  }),
);

/* --- documents --- */

export const projectDocuments = pgTable(
  "project_documents",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: projectDocumentKindEnum("kind").notNull().default("other"),
    title: text("title").notNull(),
    /** Optional inline markdown content. For documents that live as
     *  files (PDFs, DOCX, screenshots), this is null and `fileUrl` is
     *  set instead. */
    bodyMd: text("body_md"),
    /** External URL — SharePoint, Vercel Blob, OneDrive, etc. We don't
     *  enforce a particular blob store in v1. */
    fileUrl: text("file_url"),
    /** Optional MIME hint for files. */
    fileMimeType: text("file_mime_type"),
    uploadedByMembershipId: uuid("uploaded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    clientVisible: boolean("client_visible").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_documents_project_idx").on(t.projectId),
  }),
);

/* --- stakeholders (client-side people) --- */

/**
 * Client-side stakeholders on a project. Distinct from `memberships`
 * (which are USI internal users): these are the people AT the client
 * we work with — CEO sponsor, finance contact, IT lead, etc.
 *
 * Free-form `roleLabel` rather than an enum so operators can match the
 * client's actual title vocabulary without a schema change.
 */
export const projectStakeholders = pgTable(
  "project_stakeholders",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    /** "Sponsor" / "Technical lead" / "Finance contact" / etc. */
    roleLabel: text("role_label"),
    /** The single go-to contact shown in the project header. Only one
     *  stakeholder per project should be primary; the server action
     *  enforces this. */
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_stakeholders_project_idx").on(t.projectId),
  }),
);

/* --- comments (flat thread, scoped to project / milestone / task) --- */

/**
 * Flat discussion thread on a project. Scope:
 *   - Both milestone_id and task_id NULL → project-level comment.
 *   - milestone_id set → comment on that milestone.
 *   - task_id set → comment on that task.
 * The server actions enforce that at most one of (milestone_id, task_id)
 * is set on a given comment.
 *
 * client_visible defaults FALSE: comments are internal operator notes
 * unless explicitly flagged to show on the client report. Threading
 * (parent_comment_id) is deliberately omitted from v1 — flat threads
 * cover the operator's use case until proven otherwise.
 */
export const projectComments = pgTable(
  "project_comments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(() => projectMilestones.id, {
      onDelete: "cascade",
    }),
    taskId: uuid("task_id").references(() => projectTasks.id, {
      onDelete: "cascade",
    }),
    authorMembershipId: uuid("author_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    bodyMd: text("body_md").notNull(),
    clientVisible: boolean("client_visible").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_comments_project_idx").on(t.projectId),
    taskIdx: index("project_comments_task_idx").on(t.taskId),
    milestoneIdx: index("project_comments_milestone_idx").on(t.milestoneId),
  }),
);

/* --- attachments (file references; URL-based for v1) --- */

/**
 * File references attached to a project, milestone, task, or comment.
 * For v1 the operator pastes the URL of a file already hosted in
 * SharePoint / OneDrive / Drive / etc. — no Vercel Blob upload UX yet.
 * Same forward-compatible shape we use for project_documents.fileUrl.
 *
 * Scope: exactly one of project (parent_only) / milestone / task /
 * comment. The server actions enforce single-scope.
 */
export const projectAttachments = pgTable(
  "project_attachments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").references(
      () => projectMilestones.id,
      { onDelete: "cascade" },
    ),
    taskId: uuid("task_id").references(() => projectTasks.id, {
      onDelete: "cascade",
    }),
    commentId: uuid("comment_id").references(() => projectComments.id, {
      onDelete: "cascade",
    }),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    fileMimeType: text("file_mime_type"),
    description: text("description"),
    uploadedByMembershipId: uuid("uploaded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    clientVisible: boolean("client_visible").notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_attachments_project_idx").on(t.projectId),
    taskIdx: index("project_attachments_task_idx").on(t.taskId),
    milestoneIdx: index("project_attachments_milestone_idx").on(t.milestoneId),
    commentIdx: index("project_attachments_comment_idx").on(t.commentId),
  }),
);

/* --- relations --- */

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  primaryPm: one(memberships, {
    fields: [projects.primaryPmMembershipId],
    references: [memberships.id],
    relationName: "projectPrimaryPm",
  }),
  leadEngineer: one(memberships, {
    fields: [projects.leadEngineerMembershipId],
    references: [memberships.id],
    relationName: "projectLeadEngineer",
  }),
  milestones: many(projectMilestones),
  tasks: many(projectTasks),
  statusUpdates: many(projectStatusUpdates),
  documents: many(projectDocuments),
  stakeholders: many(projectStakeholders),
  comments: many(projectComments),
  attachments: many(projectAttachments),
}));

export const projectMilestonesRelations = relations(
  projectMilestones,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [projectMilestones.projectId],
      references: [projects.id],
    }),
    tasks: many(projectTasks),
  }),
);

export const projectTasksRelations = relations(projectTasks, ({ one }) => ({
  project: one(projects, {
    fields: [projectTasks.projectId],
    references: [projects.id],
  }),
  milestone: one(projectMilestones, {
    fields: [projectTasks.milestoneId],
    references: [projectMilestones.id],
  }),
  assignee: one(memberships, {
    fields: [projectTasks.assigneeMembershipId],
    references: [memberships.id],
  }),
}));

export const projectStatusUpdatesRelations = relations(
  projectStatusUpdates,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectStatusUpdates.projectId],
      references: [projects.id],
    }),
    author: one(memberships, {
      fields: [projectStatusUpdates.authorMembershipId],
      references: [memberships.id],
    }),
  }),
);

export const projectDocumentsRelations = relations(
  projectDocuments,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectDocuments.projectId],
      references: [projects.id],
    }),
    uploadedBy: one(memberships, {
      fields: [projectDocuments.uploadedByMembershipId],
      references: [memberships.id],
    }),
  }),
);

/* --- task dependencies (within-project, finish-to-start v1) --- */

/**
 * Predecessor → dependent edge for tasks. `dependent_task` waits for
 * `predecessor_task` to finish. Within-project only — both task FKs
 * resolve to the same project_id (denormalized for query speed).
 *
 * Cycle prevention lives in the server action, not the DB: the
 * createTaskDependency action walks the predecessor chain before
 * insert and refuses on cycle. DB level enforces uniqueness + self-
 * reference exclusion only.
 */
export const projectTaskDependencies = pgTable(
  "project_task_dependencies",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Denormalized for fast project-scoped queries. Both task FKs
     *  resolve to this project. */
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The task that's WAITING. */
    dependentTaskId: uuid("dependent_task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    /** The task that must finish first. */
    predecessorTaskId: uuid("predecessor_task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    kind: projectDependencyKindEnum("kind")
      .notNull()
      .default("finish_to_start"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index("project_task_deps_project_idx").on(t.projectId),
    dependentIdx: index("project_task_deps_dependent_idx").on(
      t.dependentTaskId,
    ),
    predecessorIdx: index("project_task_deps_predecessor_idx").on(
      t.predecessorTaskId,
    ),
  }),
);

/* --- project dependencies (cross-project, same org) --- */

/**
 * Predecessor → dependent edge for projects. Same convention as task
 * deps. Cross-client is allowed (a USI-internal toolkit project can
 * block a client engagement, or two client engagements can depend on
 * each other when a shared resource is involved) — only the org
 * boundary is enforced.
 */
export const projectDependencies = pgTable(
  "project_dependencies",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dependentProjectId: uuid("dependent_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    predecessorProjectId: uuid("predecessor_project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: projectDependencyKindEnum("kind")
      .notNull()
      .default("finish_to_start"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    dependentIdx: index("project_deps_dependent_idx").on(t.dependentProjectId),
    predecessorIdx: index("project_deps_predecessor_idx").on(
      t.predecessorProjectId,
    ),
    orgIdx: index("project_deps_org_idx").on(t.organizationId),
  }),
);
