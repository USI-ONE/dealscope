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
import { ownershipGroups } from "./ownership-groups";

export const clientStatusEnum = pgEnum("client_status", [
  "prospect",
  "active",
  "on_hold",
  "former",
]);

export const clients = pgTable(
  "clients",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: clientStatusEnum("status").notNull().default("active"),
    primaryDomain: text("primary_domain"),
    industry: text("industry"),
    accountManagerMembershipId: uuid("account_manager_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Optional pointer to a parent / PE firm / holding company. When
     *  set, any standards owned by that ownership group auto-apply to
     *  this client. */
    ownershipGroupId: uuid("ownership_group_id").references(
      () => ownershipGroups.id,
      { onDelete: "set null" },
    ),
    syncroCustomerId: text("syncro_customer_id"),
    /** Exact QuickBooks customer name (including parent:job hierarchy)
     *  this client maps to. Drives IIF invoice exports — the IIF lines
     *  reference customers by name, so the name has to match QB exactly
     *  or QB will reject the import or create a duplicate customer.
     *
     *  Examples:
     *    - "Bestige - AHP"
     *    - "Industrial Injection Service"
     *    - "Universal Systems Inc."  → "USI"
     */
    qbCustomerName: text("qb_customer_name"),
    /** "Location" pulled from the Syncro customer record (custom field
     *  set per-customer in Syncro). Surfaced on the client overview
     *  card. Free text — could be an office name, region, building, etc. */
    location: text("location"),
    /** "AutoElevate running" status pulled from Syncro custom field.
     *  Free text — typically "Yes" / "No" / "Partial" / "Unknown" /
     *  install date. Lets us see at a glance whether the AutoElevate
     *  PAM agent is deployed at this client.
     *  NB: Syncro stores AE state per-asset in our tenant, not per-customer;
     *  this client field is reserved for an explicit override / annotation
     *  and is otherwise null. The per-device value lives on hardware. */
    autoelevateStatus: text("autoelevate_status"),
    /** Latest CSAT survey score pulled from Syncro customer custom field.
     *  Integer 1–5 typically; null when the customer hasn't received a
     *  recent survey response. */
    latestCsat: integer("latest_csat"),
    /** Free-text comment that accompanied the latest CSAT score. */
    latestCsatComment: text("latest_csat_comment"),
    monthlyRecurringCents: integer("monthly_recurring_cents"),
    /**
     * Contracted support — billed monthly as:
     *   support_baseline_cents
     *   + (rate_full_compute       × count of active full_compute_node hardware)
     *   + (rate_kiosk              × count of active kiosk_node hardware)
     *   + (rate_vm                 × count of active virtual_machine_node hardware)
     *   + (rate_managed_mobile     × count of active managed_mobile_device hardware)
     *   + (rate_additional_user    × additional_user_count)
     *
     * All FINANCE-only. The legacy single-rate fields below remain for
     * back-compat (still populated until next migration window) but are
     * no longer used by the billing math.
     */
    supportBaselineCents: integer("support_baseline_cents"),
    supportRatePerNodeCents: integer("support_rate_per_node_cents"),
    supportBillableHardwareKinds: jsonb("support_billable_hardware_kinds")
      .$type<string[]>()
      .notNull()
      .default(["server", "workstation", "laptop"]),
    supportRateFullComputeCents: integer("support_rate_full_compute_cents"),
    supportRateKioskCents: integer("support_rate_kiosk_cents"),
    supportRateVmCents: integer("support_rate_vm_cents"),
    supportRateManagedMobileCents: integer("support_rate_managed_mobile_cents"),
    supportRateAdditionalUserCents: integer("support_rate_additional_user_cents"),
    additionalUserCount: integer("additional_user_count").notNull().default(0),
    /**
     * Per-client rebill rates for third-party products billed via the
     * PS-style monthly invoice. NULL = fall back to the product
     * template default in src/lib/invoices/ps-product-templates.ts;
     * explicit value (incl. 0) overrides. The PS generator picks
     * these up via resolveProductRate() between the license-row
     * lookup and the template default.
     */
    rebillRateBitdefenderCents: integer("rebill_rate_bitdefender_cents"),
    rebillRateLiongardCents: integer("rebill_rate_liongard_cents"),
    rebillRateTitanhqCents: integer("rebill_rate_titanhq_cents"),
    rebillRateSyncroRemoteCents: integer("rebill_rate_syncro_remote_cents"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgSlugUnq: uniqueIndex("clients_org_slug_unq").on(t.organizationId, t.slug),
    orgIdx: index("clients_org_idx").on(t.organizationId),
  }),
);

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_contacts_client_idx").on(t.clientId),
  }),
);

export const clientLocations = pgTable(
  "client_locations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    addressLine1: text("address_line_1"),
    addressLine2: text("address_line_2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("US"),
    isPrimary: boolean("is_primary").notNull().default(false),
    // Network posture (per BH handover spec).
    subnet: text("subnet"),
    isp: text("isp"),
    ispCircuitId: text("isp_circuit_id"),
    securityPosture: text("security_posture"),
    networkNotes: text("network_notes"),
    isClientOwnedNetwork: boolean("is_client_owned_network").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("client_locations_client_idx").on(t.clientId),
  }),
);

export const clientsRelations = relations(clients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [clients.organizationId],
    references: [organizations.id],
  }),
  accountManager: one(memberships, {
    fields: [clients.accountManagerMembershipId],
    references: [memberships.id],
  }),
  contacts: many(clientContacts),
  locations: many(clientLocations),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, {
    fields: [clientContacts.clientId],
    references: [clients.id],
  }),
}));

export const clientLocationsRelations = relations(clientLocations, ({ one }) => ({
  client: one(clients, {
    fields: [clientLocations.clientId],
    references: [clients.id],
  }),
}));

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type ClientContact = typeof clientContacts.$inferSelect;
export type NewClientContact = typeof clientContacts.$inferInsert;
export type ClientLocation = typeof clientLocations.$inferSelect;
export type NewClientLocation = typeof clientLocations.$inferInsert;
