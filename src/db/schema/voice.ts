/**
 * Voice / phone-service runbook tables.
 *
 * Per-client representation of the voice stack — typically RingCentral
 * (the BRD shape) but the schema generalizes across MS Teams Voice,
 * 8x8, Zoom Phone, etc. Five tables:
 *
 *   voice_services    one row per client — provider, tier, account
 *                     UID, vendor contacts, key links.
 *   voice_sites       per-physical-location voice config (main phone,
 *                     outbound caller ID, hours, timezone). Links to
 *                     client_locations when names fuzzy-match.
 *   voice_extensions  one row per assigned phone extension / user.
 *   voice_numbers     DID inventory with porting metadata.
 *   voice_flows       call queues, IVRs, auto-attendants, hunt groups.
 */
import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { id, timestamps } from "./_shared";
import { organizations, memberships } from "./organizations";
import { clients, clientLocations } from "./clients";

export const voiceServices = pgTable(
  "voice_services",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerTier: text("provider_tier"),
    accountUid: text("account_uid"),
    customerAccountNumber: text("customer_account_number"),
    status: text("status").notNull().default("planning"),
    goLiveDate: date("go_live_date"),
    salesAgreementUrl: text("sales_agreement_url"),
    sowUrl: text("sow_url"),
    mondayBoardUrl: text("monday_board_url"),
    lucidchartUrl: text("lucidchart_url"),
    driveUrl: text("drive_url"),
    portingLinkUrl: text("porting_link_url"),
    usiPmMembershipId: uuid("usi_pm_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    vendorPmName: text("vendor_pm_name"),
    vendorPmEmail: text("vendor_pm_email"),
    vendorPmPhone: text("vendor_pm_phone"),
    vendorEngineerName: text("vendor_engineer_name"),
    vendorEngineerEmail: text("vendor_engineer_email"),
    vendorEngineerPhone: text("vendor_engineer_phone"),
    /** 1Password item URL — where the operating credentials for this
     *  service live. Click-through link rendered next to the audit
     *  button so an auditor can hop to the creds, log in, verify, and
     *  hit "Mark audited" without re-typing anything. */
    onePasswordItemUrl: text("one_password_item_url"),
    /** Stamped when an operator confirms the credentials still work.
     *  USI's compliance rule is a 30-day audit cycle — anything older
     *  shows as overdue on the runbook + on /upcoming. */
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
    clientUnq: uniqueIndex("voice_services_client_unq").on(t.clientId),
    orgIdx: index("voice_services_org_idx").on(t.organizationId),
    auditIdx: index("voice_services_audit_idx").on(t.lastAuditedAt),
  }),
);

export const voiceSites = pgTable(
  "voice_sites",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    voiceServiceId: uuid("voice_service_id")
      .notNull()
      .references(() => voiceServices.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => clientLocations.id, {
      onDelete: "set null",
    }),
    siteName: text("site_name").notNull(),
    mainPhone: text("main_phone"),
    outboundCallerIdName: text("outbound_caller_id_name"),
    hoursOfOperation: text("hours_of_operation"),
    timezone: text("timezone"),
    emergencyResponseLocationNickname: text(
      "emergency_response_location_nickname",
    ),
    shippingAddress: text("shipping_address"),
    deploymentDate: text("deployment_date"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("voice_sites_client_idx").on(t.clientId),
    serviceIdx: index("voice_sites_service_idx").on(t.voiceServiceId),
  }),
);

export const voiceExtensions = pgTable(
  "voice_extensions",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    voiceServiceId: uuid("voice_service_id")
      .notNull()
      .references(() => voiceServices.id, { onDelete: "cascade" }),
    voiceSiteId: uuid("voice_site_id").references(() => voiceSites.id, {
      onDelete: "set null",
    }),
    extNumber: text("ext_number"),
    didNumber: text("did_number"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    userType: text("user_type"),
    role: text("role"),
    template: text("template"),
    department: text("department"),
    jobTitle: text("job_title"),
    deviceType: text("device_type"),
    deviceMac: text("device_mac"),
    ringsenseEnabled: boolean("ringsense_enabled").notNull().default(false),
    ringsenseRole: text("ringsense_role"),
    msTeams: boolean("ms_teams").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("voice_extensions_client_idx").on(t.clientId),
    siteIdx: index("voice_extensions_site_idx").on(t.voiceSiteId),
    didIdx: index("voice_extensions_did_idx").on(t.didNumber),
    extIdx: index("voice_extensions_ext_idx").on(
      t.voiceServiceId,
      t.extNumber,
    ),
  }),
);

export const voiceNumbers = pgTable(
  "voice_numbers",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    voiceServiceId: uuid("voice_service_id")
      .notNull()
      .references(() => voiceServices.id, { onDelete: "cascade" }),
    voiceSiteId: uuid("voice_site_id").references(() => voiceSites.id, {
      onDelete: "set null",
    }),
    didNumber: text("did_number").notNull(),
    numberType: text("number_type"),
    rcNumberType: text("rc_number_type"),
    extNumber: text("ext_number"),
    tempRcNumber: text("temp_rc_number"),
    losingCarrier: text("losing_carrier"),
    billingPhoneNumber: text("billing_phone_number"),
    carrierAccountNumber: text("carrier_account_number"),
    authorizedUser: text("authorized_user"),
    portingDate: date("porting_date"),
    status: text("status").notNull().default("pending"),
    serviceAddress: text("service_address"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("voice_numbers_client_idx").on(t.clientId),
    didIdx: index("voice_numbers_did_idx").on(t.didNumber),
    statusIdx: index("voice_numbers_status_idx").on(
      t.voiceServiceId,
      t.status,
    ),
  }),
);

export const voiceFlows = pgTable(
  "voice_flows",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    voiceServiceId: uuid("voice_service_id")
      .notNull()
      .references(() => voiceServices.id, { onDelete: "cascade" }),
    voiceSiteId: uuid("voice_site_id").references(() => voiceSites.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    extNumber: text("ext_number"),
    didNumber: text("did_number"),
    greetingText: text("greeting_text"),
    businessHoursHandler: text("business_hours_handler"),
    afterHoursHandler: text("after_hours_handler"),
    memberExtensionsJson: jsonb("member_extensions_json"),
    routingOptionsJson: jsonb("routing_options_json"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index("voice_flows_client_idx").on(t.clientId),
    kindIdx: index("voice_flows_kind_idx").on(t.voiceServiceId, t.kind),
  }),
);

export const voiceServicesRelations = relations(voiceServices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [voiceServices.organizationId],
    references: [organizations.id],
  }),
  client: one(clients, {
    fields: [voiceServices.clientId],
    references: [clients.id],
  }),
  sites: many(voiceSites),
  extensions: many(voiceExtensions),
  numbers: many(voiceNumbers),
  flows: many(voiceFlows),
}));

export const voiceSitesRelations = relations(voiceSites, ({ one, many }) => ({
  service: one(voiceServices, {
    fields: [voiceSites.voiceServiceId],
    references: [voiceServices.id],
  }),
  location: one(clientLocations, {
    fields: [voiceSites.locationId],
    references: [clientLocations.id],
  }),
  extensions: many(voiceExtensions),
  numbers: many(voiceNumbers),
  flows: many(voiceFlows),
}));

export const voiceExtensionsRelations = relations(voiceExtensions, ({ one }) => ({
  service: one(voiceServices, {
    fields: [voiceExtensions.voiceServiceId],
    references: [voiceServices.id],
  }),
  site: one(voiceSites, {
    fields: [voiceExtensions.voiceSiteId],
    references: [voiceSites.id],
  }),
}));

export const voiceNumbersRelations = relations(voiceNumbers, ({ one }) => ({
  service: one(voiceServices, {
    fields: [voiceNumbers.voiceServiceId],
    references: [voiceServices.id],
  }),
  site: one(voiceSites, {
    fields: [voiceNumbers.voiceSiteId],
    references: [voiceSites.id],
  }),
}));

export const voiceFlowsRelations = relations(voiceFlows, ({ one }) => ({
  service: one(voiceServices, {
    fields: [voiceFlows.voiceServiceId],
    references: [voiceServices.id],
  }),
  site: one(voiceSites, {
    fields: [voiceFlows.voiceSiteId],
    references: [voiceSites.id],
  }),
}));

export type VoiceService = typeof voiceServices.$inferSelect;
export type VoiceSite = typeof voiceSites.$inferSelect;
export type VoiceExtension = typeof voiceExtensions.$inferSelect;
export type VoiceNumber = typeof voiceNumbers.$inferSelect;
export type VoiceFlow = typeof voiceFlows.$inferSelect;
