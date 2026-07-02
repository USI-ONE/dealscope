/**
 * User provisioning requests — onboarding, offboarding, and change-of-role
 * for end users. Drives a checklist-style workflow where each task is
 * tracked individually; on completion, a customer-facing handoff document
 * is generated so the requestor knows exactly what was done and how to
 * use it (especially: how the new user logs in).
 *
 * Tasks are stored as a JSONB array on the request row rather than a
 * separate table — the task set is well-defined per kind, mutates as a
 * single unit, and we don't query across tasks by-row.
 *
 * Status:
 *   draft → submitted → in_progress → ready_for_handoff → handed_off
 *   * → cancelled
 */
import { relations } from "drizzle-orm";
import {
  date,
  index,
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

export const userProvisioningKindEnum = pgEnum("user_provisioning_kind", [
  "onboarding",
  "offboarding",
  "change",
]);

export const userProvisioningStatusEnum = pgEnum(
  "user_provisioning_status",
  [
    "draft",
    "submitted",
    "in_progress",
    "ready_for_handoff",
    "handed_off",
    "cancelled",
  ],
);

/** A single task in the provisioning checklist. Stored inside the
 *  request.tasks JSONB column. */
export type ProvisioningTask = {
  /** Stable id so we can mutate without rewriting positions. */
  id: string;
  title: string;
  description?: string;
  /** Visual grouping — see the constants at the bottom of this file. */
  category:
    | "identity"
    | "mailbox"
    | "hardware"
    | "license"
    | "access"
    | "training"
    | "communication"
    | "data"
    | "other";
  /** Required tasks must be completed before status can advance to
   *  ready_for_handoff. Non-required tasks can be skipped. */
  required: boolean;
  applicable: boolean;
  completed: boolean;
  completedAt: string | null;
  completedByMembershipId: string | null;
  completionNotes: string | null;
  /** Captured result data — varies by task. Examples:
   *    Create M365 account → { username, mfaLink, tempPasswordHandoffMethod }
   *    Assign hardware → { assetTag, serialNumber, model }
   *    Assign license → { sku, count }
   *    Forward mailbox → { forwardedTo, until }
   *    Disable account → { disabledAt, dataRetentionUntil }
   *  These flow directly into the handoff document. */
  result: Record<string, string | number | boolean | null>;
};

export const userProvisioningRequests = pgTable(
  "user_provisioning_requests",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Human-readable id — UPR-2026-001. */
    refCode: text("ref_code").notNull(),

    kind: userProvisioningKindEnum("kind").notNull(),
    status: userProvisioningStatusEnum("status").notNull().default("draft"),

    /** Customer the user belongs to. Optional during draft. */
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),

    /* ---- Subject of the request --------------------------------------- */
    subjectFullName: text("subject_full_name").notNull(),
    /** Onboarding: the address being created. Offboarding: the address
     *  being disabled. */
    subjectEmail: text("subject_email"),
    subjectTitle: text("subject_title"),
    subjectDepartment: text("subject_department"),
    subjectManagerName: text("subject_manager_name"),
    subjectManagerEmail: text("subject_manager_email"),
    subjectPhone: text("subject_phone"),
    subjectLocation: text("subject_location"),

    /* ---- Onboarding-specific ------------------------------------------ */
    startDate: date("start_date"),
    /** Free-form "make this user look like X" — speeds up provisioning
     *  by signalling which groups / licenses / access to mirror. */
    copyFromUser: text("copy_from_user"),

    /* ---- Offboarding-specific ----------------------------------------- */
    lastDay: date("last_day"),
    /** "forward_to_manager" | "convert_to_shared" | "archive_then_delete"
     *  | "delete_after_retention". Free text for flexibility. */
    mailboxDisposition: text("mailbox_disposition"),
    mailboxForwardTo: text("mailbox_forward_to"),
    /** "return_to_usi" | "keep_with_user" | "wipe_and_reassign" | etc. */
    hardwareDisposition: text("hardware_disposition"),
    /** Where data (OneDrive / SharePoint / file shares) should go. */
    dataRetentionPlan: text("data_retention_plan"),

    /* ---- People ------------------------------------------------------- */
    requestedByMembershipId: uuid("requested_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    fulfilledByMembershipId: uuid("fulfilled_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Free-form name/email of who to send the completion notification
     *  to. Often the requester, sometimes a different stakeholder
     *  (the new user's manager, the client's IT lead). */
    notifyRecipientName: text("notify_recipient_name"),
    notifyRecipientEmail: text("notify_recipient_email"),

    /* ---- Tasks (checklist as jsonb) ----------------------------------- */
    tasks: jsonb("tasks")
      .$type<ProvisioningTask[]>()
      .notNull()
      .default([]),

    /* ---- Notes -------------------------------------------------------- */
    summary: text("summary"),
    notes: text("notes"),

    /* ---- Completion --------------------------------------------------- */
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    handedOffAt: timestamp("handed_off_at", { withTimezone: true }),

    ...timestamps,
  },
  (t) => ({
    orgIdx: index("user_provisioning_requests_org_idx").on(t.organizationId),
    statusIdx: index("user_provisioning_requests_status_idx").on(t.status),
    clientIdx: index("user_provisioning_requests_client_idx").on(t.clientId),
    refCodeUq: uniqueIndex("user_provisioning_requests_ref_code_uq").on(
      t.organizationId,
      t.refCode,
    ),
  }),
);

export const userProvisioningRequestsRelations = relations(
  userProvisioningRequests,
  ({ one }) => ({
    client: one(clients, {
      fields: [userProvisioningRequests.clientId],
      references: [clients.id],
    }),
  }),
);

export type UserProvisioningRequest =
  typeof userProvisioningRequests.$inferSelect;
export type NewUserProvisioningRequest =
  typeof userProvisioningRequests.$inferInsert;

/* ============================================================================
 * Display labels.
 * ========================================================================== */
export const USER_PROVISIONING_KIND_LABEL: Record<string, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  change: "Change / role update",
};

export const USER_PROVISIONING_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_progress: "In progress",
  ready_for_handoff: "Ready for handoff",
  handed_off: "Handed off (complete)",
  cancelled: "Cancelled",
};

export const PROVISIONING_TASK_CATEGORY_LABEL: Record<string, string> = {
  identity: "Identity & access",
  mailbox: "Mailbox",
  hardware: "Hardware",
  license: "Licenses",
  access: "Application access",
  training: "Training",
  communication: "Communication",
  data: "Data",
  other: "Other",
};
