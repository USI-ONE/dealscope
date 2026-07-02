/**
 * Multi-vendor integration schema.
 *
 * Captures everything we need to pull "seats consumed" data out of
 * third-party SaaS we resell (Syncro, Liongard, Bitdefender, Acronis,
 * TitanHQ, Microsoft CSP, …) and reconcile against what we bill
 * clients in `licenses` / `services` / `billables`.
 *
 * Three tables:
 *
 *   vendor_connections        — per-org, per-kind connection config
 *                              (API key, endpoint, status, last sync).
 *   vendor_client_mappings    — vendor's tenant/customer id → TechOS
 *                              client. Used so we can attribute their
 *                              seat counts to our clients.
 *   vendor_seat_snapshots     — append-only seat counts per
 *                              (connection, vendor_client, product).
 *                              History lets us trend usage and audit
 *                              "when did this client cross over to X
 *                              seats?".
 */
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
import { relations } from "drizzle-orm";
import { id, timestamps } from "./_shared";
import { organizations } from "./organizations";
import { clients } from "./clients";
import { vendors } from "./catalog";

/* ============================================================================
 * Enums
 * ========================================================================== */

/**
 * Every external SaaS we want to integrate with for visibility +
 * reconciliation. Add new entries here when a new connector ships.
 *
 * IMPORTANT: order matters for migrations (Postgres can ALTER ENUM ADD
 * VALUE but not reorder). Append-only.
 */
export const vendorConnectionKindEnum = pgEnum("vendor_connection_kind", [
  "syncro",
  "liongard",
  "bitdefender_gravityzone",
  "acronis_cyber_cloud",
  "titanhq",
  "microsoft_csp",
  "huntress",
  "threatlocker",
  "datto_rmm",
  "ingram_micro",
  "unifi_network",
]);

export const vendorConnectionStatusEnum = pgEnum(
  "vendor_connection_status",
  [
    "not_configured", // row exists but no credentials yet
    "configured", // credentials saved, not yet tested
    "connected", // last test/sync succeeded
    "failed", // last test/sync failed (see last_sync_error)
    "disabled", // operator turned it off
  ],
);

/* ============================================================================
 * vendor_connections
 *
 * One row per (organization, kind). Holds the credentials + base URL
 * for the connector and the last-sync metadata.
 *
 * `config_json` shape is connector-specific — every connector module
 * defines and validates its own schema. Documented per-kind in
 * src/lib/integrations/<kind>/.
 *
 * We unique (org, kind) for now — most MSPs have a single tenant per
 * SaaS. If a future scenario needs multiple connections per kind
 * (e.g. two separate Bitdefender partner accounts) we'll drop the
 * unique index and let `display_name` disambiguate.
 * ========================================================================== */
export const vendorConnections = pgTable(
  "vendor_connections",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Which connector implementation owns this row. */
    kind: vendorConnectionKindEnum("kind").notNull(),
    /** Human label — shown in the integrations list and lets the
     *  user disambiguate if we ever drop the (org, kind) uniqueness
     *  constraint. */
    displayName: text("display_name").notNull(),
    /** Optional FK to the catalog vendor that represents this SaaS in
     *  our vendor list. Used to surface seat counts on the vendor page. */
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Per-connector credentials + endpoint blob. Connectors validate
     *  the shape via Zod before writing/reading. */
    configJson: jsonb("config_json").notNull().default({}),
    status: vendorConnectionStatusEnum("status").notNull().default("not_configured"),
    /** When the last sync started (so re-runs are idempotent). */
    lastSyncStartedAt: timestamp("last_sync_started_at", { withTimezone: true }),
    /** When the last sync finished successfully. NULL = never. */
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    /** Free-text last status / error so the UI can display it. */
    lastSyncMessage: text("last_sync_message"),
    /** If true, the cron will include this connection in scheduled
     *  syncs. Defaults to true once credentials are saved. */
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    orgKindUnq: uniqueIndex("vendor_conn_org_kind_unq").on(t.organizationId, t.kind),
    orgIdx: index("vendor_conn_org_idx").on(t.organizationId),
  }),
);

/* ============================================================================
 * vendor_client_mappings
 *
 * Bridges the vendor's tenant identifier (e.g. Liongard Environment
 * ID, Bitdefender company ID) to a TechOS client. One row per
 * (connection, vendor_client_identifier).
 *
 * Without this row, seat snapshots from that vendor for that customer
 * land in the snapshot table with client_id = NULL — surfaced as
 * "unmapped" rows for the operator to resolve.
 * ========================================================================== */
export const vendorClientMappings = pgTable(
  "vendor_client_mappings",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorConnectionId: uuid("vendor_connection_id")
      .notNull()
      .references(() => vendorConnections.id, { onDelete: "cascade" }),
    /** Vendor-side identifier (string — some APIs use ints, some
     *  GUIDs, some slugs). We store as text for portability. */
    vendorClientIdentifier: text("vendor_client_identifier").notNull(),
    /** Vendor-side display name, captured at link time. Re-synced on
     *  every refresh so the UI can show drift between TechOS client
     *  name and vendor name. */
    vendorClientName: text("vendor_client_name").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Cached vendor URL so the UI can deep-link to the vendor's
     *  tenant page. */
    vendorClientUrl: text("vendor_client_url"),
    ...timestamps,
  },
  (t) => ({
    connIdentifierUnq: uniqueIndex("vendor_client_map_conn_ident_unq").on(
      t.vendorConnectionId,
      t.vendorClientIdentifier,
    ),
    clientIdx: index("vendor_client_map_client_idx").on(t.clientId),
    orgIdx: index("vendor_client_map_org_idx").on(t.organizationId),
  }),
);

/* ============================================================================
 * vendor_seat_snapshots
 *
 * One row per (sync run, vendor_client, product). Append-only so we
 * can trend usage over time and audit billing disputes.
 *
 * The reconciliation report reads only the latest snapshot per
 * (connection, vendor_client_identifier, product_sku).
 * ========================================================================== */
export const vendorSeatSnapshots = pgTable(
  "vendor_seat_snapshots",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorConnectionId: uuid("vendor_connection_id")
      .notNull()
      .references(() => vendorConnections.id, { onDelete: "cascade" }),
    /** Vendor-side identifier so we can join to vendor_client_mappings
     *  to resolve TechOS client. Repeated here (denormalized) so we
     *  can keep snapshots when a mapping is later deleted. */
    vendorClientIdentifier: text("vendor_client_identifier").notNull(),
    vendorClientName: text("vendor_client_name").notNull(),
    /** Resolved at write time. NULL when no mapping existed yet —
     *  surfaced as "unmapped" rows in reconciliation. */
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    /** Vendor SKU / product identifier. */
    productSku: text("product_sku").notNull(),
    /** Friendly product name. */
    productName: text("product_name").notNull(),
    /** Number of seats / endpoints / mailboxes the vendor reports. */
    seats: integer("seats").notNull(),
    /** Per-seat cost in cents, when the vendor exposes pricing via
     *  the API. NULL if we have to look it up elsewhere. */
    costPerSeatCents: integer("cost_per_seat_cents"),
    /** Period these seats apply to (when the vendor reports usage by
     *  invoice period). NULL if the snapshot is "current state". */
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Raw API row, kept for debugging. Limit size in connectors so
     *  this stays sane. */
    rawResponse: jsonb("raw_response"),
  },
  (t) => ({
    connIdx: index("seat_snap_conn_idx").on(t.vendorConnectionId, t.capturedAt),
    clientIdx: index("seat_snap_client_idx").on(t.clientId),
    productIdx: index("seat_snap_product_idx").on(
      t.vendorConnectionId,
      t.vendorClientIdentifier,
      t.productSku,
      t.capturedAt,
    ),
    orgIdx: index("seat_snap_org_idx").on(t.organizationId),
  }),
);

/* ============================================================================
 * Relations
 * ========================================================================== */

export const vendorConnectionsRelations = relations(
  vendorConnections,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [vendorConnections.organizationId],
      references: [organizations.id],
    }),
    vendor: one(vendors, {
      fields: [vendorConnections.vendorId],
      references: [vendors.id],
    }),
    clientMappings: many(vendorClientMappings),
    seatSnapshots: many(vendorSeatSnapshots),
  }),
);

export const vendorClientMappingsRelations = relations(
  vendorClientMappings,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [vendorClientMappings.organizationId],
      references: [organizations.id],
    }),
    connection: one(vendorConnections, {
      fields: [vendorClientMappings.vendorConnectionId],
      references: [vendorConnections.id],
    }),
    client: one(clients, {
      fields: [vendorClientMappings.clientId],
      references: [clients.id],
    }),
  }),
);

export const vendorSeatSnapshotsRelations = relations(
  vendorSeatSnapshots,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [vendorSeatSnapshots.organizationId],
      references: [organizations.id],
    }),
    connection: one(vendorConnections, {
      fields: [vendorSeatSnapshots.vendorConnectionId],
      references: [vendorConnections.id],
    }),
    client: one(clients, {
      fields: [vendorSeatSnapshots.clientId],
      references: [clients.id],
    }),
  }),
);

/* ============================================================================
 * Types
 * ========================================================================== */

export type VendorConnectionKind =
  (typeof vendorConnectionKindEnum.enumValues)[number];
export type VendorConnectionStatus =
  (typeof vendorConnectionStatusEnum.enumValues)[number];

export type VendorConnection = typeof vendorConnections.$inferSelect;
export type NewVendorConnection = typeof vendorConnections.$inferInsert;

export type VendorClientMapping = typeof vendorClientMappings.$inferSelect;
export type NewVendorClientMapping = typeof vendorClientMappings.$inferInsert;

export type VendorSeatSnapshot = typeof vendorSeatSnapshots.$inferSelect;
export type NewVendorSeatSnapshot = typeof vendorSeatSnapshots.$inferInsert;

/* ============================================================================
 * Display labels
 * ========================================================================== */

export const VENDOR_CONNECTION_KIND_LABEL: Record<VendorConnectionKind, string> =
  {
    syncro: "Syncro MSP",
    liongard: "Liongard",
    bitdefender_gravityzone: "Bitdefender GravityZone",
    acronis_cyber_cloud: "Acronis Cyber Cloud",
    titanhq: "TitanHQ",
    microsoft_csp: "Microsoft CSP / Partner Center",
    huntress: "Huntress",
    threatlocker: "ThreatLocker",
    datto_rmm: "Datto RMM",
    ingram_micro: "Ingram Micro Cloud Marketplace",
    unifi_network: "UniFi Network (Site Manager API)",
  };

export const VENDOR_CONNECTION_STATUS_LABEL: Record<
  VendorConnectionStatus,
  string
> = {
  not_configured: "Not configured",
  configured: "Configured",
  connected: "Connected",
  failed: "Failed",
  disabled: "Disabled",
};
