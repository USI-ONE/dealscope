/**
 * Per-client runbook structure (Tier B from the BH handover spec).
 *
 *   client_identities         — 1:1 with clients. Identity-platform posture
 *                               (IdP, MFA, sync, primary domain, tenant id).
 *   client_app_registrations  — many per client. Entra/OAuth app registrations
 *                               with credential expiry tracking.
 *   client_observations       — many per client. Open items, cleanup actions,
 *                               things to validate. Status workflow.
 *   client_documents          — many per client. URL refs to handover docs,
 *                               network diagrams, license certs.
 *   client_mailboxes          — many per client. M365 / Google Workspace /
 *                               equivalent mailbox inventory.
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
import { clients, clientLocations } from "./clients";

/* ============================================================================
 * IDENTITY (1:1 with client)
 * ========================================================================== */
export const identityProviderEnum = pgEnum("identity_provider", [
  "entra_id",
  "google_workspace",
  "okta",
  "active_directory",
  "jumpcloud",
  "auth0",
  "other",
]);

export const directorySyncEnum = pgEnum("directory_sync", [
  "none",
  "entra_connect",
  "ad_fs",
  "azure_ad_connect_cloud_sync",
  "scim",
  "other",
]);

export const mfaPostureEnum = pgEnum("mfa_posture", [
  "all_required",
  "admin_only",
  "conditional",
  "not_enforced",
  "unknown",
]);

export const clientIdentities = pgTable(
  "client_identities",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    identityProvider: identityProviderEnum("identity_provider").notNull().default("entra_id"),
    primaryDomain: text("primary_domain"),
    /** e.g. NETORGFT1292899.onmicrosoft.com — surfaces tenant inheritance. */
    tenantDefaultDomain: text("tenant_default_domain"),
    tenantId: text("tenant_id"),
    domainRegistrar: text("domain_registrar"),
    directorySync: directorySyncEnum("directory_sync").notNull().default("none"),
    mfaPosture: mfaPostureEnum("mfa_posture").notNull().default("unknown"),
    conditionalAccessNotes: text("conditional_access_notes"),
    /** SSO consumers — list of app names that authenticate via this IdP. */
    ssoConsumers: jsonb("sso_consumers").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientUnq: uniqueIndex("client_identities_client_unq").on(t.clientId),
    orgIdx: index("client_identities_org_idx").on(t.organizationId),
  }),
);

/* ============================================================================
 * ENTRA/OAUTH APP REGISTRATIONS
 * ========================================================================== */
export const appRegistrationStatusEnum = pgEnum("app_registration_status", [
  "active",
  "stale",
  "to_review",
  "to_remove",
  "removed",
]);

export const appRegistrationCredStatusEnum = pgEnum("app_registration_cred_status", [
  "current",
  "expiring_soon",
  "expired",
  "no_secret",
  "unknown",
]);

export const clientAppRegistrations = pgTable(
  "client_app_registrations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Entra "Application (client) ID" or equivalent provider ID. */
    applicationId: text("application_id"),
    displayName: text("display_name").notNull(),
    appCreatedAt: date("app_created_at"),
    secretStatus: appRegistrationCredStatusEnum("secret_status").notNull().default("unknown"),
    secretExpiresAt: date("secret_expires_at"),
    certStatus: appRegistrationCredStatusEnum("cert_status").notNull().default("unknown"),
    certExpiresAt: date("cert_expires_at"),
    status: appRegistrationStatusEnum("status").notNull().default("active"),
    purpose: text("purpose"),
    flagForReview: boolean("flag_for_review").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_app_reg_client_idx").on(t.clientId),
    orgIdx: index("client_app_reg_org_idx").on(t.organizationId),
  }),
);

/* ============================================================================
 * OBSERVATIONS — open items, cleanup, things to validate
 * ========================================================================== */
export const observationKindEnum = pgEnum("observation_kind", [
  "cleanup",
  "validate",
  "risk",
  "follow_up",
  "decision_pending",
  "other",
]);

export const observationSeverityEnum = pgEnum("observation_severity", [
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);

export const observationStatusEnum = pgEnum("observation_status", [
  "open",
  "in_progress",
  "blocked",
  "resolved",
  "wont_fix",
]);

export const clientObservations = pgTable(
  "client_observations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    kind: observationKindEnum("kind").notNull().default("validate"),
    severity: observationSeverityEnum("severity").notNull().default("medium"),
    status: observationStatusEnum("status").notNull().default("open"),
    assignedToMembershipId: uuid("assigned_to_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    dueDate: date("due_date"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByMembershipId: uuid("resolved_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    resolutionNotes: text("resolution_notes"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_observations_client_idx").on(t.clientId),
    orgIdx: index("client_observations_org_idx").on(t.organizationId),
    statusIdx: index("client_observations_status_idx").on(t.clientId, t.status),
  }),
);

/* ============================================================================
 * DOCUMENTS — URL refs to handover docs, diagrams, etc.
 * ========================================================================== */
export const documentKindEnum = pgEnum("document_kind", [
  "handover",
  "network_diagram",
  "license_cert",
  "contract",
  "runbook",
  "soc2_report",
  "policy",
  "vendor_doc",
  "other",
]);

export const clientDocuments = pgTable(
  "client_documents",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: documentKindEnum("kind").notNull().default("other"),
    url: text("url").notNull(),
    description: text("description"),
    addedByMembershipId: uuid("added_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_documents_client_idx").on(t.clientId),
    orgIdx: index("client_documents_org_idx").on(t.organizationId),
  }),
);

/* ============================================================================
 * MAILBOX INVENTORY (M365 / Google Workspace / equivalent)
 * ========================================================================== */
export const mailboxKindEnum = pgEnum("mailbox_kind", [
  "user",
  "shared",
  "service",
  "distribution_list",
  "security_group",
  "mail_enabled_security",
  "external_contact",
  "other",
]);

export const clientMailboxes = pgTable(
  "client_mailboxes",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    primaryEmail: text("primary_email").notNull(),
    displayName: text("display_name"),
    kind: mailboxKindEnum("kind").notNull().default("user"),
    /** SMTP aliases pointing to this mailbox. */
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    litigationHold: boolean("litigation_hold").notNull().default(false),
    /** Free-form license summary, e.g. "M365 E5 + Teams Phone". */
    licenseSummary: text("license_summary"),
    /** When this mailbox is delegated to another user (e.g. shared inbox managed by [email]). */
    delegatedToEmail: text("delegated_to_email"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_mailboxes_client_idx").on(t.clientId),
    orgIdx: index("client_mailboxes_org_idx").on(t.organizationId),
    emailUnq: uniqueIndex("client_mailboxes_client_email_unq").on(
      t.clientId,
      t.primaryEmail,
    ),
  }),
);

/* ============================================================================
 * RELATIONS
 * ========================================================================== */
export const clientIdentitiesRelations = relations(clientIdentities, ({ one }) => ({
  client: one(clients, {
    fields: [clientIdentities.clientId],
    references: [clients.id],
  }),
}));

export const clientAppRegistrationsRelations = relations(
  clientAppRegistrations,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientAppRegistrations.clientId],
      references: [clients.id],
    }),
  }),
);

export const clientObservationsRelations = relations(clientObservations, ({ one }) => ({
  client: one(clients, {
    fields: [clientObservations.clientId],
    references: [clients.id],
  }),
  assignedTo: one(memberships, {
    fields: [clientObservations.assignedToMembershipId],
    references: [memberships.id],
  }),
  resolvedBy: one(memberships, {
    fields: [clientObservations.resolvedByMembershipId],
    references: [memberships.id],
  }),
}));

export const clientDocumentsRelations = relations(clientDocuments, ({ one }) => ({
  client: one(clients, {
    fields: [clientDocuments.clientId],
    references: [clients.id],
  }),
  addedBy: one(memberships, {
    fields: [clientDocuments.addedByMembershipId],
    references: [memberships.id],
  }),
}));

export const clientMailboxesRelations = relations(clientMailboxes, ({ one }) => ({
  client: one(clients, {
    fields: [clientMailboxes.clientId],
    references: [clients.id],
  }),
}));

/* ============================================================================
 * TYPES
 * ========================================================================== */
export type ClientIdentity = typeof clientIdentities.$inferSelect;
export type NewClientIdentity = typeof clientIdentities.$inferInsert;
export type ClientAppRegistration = typeof clientAppRegistrations.$inferSelect;
export type NewClientAppRegistration = typeof clientAppRegistrations.$inferInsert;
export type ClientObservation = typeof clientObservations.$inferSelect;
export type NewClientObservation = typeof clientObservations.$inferInsert;
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type NewClientDocument = typeof clientDocuments.$inferInsert;
export type ClientMailbox = typeof clientMailboxes.$inferSelect;
export type NewClientMailbox = typeof clientMailboxes.$inferInsert;

/* ============================================================================
 * CLIENT PAGES — per-client runbook wiki.
 *
 * Tree-structured markdown documents attached to a client. Drives the
 * "Runbook" tab on each client page. Imported from the legacy Joplin
 * export (see scripts/import-runbook-pages.ts) and editable in the UI
 * going forward.
 *
 * Hierarchy: a page can be a child of another page in the same client
 * (parent_page_id). Common pattern is one overview page per client +
 * one page per location + zero-to-many guides under either.
 * ========================================================================== */
export const clientPageKindEnum = pgEnum("client_page_kind", [
  "overview", // root client page (one per client typically)
  "location", // location-scoped runbook (often under overview)
  "guide", // step-by-step / how-to specific to this client
  "note", // free-form notes / catch-all
]);

export const clientPages = pgTable(
  "client_pages",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Optional parent so pages can be nested (overview → guide,
     *  overview → location, location → location-guide). */
    parentPageId: uuid("parent_page_id"),
    /** When the page is location-scoped, link to the location row.
     *  Otherwise null. We don't enforce this from kind to keep the
     *  importer permissive. */
    locationId: uuid("location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    /** URL-safe slug used in the page URL + as a stable identifier
     *  across edits. Unique per client. */
    slug: text("slug").notNull(),
    kind: clientPageKindEnum("kind").notNull().default("note"),
    /** Markdown body — the actual content the tech reads. */
    bodyMd: text("body_md").notNull().default(""),
    /** Where the page came from: 'import:joplin' for the initial
     *  bulk import, 'manual' for anything created via the UI later.
     *  Lets us spot legacy content + know which pages can be safely
     *  re-imported. */
    source: text("source").notNull().default("manual"),
    /** Original file path inside the legacy export (when source =
     *  'import:joplin'). Used by the importer for idempotency. */
    sourcePath: text("source_path"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByMembershipId: uuid("created_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_pages_client_idx").on(t.clientId),
    parentIdx: index("client_pages_parent_idx").on(t.parentPageId),
    locationIdx: index("client_pages_location_idx").on(t.locationId),
    clientSlugUnq: uniqueIndex("client_pages_client_slug_unq").on(
      t.clientId,
      t.slug,
    ),
    /** Importer idempotency: re-running the import never duplicates
     *  pages for the same source file. */
    sourcePathUnq: uniqueIndex("client_pages_source_path_unq").on(
      t.clientId,
      t.sourcePath,
    ),
  }),
);

export const clientPagesRelations = relations(clientPages, ({ one, many }) => ({
  client: one(clients, {
    fields: [clientPages.clientId],
    references: [clients.id],
  }),
  parent: one(clientPages, {
    fields: [clientPages.parentPageId],
    references: [clientPages.id],
    relationName: "parent_child",
  }),
  children: many(clientPages, { relationName: "parent_child" }),
  location: one(clientLocations, {
    fields: [clientPages.locationId],
    references: [clientLocations.id],
  }),
  createdBy: one(memberships, {
    fields: [clientPages.createdByMembershipId],
    references: [memberships.id],
  }),
}));

export type ClientPage = typeof clientPages.$inferSelect;
export type NewClientPage = typeof clientPages.$inferInsert;
