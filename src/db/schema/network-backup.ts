/**
 * Network map and backup strategy structure per client.
 *
 *   client_network_circuits   — internet circuits per site/client (carrier,
 *                               speed, account # for break/fix calls).
 *   client_network_segments   — VLANs / subnets and their purposes.
 *   client_backup_strategy    — 1:1 with client. RTO/RPO targets, offsite
 *                               and immutability posture, restore testing.
 *   client_backup_systems     — many per client. Each row describes a
 *                               specific backup product covering a specific
 *                               scope (servers / endpoints / M365 / VMs / etc.)
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
import { clientLocations, clients } from "./clients";
import { hardware, hardwareBillingTierEnum, services, vendors } from "./catalog";

/* ============================================================================
 * NETWORK CIRCUITS (many per client; optionally tied to a location)
 * ========================================================================== */
export const networkCircuitRoleEnum = pgEnum("network_circuit_role", [
  "primary",
  "failover",
  "out_of_band",
  "dedicated_line",
  "other",
]);

export const clientNetworkCircuits = pgTable(
  "client_network_circuits",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    role: networkCircuitRoleEnum("role").notNull().default("primary"),
    carrier: text("carrier").notNull(),
    /** Plan / product label, e.g. "Business Internet 250M". */
    productLabel: text("product_label"),
    speedDownMbps: integer("speed_down_mbps"),
    speedUpMbps: integer("speed_up_mbps"),
    staticIpRange: text("static_ip_range"),
    accountNumber: text("account_number"),
    supportPhone: text("support_phone"),
    supportPortalUrl: text("support_portal_url"),
    termEndsAt: date("term_ends_at"),
    /** FINANCE-only — stripped server-side for non-finance roles. */
    monthlyCostCents: integer("monthly_cost_cents"),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Optional link to the matching service-account record (for billing). */
    serviceId: uuid("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    onePasswordItemUrl: text("one_password_item_url"),
    /** Credential audit fields — see voice_services for the rule.
     *  Each circuit is its own creds (carrier portal login) and gets
     *  its own audit clock. */
    lastAuditedAt: timestamp("last_audited_at", { withTimezone: true }),
    lastAuditedByMembershipId: uuid("last_audited_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    lastAuditNotes: text("last_audit_notes"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_network_circuits_client_idx").on(t.clientId),
    locIdx: index("client_network_circuits_location_idx").on(t.locationId),
    auditIdx: index("circuits_audit_idx").on(t.lastAuditedAt),
  }),
);

/* ============================================================================
 * NETWORK SEGMENTS / VLANs
 * ========================================================================== */
export const clientNetworkSegments = pgTable(
  "client_network_segments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Optional — null means client-wide / multi-site. */
    locationId: uuid("location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    vlanId: integer("vlan_id"),
    subnet: text("subnet"),
    gateway: text("gateway"),
    dhcpScope: text("dhcp_scope"),
    isolatedFromCorp: boolean("isolated_from_corp").notNull().default(false),
    purpose: text("purpose"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_network_segments_client_idx").on(t.clientId),
    locIdx: index("client_network_segments_location_idx").on(t.locationId),
  }),
);

/* ============================================================================
 * BACKUP STRATEGY (1:1 with client)
 * ========================================================================== */
export const restoreTestCadenceEnum = pgEnum("restore_test_cadence", [
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
  "ad_hoc",
  "never",
]);

export const clientBackupStrategy = pgTable(
  "client_backup_strategy",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Recovery Point Objective in minutes (how much data we can afford to lose). */
    rpoMinutes: integer("rpo_minutes"),
    /** Recovery Time Objective in minutes (how long we can afford to be down). */
    rtoMinutes: integer("rto_minutes"),
    offsiteCopy: boolean("offsite_copy").notNull().default(false),
    offsiteLocation: text("offsite_location"),
    immutableCopy: boolean("immutable_copy").notNull().default(false),
    encryptionAtRest: boolean("encryption_at_rest").notNull().default(false),
    drRunbookUrl: text("dr_runbook_url"),
    lastRestoreTestAt: date("last_restore_test_at"),
    restoreTestCadence: restoreTestCadenceEnum("restore_test_cadence"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientUnq: uniqueIndex("client_backup_strategy_client_unq").on(t.clientId),
  }),
);

/* ============================================================================
 * BACKUP SYSTEMS (many per client — each row covers a specific scope with a
 * specific product)
 * ========================================================================== */
export const backupDestinationKindEnum = pgEnum("backup_destination_kind", [
  "cloud",
  "onprem",
  "hybrid",
  "tape",
  "other",
]);

export const clientBackupSystems = pgTable(
  "client_backup_systems",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    serviceId: uuid("service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    /** What's covered. Free-form values — common: servers, endpoints, m365, vms, saas, network_devices. */
    scopeKinds: jsonb("scope_kinds").$type<string[]>().notNull().default([]),
    scopeNotes: text("scope_notes"),
    /** Free-form. e.g. "hourly", "every 4 hours", "nightly", "continuous". */
    frequency: text("frequency"),
    /** Free-form. e.g. "30 days local + 1 year cloud". */
    retention: text("retention"),
    destinationKind: backupDestinationKindEnum("destination_kind"),
    destinationLocation: text("destination_location"),
    monitoringNotes: text("monitoring_notes"),
    onePasswordItemUrl: text("one_password_item_url"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_backup_systems_client_idx").on(t.clientId),
    vendorIdx: index("client_backup_systems_vendor_idx").on(t.vendorId),
  }),
);

/* ============================================================================
 * HARDWARE TIER SNAPSHOTS — daily count of active hardware per billing tier,
 * per client. Drives the high-water-mark billing math: each month's invoice
 * uses the MAX count seen during the month, so a client that briefly held
 * extra nodes still gets billed for them even if they retired some by the
 * time the invoice runs.
 *
 * One row per (client_id, snapshot_date). Populated by the daily cron at
 * /api/cron/snapshot-tiers, and on-demand from the backfill script.
 * ========================================================================== */
export const clientTierSnapshots = pgTable(
  "client_tier_snapshots",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    fullCompute: integer("full_compute").notNull().default(0),
    kiosk: integer("kiosk").notNull().default(0),
    virtualMachine: integer("virtual_machine").notNull().default(0),
    managedMobile: integer("managed_mobile").notNull().default(0),
    notBillable: integer("not_billable").notNull().default(0),
    /** Mirror of clients.additionalUserCount at snapshot time. */
    additionalUsers: integer("additional_users").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    clientDateUnq: uniqueIndex("client_tier_snapshots_client_date_unq").on(
      t.clientId,
      t.snapshotDate,
    ),
    dateIdx: index("client_tier_snapshots_date_idx").on(t.snapshotDate),
  }),
);

/* ============================================================================
 * HARDWARE HEARTBEATS — per-device-per-day fact rows. One row means "this
 * device checked in (or counted as billable) on this date".
 *
 * Sourced from the Syncro RMM heartbeat: an asset whose `updated_at` is
 * within ~36h of today's cron run counts as having checked in today.
 * Manually-managed (non-Syncro) hardware that is `status='active'` gets a
 * heartbeat unconditionally — those don't have automated check-ins.
 *
 * Monthly billing counts DISTINCT hardware_id per billing tier from this
 * table for the billing month. So 50 devices that each checked in at
 * least once during the month all get billed, even if only 20 are online
 * at month-end.
 *
 * Unique on (hardware_id, heartbeat_date) so the daily cron is idempotent.
 * `billing_tier` is captured at heartbeat time (a snapshot) so a tier
 * change mid-month doesn't retroactively rewrite earlier days.
 * ========================================================================== */
export const hardwareHeartbeats = pgTable(
  "hardware_heartbeats",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    hardwareId: uuid("hardware_id")
      .notNull()
      .references(() => hardware.id, { onDelete: "cascade" }),
    heartbeatDate: date("heartbeat_date").notNull(),
    /** Snapshot of billing tier at heartbeat time. */
    billingTier: hardwareBillingTierEnum("billing_tier").notNull(),
    /** Why we recorded this row — 'syncro' (RMM updated_at within window)
     *  or 'manual' (non-Syncro active hardware, always counted). */
    source: text("source").notNull().default("syncro"),
    ...timestamps,
  },
  (t) => ({
    hardwareDateUnq: uniqueIndex("hardware_heartbeats_hardware_date_unq").on(
      t.hardwareId,
      t.heartbeatDate,
    ),
    clientDateIdx: index("hardware_heartbeats_client_date_idx").on(
      t.clientId,
      t.heartbeatDate,
    ),
    orgDateIdx: index("hardware_heartbeats_org_date_idx").on(
      t.organizationId,
      t.heartbeatDate,
    ),
  }),
);

export type HardwareHeartbeat = typeof hardwareHeartbeats.$inferSelect;
export type NewHardwareHeartbeat = typeof hardwareHeartbeats.$inferInsert;

/* ============================================================================
 * RELATIONS
 * ========================================================================== */
export const clientNetworkCircuitsRelations = relations(
  clientNetworkCircuits,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientNetworkCircuits.clientId],
      references: [clients.id],
    }),
    location: one(clientLocations, {
      fields: [clientNetworkCircuits.locationId],
      references: [clientLocations.id],
    }),
    vendor: one(vendors, {
      fields: [clientNetworkCircuits.vendorId],
      references: [vendors.id],
    }),
    service: one(services, {
      fields: [clientNetworkCircuits.serviceId],
      references: [services.id],
    }),
  }),
);

export const clientNetworkSegmentsRelations = relations(
  clientNetworkSegments,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientNetworkSegments.clientId],
      references: [clients.id],
    }),
    location: one(clientLocations, {
      fields: [clientNetworkSegments.locationId],
      references: [clientLocations.id],
    }),
  }),
);

export const clientBackupStrategyRelations = relations(
  clientBackupStrategy,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientBackupStrategy.clientId],
      references: [clients.id],
    }),
  }),
);

export const clientBackupSystemsRelations = relations(
  clientBackupSystems,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientBackupSystems.clientId],
      references: [clients.id],
    }),
    vendor: one(vendors, {
      fields: [clientBackupSystems.vendorId],
      references: [vendors.id],
    }),
    service: one(services, {
      fields: [clientBackupSystems.serviceId],
      references: [services.id],
    }),
  }),
);

/* ============================================================================
 * TYPES
 * ========================================================================== */
export type ClientNetworkCircuit = typeof clientNetworkCircuits.$inferSelect;
export type NewClientNetworkCircuit = typeof clientNetworkCircuits.$inferInsert;
export type ClientNetworkSegment = typeof clientNetworkSegments.$inferSelect;
export type NewClientNetworkSegment = typeof clientNetworkSegments.$inferInsert;
export type ClientBackupStrategy = typeof clientBackupStrategy.$inferSelect;
export type NewClientBackupStrategy =
  typeof clientBackupStrategy.$inferInsert;
export type ClientBackupSystem = typeof clientBackupSystems.$inferSelect;
export type NewClientBackupSystem = typeof clientBackupSystems.$inferInsert;
export type ClientTierSnapshot = typeof clientTierSnapshots.$inferSelect;
export type NewClientTierSnapshot = typeof clientTierSnapshots.$inferInsert;

export const clientTierSnapshotsRelations = relations(
  clientTierSnapshots,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientTierSnapshots.clientId],
      references: [clients.id],
    }),
  }),
);
