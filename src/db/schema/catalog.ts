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

export const vendorStatusEnum = pgEnum("vendor_status", ["active", "inactive", "evaluating"]);

export const contractKindEnum = pgEnum("contract_kind", [
  "msa",
  "sow",
  "subscription",
  "license",
  "support",
  "nda",
  "other",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "active",
  "expired",
  "terminated",
  "draft",
]);

export const hardwareKindEnum = pgEnum("hardware_kind", [
  "server",
  "workstation",
  "laptop",
  "firewall",
  "switch",
  "ap",
  "printer",
  "phone",
  "mobile",
  "tablet",
  "appliance",
  "other",
]);

export const hardwareStatusEnum = pgEnum("hardware_status", [
  "active",
  "spare",
  "retired",
  "lost",
]);

/**
 * Billing tier — separate from `kind`. Determines which per-client support
 * rate applies. `not_billable` means this device doesn't contribute to the
 * per-node support charge (network gear, printers, etc.).
 */
export const hardwareBillingTierEnum = pgEnum("hardware_billing_tier", [
  "full_compute_node",
  "kiosk_node",
  "virtual_machine_node",
  "managed_mobile_device",
  "not_billable",
]);

export const serviceKindEnum = pgEnum("service_kind", [
  "managed",
  "break_fix",
  "project",
  "recurring",
  "advisory",
  "other",
]);

export const serviceStatusEnum = pgEnum("service_status", [
  "active",
  "paused",
  "ended",
  "draft",
]);

/**
 * Operational category for a service account. Drives grouping on the
 * client services card and the cross-client services directory. Distinct
 * from `serviceKind` (which describes the business arrangement).
 */
export const serviceCategoryEnum = pgEnum("service_category", [
  "internet",
  "phone_voice",
  "voip",
  "cellular",
  "backup",
  "cameras",
  "alarm",
  "physical_security",
  "mdm",
  "dns",
  "domain_registrar",
  "web_hosting",
  "email_hosting",
  "fax",
  "printing",
  "electric_utility",
  "gas_utility",
  "water_utility",
  "saas",
  "other",
]);

/**
 * Who pays the upstream vendor:
 *  - `usi`: Universal Systems pays the bill and rebills the client. These
 *    services flow into invoice detail / monthly statement.
 *  - `client_direct`: client pays the vendor directly. We don't bill it,
 *    but it stays in the directory so desktop support can look up the
 *    account number / support phone / portal URL.
 */
export const servicePaidByEnum = pgEnum("service_paid_by", [
  "usi",
  "client_direct",
]);

export const licenseBillingPeriodEnum = pgEnum("license_billing_period", [
  "monthly",
  "annual",
  "per_seat_monthly",
  "per_seat_annual",
  "perpetual",
  "consumption",
]);

/**
 * Functional category for a license. Drives the per-client "what tools
 * is this client running" inventory and the QB-expense reconciliation
 * later (vendor + category → expected cost).
 *
 * Add new categories by extending this enum + a fresh migration; the
 * UI surfaces them automatically.
 */
export const licenseCategoryEnum = pgEnum("license_category", [
  "edr_mdr_xdr",
  "email_security",
  "productivity_suite",
  "identity_sso",
  "pam_vaulting",
  "mdm_endpoint_mgmt",
  "remote_access",
  "backup_dr",
  "project_management",
  "communication",
  "file_storage",
  "compliance_grc",
  "ai_productivity",
  "document_signing",
  "industry_specific",
  "network_infrastructure",
  "psa_rmm",
  "other_saas",
]);

export const licenseStatusEnum = pgEnum("license_status", [
  "active",
  "expired",
  "lapsed",
  "draft",
]);

export const vendorBillStatusEnum = pgEnum("vendor_bill_status", [
  "received",
  "approved",
  "paid",
  "disputed",
  "void",
]);

export const billableStatusEnum = pgEnum("billable_status", [
  "draft",
  "approved",
  "billed",
  "paid",
  "voided",
]);

/* ============================================================================
 * VENDORS
 * ========================================================================== */
export const vendors = pgTable(
  "vendors",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: vendorStatusEnum("status").notNull().default("active"),
    website: text("website"),
    primaryContactName: text("primary_contact_name"),
    primaryContactEmail: text("primary_contact_email"),
    primaryContactPhone: text("primary_contact_phone"),
    accountNumber: text("account_number"),
    onePasswordItemUrl: text("one_password_item_url"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    /** Vendor name as it appears in QuickBooks. Lets us round-trip
     *  TechOS vendors to QB on the IIF export side AND match QB
     *  expense entries back to a TechOS vendor on reconciliation.
     *  Distinct from `name` because QB sometimes uses a longer
     *  display form (e.g. "Microsoft Corporation" in QB vs.
     *  "Microsoft" in TechOS). */
    qbVendorName: text("qb_vendor_name"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgSlugUnq: uniqueIndex("vendors_org_slug_unq").on(t.organizationId, t.slug),
    orgIdx: index("vendors_org_idx").on(t.organizationId),
  }),
);

export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: contractKindEnum("kind").notNull().default("subscription"),
    status: contractStatusEnum("status").notNull().default("active"),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    noticePeriodDays: integer("notice_period_days"),
    annualValueCents: integer("annual_value_cents"), // FINANCE-only
    onePasswordItemUrl: text("one_password_item_url"),
    documentUrl: text("document_url"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("contracts_org_idx").on(t.organizationId),
    vendorIdx: index("contracts_vendor_idx").on(t.vendorId),
    clientIdx: index("contracts_client_idx").on(t.clientId),
  }),
);

export const hardware = pgTable(
  "hardware",
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
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    kind: hardwareKindEnum("kind").notNull().default("other"),
    label: text("label").notNull(),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    assetTag: text("asset_tag"),
    status: hardwareStatusEnum("status").notNull().default("active"),
    /** Drives the per-node support charge category in monthly billing. */
    billingTier: hardwareBillingTierEnum("billing_tier").notNull().default("not_billable"),
    purchasedAt: date("purchased_at"),
    warrantyEndsAt: date("warranty_ends_at"),
    /** Syncro RMM asset ID for sync matching. */
    syncroAssetId: text("syncro_asset_id"),
    osName: text("os_name"),
    osVersion: text("os_version"),
    cpuLabel: text("cpu_label"),
    ramGb: integer("ram_gb"),
    diskGb: integer("disk_gb"),
    lastIp: text("last_ip"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    isEol: boolean("is_eol").notNull().default(false),
    eolDate: date("eol_date"),
    rmmAgent: text("rmm_agent"),
    edrAgent: text("edr_agent"),
    backupAgent: text("backup_agent"),
    assignedToLabel: text("assigned_to_label"),
    assignedToEmail: text("assigned_to_email"),
    onePasswordItemUrl: text("one_password_item_url"),
    notes: text("notes"),
    /* ---- Syncro per-asset intel (pulled by syncAssetsForClient) -------
     * Source of truth is the Syncro asset's custom-field shape. We store
     * raw string values to preserve Syncro's semantics ("Yes" / "No" /
     * "Not Found" / "Unknown" / "0" / "1" / date strings). The display
     * layer normalises and colour-codes them.
     */
    /** Syncro "Not on Contract" flag (0/1). Devices marked here are
     *  excluded from per-node billing. */
    notOnContract: text("not_on_contract"),
    /** Syncro "Kiosk" flag (0/1). When 1, the device is a single-purpose
     *  station — drives the kiosk_node billing tier. */
    isKiosk: text("is_kiosk"),
    /** Syncro "AutoElevate Running" — Yes / No / Not Found. */
    autoelevateStatus: text("autoelevate_status"),
    /** Syncro "Intune Enrolled" — Yes / No. */
    intuneEnrolled: text("intune_enrolled"),
    /** Syncro "EntraID Joined" — Yes / No. */
    entraJoined: text("entra_joined"),
    /** Syncro "Threatlocker Running" — Yes / No. */
    threatlockerRunning: text("threatlocker_running"),
    /** Syncro "Windows 11 Readiness" — "Ready" or "Failed: TPM Check, ...". */
    windows11Readiness: text("windows11_readiness"),
    /** Customer-set tag (whatever the client labels their own assets with). */
    customerAssetTag: text("customer_asset_tag"),
    /** USI-internal asset tag. */
    usiAssetTag: text("usi_asset_tag"),
    /** Syncro / Splashtop remote-access UUID. */
    splashtopUuid: text("splashtop_uuid"),
    /** Syncro "Local_Administrators" — space-separated user list dumped
     *  by the agent. Stored verbatim; UI can split on whitespace. */
    localAdministrators: text("local_administrators"),
    /** IMEI for mobile / cellular devices. */
    imei: text("imei"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("hardware_org_idx").on(t.organizationId),
    clientIdx: index("hardware_client_idx").on(t.clientId),
    locationIdx: index("hardware_location_idx").on(t.locationId),
    serialIdx: index("hardware_serial_idx").on(t.serialNumber),
  }),
);

export const services = pgTable(
  "services",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: serviceKindEnum("kind").notNull().default("recurring"),
    /** Operational category — drives grouping in the services card. */
    category: serviceCategoryEnum("category").notNull().default("other"),
    status: serviceStatusEnum("status").notNull().default("active"),
    /** Who pays the upstream vendor — drives whether this rebills. */
    paidBy: servicePaidByEnum("paid_by").notNull().default("usi"),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    monthlyRebillRateCents: integer("monthly_rebill_rate_cents"),
    costBasisCents: integer("cost_basis_cents"), // FINANCE-only
    markupPct: integer("markup_pct"), // FINANCE-only
    /* ----- Operational reference data (no secrets here) ------------- */
    accountNumber: text("account_number"),
    supportPhone: text("support_phone"),
    supportEmail: text("support_email"),
    supportPortalUrl: text("support_portal_url"),
    vendorContactName: text("vendor_contact_name"),
    vendorContactPhone: text("vendor_contact_phone"),
    vendorContactEmail: text("vendor_contact_email"),
    /** Username only — credentials live in 1Password, link via onePasswordItemUrl. */
    loginUsername: text("login_username"),
    onePasswordItemUrl: text("one_password_item_url"),
    notes: text("notes"),
    /** Renewal date — when this subscription rebills / can be cancelled.
     *  Used by the 30-day renewal-reminder query and the audit dashboard. */
    renewalDate: date("renewal_date"),
    /** True when the vendor account auto-renews unless we cancel. */
    autoRenew: boolean("auto_renew").notNull().default(true),
    /* ----- Audit lifecycle (Rachel Wong's licensing rock) -------------- */
    /** When the row was last reviewed end-to-end and confirmed accurate. */
    auditedAt: timestamp("audited_at", { withTimezone: true }),
    auditedByMembershipId: uuid("audited_by_membership_id"),
    /** When the inventory data was cleaned + validated (separate signal
     *  from "audited" — auditing checks completeness; validation checks
     *  field-level correctness like SKU spelling / vendor link). */
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    validatedByMembershipId: uuid("validated_by_membership_id"),
    /** When this row's rebill was reconciled against current client billing. */
    billingReconciledAt: timestamp("billing_reconciled_at", { withTimezone: true }),
    billingReconciledByMembershipId: uuid("billing_reconciled_by_membership_id"),
    /** Owner accountable for keeping this entry up to date. */
    ownerMembershipId: uuid("owner_membership_id"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("services_org_idx").on(t.organizationId),
    clientIdx: index("services_client_idx").on(t.clientId),
    vendorIdx: index("services_vendor_idx").on(t.vendorId),
    categoryIdx: index("services_category_idx").on(t.category),
    renewalIdx: index("services_renewal_idx").on(t.renewalDate),
  }),
);

export const licenses = pgTable(
  "licenses",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
    /**
     * Optional location attribution. When set, this license row covers
     * seats at a specific client site (e.g. "20 M365 E3 — HQ", "5 M365 E3
     * — Branch B" as two separate rows). Null = client-wide.
     */
    locationId: uuid("location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    productName: text("product_name").notNull(),
    sku: text("sku"),
    /** Functional category — drives per-client "what tools is this
     *  client running" rollups and QB-expense reconciliation later.
     *  Defaults to other_saas so existing rows don't need backfill.
     *  The auto-categorizer in src/lib/licenses/categorize.ts sets
     *  this from product name patterns on import + on a one-shot
     *  backfill. */
    category: licenseCategoryEnum("category").notNull().default("other_saas"),
    seatsTotal: integer("seats_total"),
    billingPeriod: licenseBillingPeriodEnum("billing_period").notNull().default("annual"),
    status: licenseStatusEnum("status").notNull().default("active"),
    startsAt: date("starts_at"),
    renewalDate: date("renewal_date"),
    costBasisCents: integer("cost_basis_cents"), // FINANCE-only
    rebillRateCents: integer("rebill_rate_cents"),
    markupPct: integer("markup_pct"), // FINANCE-only
    onePasswordItemUrl: text("one_password_item_url"),
    notes: text("notes"),
    /* ----- Audit lifecycle (Rachel Wong's licensing rock) -------------- */
    auditedAt: timestamp("audited_at", { withTimezone: true }),
    auditedByMembershipId: uuid("audited_by_membership_id"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    validatedByMembershipId: uuid("validated_by_membership_id"),
    billingReconciledAt: timestamp("billing_reconciled_at", { withTimezone: true }),
    billingReconciledByMembershipId: uuid("billing_reconciled_by_membership_id"),
    ownerMembershipId: uuid("owner_membership_id"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("licenses_org_idx").on(t.organizationId),
    vendorIdx: index("licenses_vendor_idx").on(t.vendorId),
    clientIdx: index("licenses_client_idx").on(t.clientId),
    productIdx: index("licenses_product_idx").on(t.productName),
    renewalIdx: index("licenses_renewal_idx").on(t.renewalDate),
  }),
);

export const licenseAssignments = pgTable(
  "license_assignments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    /** When the license seat is consumed by a specific TechOS hardware
     *  row (device-bound agents like SentinelOne, AutoElevate, Intune,
     *  Entra). Null for user-bound SaaS where assignee_email is the
     *  identifier instead. Auto-populated by the Syncro sync for
     *  agents we can detect; manually set in the Hardware card for
     *  everything else. */
    hardwareId: uuid("hardware_id").references(() => hardware.id, {
      onDelete: "cascade",
    }),
    /** 'syncro_auto' when auto-linked by syncAssetsForClient based on
     *  agent signals; 'manual' when an operator linked it through the
     *  UI. Lets us distinguish so re-running the sync doesn't clobber
     *  manual edits. */
    source: text("source").notNull().default("manual"),
    assigneeLabel: text("assignee_label").notNull(),
    assigneeEmail: text("assignee_email"),
    assignedAt: date("assigned_at"),
    endedAt: date("ended_at"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    licenseIdx: index("license_assign_license_idx").on(t.licenseId),
    clientIdx: index("license_assign_client_idx").on(t.clientId),
    hardwareIdx: index("license_assign_hardware_idx").on(t.hardwareId),
    /** Idempotency for the Syncro auto-linker: a given license can be
     *  linked to a hardware row at most once. */
    licenseHardwareUnq: uniqueIndex("license_assign_lic_hw_unq").on(
      t.licenseId,
      t.hardwareId,
    ),
  }),
);

/* ============================================================================
 * DOMAINS — DNS / registrar accounts per client.
 *
 * Distinct from `services` because:
 *   - many domains may live under one registrar service (rebill once,
 *     manage many)
 *   - they have their own renewal cadence + auto-renew posture
 *   - they're a discrete inventory item the licensing-audit rock
 *     specifically calls out
 *
 * If the registrar itself bills us a flat fee per domain we can link
 * back to a registrar `services` row via `registrarServiceId`.
 * ========================================================================== */
export const domains = pgTable(
  "domains",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Free-text registrar label (e.g. "GoDaddy", "Cloudflare"). When the
     *  registrar is also a tracked vendor, link via `vendorId` too. */
    registrar: text("registrar"),
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    /** Optional pointer to the parent registrar service row, so a single
     *  invoice covering many domains can be traced. */
    registrarServiceId: uuid("registrar_service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    expiresAt: date("expires_at"),
    autoRenew: boolean("auto_renew").notNull().default(true),
    /** Is this domain re-billed to the client? Drives whether it shows
     *  up in monthly billing reconciliation. */
    billable: boolean("billable").notNull().default(false),
    rebillRateCents: integer("rebill_rate_cents"),
    onePasswordItemUrl: text("one_password_item_url"),
    notes: text("notes"),
    /* ----- Audit lifecycle (Rachel Wong's licensing rock) -------------- */
    auditedAt: timestamp("audited_at", { withTimezone: true }),
    auditedByMembershipId: uuid("audited_by_membership_id"),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    validatedByMembershipId: uuid("validated_by_membership_id"),
    billingReconciledAt: timestamp("billing_reconciled_at", { withTimezone: true }),
    billingReconciledByMembershipId: uuid("billing_reconciled_by_membership_id"),
    ownerMembershipId: uuid("owner_membership_id"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("domains_org_idx").on(t.organizationId),
    clientIdx: index("domains_client_idx").on(t.clientId),
    nameIdx: index("domains_name_idx").on(t.name),
    expiresIdx: index("domains_expires_idx").on(t.expiresAt),
  }),
);

export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;

export const vendorBills = pgTable(
  "vendor_bills",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    invoiceNumber: text("invoice_number"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    receivedAt: date("received_at"),
    dueAt: date("due_at"),
    paidAt: date("paid_at"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    status: vendorBillStatusEnum("status").notNull().default("received"),
    pdfBlobUrl: text("pdf_blob_url"),
    pdfFilename: text("pdf_filename"),
    extractionStatus: text("extraction_status"),
    extractionMetadataJson: jsonb("extraction_metadata_json"),
    notes: text("notes"),
    /**
     * Where this bill row came from. "manual_upload" = operator dropped
     * a PDF; "ingram_api" = auto-pulled from Ingram Reseller API; future
     * "acronis_api" etc. The UI uses this to badge bills and to disable
     * fields that the source owns (e.g. you can't edit total_cents on
     * an API-sourced bill because the next sync will overwrite it).
     */
    source: text("source").notNull().default("manual_upload"),
    /**
     * Vendor-side identifier for idempotent re-sync. For Ingram, this
     * is invoiceNumber from /resellers/v6/invoices. Unique per
     * (org, vendor_id, external_id) when non-NULL.
     */
    externalId: text("external_id"),
    /**
     * Raw vendor-side payload for the bill (header level). Kept for
     * audit + drift detection between syncs. Line-level data lives in
     * vendor_bill_lines.
     */
    externalMetadataJson: jsonb("external_metadata_json"),
    uploadedByMembershipId: uuid("uploaded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("vbills_org_idx").on(t.organizationId),
    vendorIdx: index("vbills_vendor_idx").on(t.vendorId),
    invoiceIdx: index("vbills_invoice_idx").on(t.organizationId, t.invoiceNumber),
    sourceIdx: index("vbills_source_idx").on(t.organizationId, t.source),
  }),
);

export const vendorBillLines = pgTable(
  "vendor_bill_lines",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    billId: uuid("bill_id")
      .notNull()
      .references(() => vendorBills.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    sku: text("sku"),
    quantity: integer("quantity"),
    unitCostCents: integer("unit_cost_cents"),
    totalCents: integer("total_cents").notNull().default(0),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    /**
     * Cost attribution. Which client + site this specific line is for.
     * Independent of rebilling — a line can be attributed to a client
     * even if USI absorbs the cost (no billable created). When the user
     * uploads a multi-client carrier bill, every line gets tagged here
     * and the bills-by-client/location report aggregates from this.
     */
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    matchedLicenseId: uuid("matched_license_id").references(() => licenses.id, {
      onDelete: "set null",
    }),
    matchedServiceId: uuid("matched_service_id").references(() => services.id, {
      onDelete: "set null",
    }),
    extractionConfidence: integer("extraction_confidence"),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    billIdx: index("vbill_lines_bill_idx").on(t.billId),
    matchedLicenseIdx: index("vbill_lines_lic_idx").on(t.matchedLicenseId),
    clientIdx: index("vbill_lines_client_idx").on(t.clientId),
    locationIdx: index("vbill_lines_location_idx").on(t.locationId),
    matchedServiceIdx: index("vbill_lines_svc_idx").on(t.matchedServiceId),
  }),
);

export const billables = pgTable(
  "billables",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    licenseId: uuid("license_id").references(() => licenses.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    vendorBillLineId: uuid("vendor_bill_line_id").references(() => vendorBillLines.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    quantity: integer("quantity"),
    costBasisCents: integer("cost_basis_cents").notNull().default(0),
    markupPct: integer("markup_pct").notNull().default(0),
    markupCents: integer("markup_cents").notNull().default(0),
    rebillCents: integer("rebill_cents").notNull().default(0),
    status: billableStatusEnum("status").notNull().default("draft"),
    invoicedAt: date("invoiced_at"),
    invoiceReference: text("invoice_reference"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("billables_org_idx").on(t.organizationId),
    clientIdx: index("billables_client_idx").on(t.clientId),
    periodIdx: index("billables_period_idx").on(t.periodStart, t.periodEnd),
  }),
);

/* ============================================================================
 * CUSTOMER INVOICES (NEW — one-click monthly batch + per-order hardware
 *                    bills, persisted so status / send / paid / void can
 *                    be tracked over time)
 *
 * Two main kinds:
 *  - 'monthly_contract' — generated 1st of next month for the just-
 *    completed billing period. One per (client, period). Heartbeat math,
 *    NoC excluded, live-floor applied — same numbers the on-screen
 *    Monthly Statement shows.
 *  - 'hardware' — generated when an IT order moves to status='shipped'.
 *    Pulls line items from it_order_lines, attaches shipping + tax.
 *  - 'one_off' — manually-created, ad-hoc.
 *
 * Status workflow: draft → sent → paid (terminal). 'void' is terminal
 * from any non-paid state.
 * ========================================================================== */
export const invoiceKindEnum = pgEnum("invoice_kind", [
  "monthly_contract",
  "hardware",
  "one_off",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** Human-readable identifier we own.
     *   USI-YYYYMM-<CLIENT_SLUG>  for monthly_contract
     *   USI-HW-<ORDER_REF>        for hardware
     *   USI-<YYYYMM>-<SLUG>-<NN>  for one_off (NN auto-incremented per client/month)
     */
    invoiceNumber: text("invoice_number").notNull(),
    kind: invoiceKindEnum("kind").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    /** Billing period (monthly_contract only). Hardware uses periodStart =
     *  ship date for record-keeping. */
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    /** Hardware invoices link back to the source order. */
    itOrderId: uuid("it_order_id"),
    /** Money — cents */
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    /** Tag the methodology used to compute quantities (display + audit).
     *  'heartbeats' | 'fallback' | 'live' | 'hardware_order' | 'manual'. */
    quantityBasis: text("quantity_basis"),
    /** True if the floor raised any tier at compute time. */
    flooredUp: boolean("floored_up").notNull().default(false),
    /** Audit */
    generatedByMembershipId: uuid("generated_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    notes: text("notes"),

    /* ----- PS-style invoice header fields (matches the legacy QB
     *       invoice template). All optional so the older
     *       buildMonthlyContractInvoice + hardware flows keep working
     *       unchanged until each is migrated to fill these in. -------- */
    /** P.O. Number value shown on the printed invoice. For monthly
     *  recurring this is the service period label ("April 2026").
     *  For hardware projects it's the job-site name. */
    poNumber: text("po_number"),
    /** Optional Ship-To block (job-site address). When null the printed
     *  invoice shows blank Ship-To. */
    shipToLabel: text("ship_to_label"),
    shipToLine1: text("ship_to_line1"),
    shipToLine2: text("ship_to_line2"),
    shipToCity: text("ship_to_city"),
    shipToRegion: text("ship_to_region"),
    shipToPostalCode: text("ship_to_postal_code"),
    shipToCountry: text("ship_to_country"),
    /** Free-text fields shown in the header table. Defaults applied at
     *  generate time, not in the column default — null = blank. */
    orderedBy: text("ordered_by"),
    pickupBy: text("pickup_by"),
    rep: text("rep"), // "PS"
    via: text("via"), // "Best Way"
    termsLabel: text("terms_label"), // "NET 30"
    /** Human label shown above the line items, e.g. "April 2026". */
    servicePeriodLabel: text("service_period_label"),

    ...timestamps,
  },
  (t) => ({
    /** Invoice numbers must be unique within an org. */
    orgNumberUnq: uniqueIndex("invoices_org_number_unq").on(
      t.organizationId,
      t.invoiceNumber,
    ),
    /** A live monthly_contract invoice per (client, period) — partial
     *  unique so a 'void' can be regenerated. Implemented as a regular
     *  unique constraint; the void rule is enforced in the action layer
     *  (drizzle's pgTable doesn't expose partial-index sugar). */
    clientPeriodIdx: index("invoices_client_period_idx").on(
      t.clientId,
      t.periodStart,
      t.kind,
    ),
    statusIdx: index("invoices_status_idx").on(t.status),
    issuedIdx: index("invoices_issued_idx").on(t.issueDate),
    itOrderIdx: index("invoices_it_order_idx").on(t.itOrderId),
  }),
);

export const invoiceLineCategoryEnum = pgEnum("invoice_line_category", [
  "support_baseline",
  "support_tier",
  "license_microsoft",
  "license_third_party",
  "service_recurring",
  "variable_charge",
  "hardware",
  "shipping",
  "tax",
  "discount",
  "other",
]);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    category: invoiceLineCategoryEnum("category").notNull(),
    /** Optional traceability back to the source row that produced the
     *  line. e.g. license_id for a Microsoft-license rebill line.
     *  'computed' for support tier lines that derive from heartbeats. */
    sourceKind: text("source_kind"),
    sourceId: uuid("source_id"),
    description: text("description").notNull(),
    /** Tiny hint shown below the description ("Workstations / laptops /
     *  servers", "Net 30", etc.). */
    detail: text("detail"),
    quantity: integer("quantity").notNull().default(1),
    unitRateCents: integer("unit_rate_cents").notNull().default(0),
    amountCents: integer("amount_cents").notNull().default(0),

    /* ----- PS-style invoice line fields ------------------------------- */
    /** Location attribution. Drives per-location grouping on the printed
     *  invoice and the per-location subtotals. NULL = global line that
     *  sits after all the per-location sections (e.g. "Syncro Remote
     *  Access - per contact"). */
    locationId: uuid("location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    /** Vendor / product Part # shown in the printed Part # column.
     *  Examples: "PS / Compute Node", "2765SEPSN012AAZZ", "Liongard",
     *  "TitanHQ Plus", "Syncro Remote". */
    sku: text("sku"),
    /** Long, multi-line product description with bullet points (the
     *  body cell on the printed invoice that often spans 3-4 lines).
     *  When set, takes precedence over `description` on render. The
     *  short `description` stays as the QB-mapping handle. */
    longDescription: text("long_description"),
    /** A pseudo-line that prints as a section divider rather than a
     *  billable row. Used for hardware invoices to inject
     *  "---------- Network Cabinet Equipment ----------" headers
     *  between groups of lines. When true, the renderer ignores
     *  quantity/rate/amount and emits a stylized header row. */
    isSectionHeader: boolean("is_section_header").notNull().default(false),
    /** Free-text label printed under the section divider — e.g. the
     *  serial-number tracking note ("SN: 103426-29") that sits as a
     *  $0 line on the legacy invoices. */
    sectionLabel: text("section_label"),
    ...timestamps,
  },
  (t) => ({
    invoiceIdx: index("invoice_lines_invoice_idx").on(t.invoiceId),
    categoryIdx: index("invoice_lines_category_idx").on(t.category),
    locationIdx: index("invoice_lines_location_idx").on(t.locationId),
  }),
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type NewInvoiceLine = typeof invoiceLines.$inferInsert;

/* ============================================================================
 * RELATIONS
 * ========================================================================== */
export const vendorsRelations = relations(vendors, ({ many }) => ({
  contracts: many(contracts),
  licenses: many(licenses),
  services: many(services),
  hardware: many(hardware),
  bills: many(vendorBills),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  vendor: one(vendors, { fields: [contracts.vendorId], references: [vendors.id] }),
  client: one(clients, { fields: [contracts.clientId], references: [clients.id] }),
  licenses: many(licenses),
}));

export const hardwareRelations = relations(hardware, ({ one }) => ({
  client: one(clients, { fields: [hardware.clientId], references: [clients.id] }),
  location: one(clientLocations, {
    fields: [hardware.locationId],
    references: [clientLocations.id],
  }),
  vendor: one(vendors, { fields: [hardware.vendorId], references: [vendors.id] }),
}));

export const servicesRelations = relations(services, ({ one }) => ({
  client: one(clients, { fields: [services.clientId], references: [clients.id] }),
  vendor: one(vendors, { fields: [services.vendorId], references: [vendors.id] }),
}));

export const licensesRelations = relations(licenses, ({ one, many }) => ({
  vendor: one(vendors, { fields: [licenses.vendorId], references: [vendors.id] }),
  client: one(clients, { fields: [licenses.clientId], references: [clients.id] }),
  contract: one(contracts, { fields: [licenses.contractId], references: [contracts.id] }),
  assignments: many(licenseAssignments),
}));

export const licenseAssignmentsRelations = relations(licenseAssignments, ({ one }) => ({
  license: one(licenses, {
    fields: [licenseAssignments.licenseId],
    references: [licenses.id],
  }),
  client: one(clients, {
    fields: [licenseAssignments.clientId],
    references: [clients.id],
  }),
}));

export const vendorBillsRelations = relations(vendorBills, ({ one, many }) => ({
  vendor: one(vendors, { fields: [vendorBills.vendorId], references: [vendors.id] }),
  lines: many(vendorBillLines),
}));

export const vendorBillLinesRelations = relations(vendorBillLines, ({ one, many }) => ({
  bill: one(vendorBills, {
    fields: [vendorBillLines.billId],
    references: [vendorBills.id],
  }),
  matchedLicense: one(licenses, {
    fields: [vendorBillLines.matchedLicenseId],
    references: [licenses.id],
  }),
  matchedService: one(services, {
    fields: [vendorBillLines.matchedServiceId],
    references: [services.id],
  }),
  billables: many(billables),
}));

export const billablesRelations = relations(billables, ({ one }) => ({
  client: one(clients, { fields: [billables.clientId], references: [clients.id] }),
  license: one(licenses, { fields: [billables.licenseId], references: [licenses.id] }),
  service: one(services, { fields: [billables.serviceId], references: [services.id] }),
  vendorBillLine: one(vendorBillLines, {
    fields: [billables.vendorBillLineId],
    references: [vendorBillLines.id],
  }),
}));

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
export type Contract = typeof contracts.$inferSelect;
export type NewContract = typeof contracts.$inferInsert;
export type Hardware = typeof hardware.$inferSelect;
export type NewHardware = typeof hardware.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type LicenseAssignment = typeof licenseAssignments.$inferSelect;
export type VendorBill = typeof vendorBills.$inferSelect;
export type NewVendorBill = typeof vendorBills.$inferInsert;
export type VendorBillLine = typeof vendorBillLines.$inferSelect;
export type Billable = typeof billables.$inferSelect;
export type NewBillable = typeof billables.$inferInsert;
