/**
 * Per-client procedures (SOPs) and procedure-run history.
 *
 *   client_procedures        — the runbook itself: title, steps array.
 *   client_procedure_runs    — history of every time a procedure was run,
 *                              with per-step completion timestamps + notes.
 *
 * The "run" workflow: pick a procedure → start a run → step through and
 * mark each step done as you go (timestamps captured) → complete. The
 * procedure's last_run_at updates from the most recent completed run.
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { memberships, organizations } from "./organizations";
import { clients } from "./clients";

export const procedureKindEnum = pgEnum("procedure_kind", [
  "onboarding",
  "offboarding",
  "device_onboarding",
  "device_offboarding",
  "password_rotation",
  "firmware_update",
  "cert_renewal",
  "dr_test",
  "incident_response",
  "audit",
  "monthly_review",
  "quarterly_review",
  "annual_review",
  "other",
]);

export const procedureRunStatusEnum = pgEnum("procedure_run_status", [
  "in_progress",
  "completed",
  "abandoned",
]);

/** A single step in a procedure. Stored as JSONB inside `client_procedures.steps`. */
export type ProcedureStep = {
  /** Stable id so runs can refer to a step by id even if the order changes later. */
  id: string;
  text: string;
  hint?: string;
};

/** Per-step result captured during a run. */
export type ProcedureStepResult = {
  /** Position in the procedure.steps array at the time the run started. */
  stepIndex: number;
  /** Mirror of the step text at the time of the run (so historical runs are readable
   *  even if the procedure has since been edited). */
  stepText: string;
  done: boolean;
  doneAt: string | null;
  notes: string | null;
};

export const clientProcedures = pgTable(
  "client_procedures",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: procedureKindEnum("kind").notNull().default("other"),
    description: text("description"),
    /** Array of `ProcedureStep`. Order is preserved. */
    steps: jsonb("steps")
      .$type<ProcedureStep[]>()
      .notNull()
      .default([]),
    ownerMembershipId: uuid("owner_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Free-form note about cadence: "first Monday of month", "every quarter". */
    scheduleNotes: text("schedule_notes"),
    /** Convenience cache — set by completeProcedureRun. */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_procedures_client_idx").on(t.clientId),
    kindIdx: index("client_procedures_kind_idx").on(t.kind),
  }),
);

export const clientProcedureRuns = pgTable(
  "client_procedure_runs",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    procedureId: uuid("procedure_id")
      .notNull()
      .references(() => clientProcedures.id, { onDelete: "cascade" }),
    status: procedureRunStatusEnum("status").notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    startedByMembershipId: uuid("started_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Snapshot of step results — see `ProcedureStepResult`. */
    stepResults: jsonb("step_results")
      .$type<ProcedureStepResult[]>()
      .notNull()
      .default([]),
    outcomeNotes: text("outcome_notes"),
    durationMinutes: integer("duration_minutes"),
    ...timestamps,
  },
  (t) => ({
    procedureIdx: index("client_procedure_runs_procedure_idx").on(t.procedureId),
    clientIdx: index("client_procedure_runs_client_idx").on(t.clientId),
    startedIdx: index("client_procedure_runs_started_idx").on(t.startedAt),
  }),
);

export const clientProceduresRelations = relations(
  clientProcedures,
  ({ one, many }) => ({
    client: one(clients, {
      fields: [clientProcedures.clientId],
      references: [clients.id],
    }),
    owner: one(memberships, {
      fields: [clientProcedures.ownerMembershipId],
      references: [memberships.id],
    }),
    runs: many(clientProcedureRuns),
  }),
);

export const clientProcedureRunsRelations = relations(
  clientProcedureRuns,
  ({ one }) => ({
    procedure: one(clientProcedures, {
      fields: [clientProcedureRuns.procedureId],
      references: [clientProcedures.id],
    }),
    client: one(clients, {
      fields: [clientProcedureRuns.clientId],
      references: [clients.id],
    }),
    startedBy: one(memberships, {
      fields: [clientProcedureRuns.startedByMembershipId],
      references: [memberships.id],
    }),
  }),
);

export type ClientProcedure = typeof clientProcedures.$inferSelect;
export type NewClientProcedure = typeof clientProcedures.$inferInsert;
export type ClientProcedureRun = typeof clientProcedureRuns.$inferSelect;
export type NewClientProcedureRun = typeof clientProcedureRuns.$inferInsert;

/* ============================================================================
 * RECURRING TASKS — user-defined recurring items per client. Renewable
 * dates (license renewals, secret expiries, etc.) come from their own
 * tables; this table is for the things you'd otherwise track in a
 * spreadsheet ("Quarterly firewall firmware review at HQ — every 90 days").
 * The /upcoming view aggregates this together with the renewable-date
 * sources.
 * ========================================================================== */
export const recurringTaskKindEnum = pgEnum("recurring_task_kind", [
  "review",
  "audit",
  "renewal",
  "maintenance",
  "compliance",
  "other",
]);

export const clientRecurringTasks = pgTable(
  "client_recurring_tasks",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: recurringTaskKindEnum("kind").notNull().default("other"),
    /** How often the task recurs in days (e.g. 90 = quarterly). */
    cadenceDays: integer("cadence_days").notNull().default(90),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }).notNull(),
    lastDoneAt: timestamp("last_done_at", { withTimezone: true }),
    ownerMembershipId: uuid("owner_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Optional link back to a procedure to run when the task is due. */
    procedureId: uuid("procedure_id").references(() => clientProcedures.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_recurring_tasks_client_idx").on(t.clientId),
    dueIdx: index("client_recurring_tasks_due_idx").on(t.nextDueAt),
  }),
);

export const clientRecurringTasksRelations = relations(
  clientRecurringTasks,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientRecurringTasks.clientId],
      references: [clients.id],
    }),
    owner: one(memberships, {
      fields: [clientRecurringTasks.ownerMembershipId],
      references: [memberships.id],
    }),
    procedure: one(clientProcedures, {
      fields: [clientRecurringTasks.procedureId],
      references: [clientProcedures.id],
    }),
  }),
);

export type ClientRecurringTask = typeof clientRecurringTasks.$inferSelect;
export type NewClientRecurringTask = typeof clientRecurringTasks.$inferInsert;

/* ============================================================================
 * CHANGE & INCIDENT LOG — append-only event history per client. Distinct
 * from observations (open items / things to clean up). Events are a
 * historical record of what HAPPENED.
 * ========================================================================== */
export const eventKindEnum = pgEnum("client_event_kind", [
  "change",
  "incident",
  "maintenance",
  "discovery",
  "risk_resolution",
  "outage",
  "deployment",
  "other",
]);

export const eventSeverityEnum = pgEnum("client_event_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const clientEvents = pgTable(
  "client_events",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    kind: eventKindEnum("kind").notNull().default("change"),
    severity: eventSeverityEnum("severity").notNull().default("info"),
    title: text("title").notNull(),
    narrative: text("narrative"),
    rootCause: text("root_cause"),
    resolution: text("resolution"),
    durationMinutes: integer("duration_minutes"),
    /** Free-form list of affected systems. */
    affectedSystems: jsonb("affected_systems")
      .$type<string[]>()
      .notNull()
      .default([]),
    recordedByMembershipId: uuid("recorded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Optional link to the procedure run that produced this event. */
    procedureRunId: uuid("procedure_run_id").references(
      () => clientProcedureRuns.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_events_client_idx").on(t.clientId),
    occurredIdx: index("client_events_occurred_idx").on(t.occurredAt),
    kindIdx: index("client_events_kind_idx").on(t.kind),
  }),
);

export const clientEventsRelations = relations(clientEvents, ({ one }) => ({
  client: one(clients, {
    fields: [clientEvents.clientId],
    references: [clients.id],
  }),
  recordedBy: one(memberships, {
    fields: [clientEvents.recordedByMembershipId],
    references: [memberships.id],
  }),
  procedureRun: one(clientProcedureRuns, {
    fields: [clientEvents.procedureRunId],
    references: [clientProcedureRuns.id],
  }),
}));

export type ClientEvent = typeof clientEvents.$inferSelect;
export type NewClientEvent = typeof clientEvents.$inferInsert;
