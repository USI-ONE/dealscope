/**
 * On-site survey diligence — structured discovery work done by a field
 * technician at a client site. Drives:
 *   - M&A LOI-stage diligence (target evaluation pre-close)
 *   - New-client onboarding (USI taking over IT, needs everything)
 *   - Hardware refresh / tech-stack audits (existing clients)
 *   - General site walks
 *
 * A survey carries:
 *   - Itemized inventory (workstations, monitors, network gear, etc.)
 *     with per-item specs, condition, and recommended action
 *   - Photo gallery — site photos + per-item photos
 *   - Optional link to a diligence engagement (M&A) or a client
 *     (onboarding / audit / general site walk)
 *
 * Recommended-action on each item (replace / refresh / keep / etc.)
 * lets the survey feed into the compliance gap-analysis system.
 */
import { relations } from "drizzle-orm";
import {
  date,
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
import { clients, clientLocations } from "./clients";
import { hardware } from "./catalog";
import { diligenceEngagements } from "./diligence";

export const siteSurveyKindEnum = pgEnum("site_survey_kind", [
  "loi_diligence",
  "onboarding",
  "hardware_audit",
  "general_site",
]);

export const siteSurveyStatusEnum = pgEnum("site_survey_status", [
  "planning",
  "in_progress",
  "complete",
  "cancelled",
]);

export const siteSurveyItemKindEnum = pgEnum("site_survey_item_kind", [
  "workstation",
  "laptop",
  "monitor",
  "tablet",
  "phone_handset",
  "voice_gateway",
  "server_physical",
  "server_virtual",
  "storage_array",
  "firewall",
  "router",
  "switch",
  "wireless_ap",
  "wireless_controller",
  "patch_panel",
  "rack",
  "ups",
  "pdu",
  "modem",
  "printer",
  "mfp",
  "scanner",
  "camera",
  "nvr",
  "intercom",
  "tv_signage",
  "projector",
  "speaker_system",
  "pos_terminal",
  "kiosk",
  "specialty_equipment",
  "peripheral_keyboard",
  "peripheral_mouse",
  "peripheral_dock",
  "peripheral_headset",
  "peripheral_other",
  "cabling",
  "other",
]);

export const siteSurveyItemConditionEnum = pgEnum(
  "site_survey_item_condition",
  ["new", "good", "fair", "aging", "eol", "dead", "unknown"],
);

export const siteSurveyRecommendedActionEnum = pgEnum(
  "site_survey_recommended_action",
  [
    "keep",
    "monitor",
    "refresh_planned",
    "refresh_now",
    "replace",
    "decommission",
    "investigate",
    "unknown",
  ],
);

export const siteSurveys = pgTable(
  "site_surveys",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: siteSurveyKindEnum("kind").notNull().default("general_site"),
    status: siteSurveyStatusEnum("status").notNull().default("planning"),
    name: text("name").notNull(),

    /** Scope — exactly one of engagement_id or client_id should be set
     *  in practice (soft-enforced by the UI / actions, not DB). */
    engagementId: uuid("engagement_id").references(
      () => diligenceEngagements.id,
      { onDelete: "cascade" },
    ),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    /** Optional pointer to a specific client_locations row when the
     *  survey covers a single physical site. */
    clientLocationId: uuid("client_location_id").references(
      () => clientLocations.id,
      { onDelete: "set null" },
    ),

    /** Free-form site address — set when the location isn't yet a
     *  client_locations row (common on LOI diligence). */
    siteAddress: text("site_address"),

    leadTechnicianMembershipId: uuid(
      "lead_technician_membership_id",
    ).references(() => memberships.id, { onDelete: "set null" }),

    scheduledDate: date("scheduled_date"),
    performedAt: timestamp("performed_at", { withTimezone: true }),

    summary: text("summary"),
    /** Free-form internal notes on the survey overall. */
    notes: text("notes"),

    /** List of accompanying personnel — e.g., the client's IT lead. */
    accompaniedBy: jsonb("accompanied_by")
      .$type<Array<{ name: string; role?: string; email?: string }>>()
      .notNull()
      .default([]),

    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("site_surveys_org_idx").on(t.organizationId),
    kindIdx: index("site_surveys_kind_idx").on(t.kind),
    engagementIdx: index("site_surveys_engagement_idx").on(t.engagementId),
    clientIdx: index("site_surveys_client_idx").on(t.clientId),
  }),
);

export const siteSurveysRelations = relations(siteSurveys, ({ one, many }) => ({
  client: one(clients, {
    fields: [siteSurveys.clientId],
    references: [clients.id],
  }),
  engagement: one(diligenceEngagements, {
    fields: [siteSurveys.engagementId],
    references: [diligenceEngagements.id],
  }),
  location: one(clientLocations, {
    fields: [siteSurveys.clientLocationId],
    references: [clientLocations.id],
  }),
  items: many(siteSurveyItems),
  photos: many(siteSurveyPhotos),
}));

export type SiteSurvey = typeof siteSurveys.$inferSelect;
export type NewSiteSurvey = typeof siteSurveys.$inferInsert;

/* ============================================================================
 * Survey items — polymorphic inventory rows.
 *
 * The `details` JSONB column holds kind-specific fields. Common shapes:
 *   workstation/laptop: { os, osVersion, cpu, ramGb, storageGb,
 *     storageKind, monitorCount, monitorSizesInches, peripherals,
 *     warrantyEnd, lastSeenAt }
 *   server_physical: { hypervisor, role, os, cpu, ramGb, storage }
 *   firewall/router: { interfaceCount, throughputGbps, vpnUsers,
 *     poeBudgetW, licenseTier, licenseEnd }
 *   switch: { ports, poeWatts, mgmt: 'managed'|'unmanaged', stack }
 *   wireless_ap: { wifiStandard: 'wifi5'|'wifi6'|'wifi6e'|'wifi7',
 *     mountType, poePowered }
 *   monitor: { sizeInches, resolution, panelType, age, mountKind }
 *   ups: { capacityVA, runtimeMin, batteryAge }
 *   printer/mfp: { color, ppm, lease, monthlyVolume, vendor }
 *   peripheral_*: { wireless, brand, age }
 * ========================================================================== */
export const siteSurveyItems = pgTable(
  "site_survey_items",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => siteSurveys.id, { onDelete: "cascade" }),
    kind: siteSurveyItemKindEnum("kind").notNull(),

    label: text("label").notNull(),
    assetTag: text("asset_tag"),
    hostname: text("hostname"),
    serialNumber: text("serial_number"),
    make: text("make"),
    model: text("model"),

    /** Where it sits within the site — "Reception", "MDF", "Server room
     *  rack 2". */
    room: text("room"),
    /** Who's assigned to it — relevant for workstations / phones. */
    userAssigned: text("user_assigned"),

    /** Kind-specific specs — see the JSDoc above for common shapes. */
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    installDate: date("install_date"),
    warrantyEnd: date("warranty_end"),

    condition: siteSurveyItemConditionEnum("condition")
      .notNull()
      .default("unknown"),
    recommendedAction: siteSurveyRecommendedActionEnum("recommended_action")
      .notNull()
      .default("unknown"),

    /** Estimated cost to apply the recommended action, in cents. */
    remediationCostLowCents: integer("remediation_cost_low_cents"),
    remediationCostHighCents: integer("remediation_cost_high_cents"),

    notes: text("notes"),

    /** Bulk-record convenience — most items are 1; bulk peripherals or
     *  identical-spec endpoints can be entered as quantity > 1. */
    quantity: integer("quantity").notNull().default(1),

    /** Optional link to an existing hardware record (when the survey
     *  is for an existing client and the item maps to a tracked asset). */
    hardwareId: uuid("hardware_id").references(() => hardware.id, {
      onDelete: "set null",
    }),

    ...timestamps,
  },
  (t) => ({
    surveyIdx: index("site_survey_items_survey_idx").on(t.surveyId),
    kindIdx: index("site_survey_items_kind_idx").on(t.kind),
  }),
);

export const siteSurveyItemsRelations = relations(
  siteSurveyItems,
  ({ one, many }) => ({
    survey: one(siteSurveys, {
      fields: [siteSurveyItems.surveyId],
      references: [siteSurveys.id],
    }),
    hardware: one(hardware, {
      fields: [siteSurveyItems.hardwareId],
      references: [hardware.id],
    }),
    photos: many(siteSurveyPhotos),
  }),
);

export type SiteSurveyItem = typeof siteSurveyItems.$inferSelect;
export type NewSiteSurveyItem = typeof siteSurveyItems.$inferInsert;

/* ============================================================================
 * Photos — many-to-one with surveys, optionally tied to a specific item.
 *
 * Photos are stored in Vercel Blob (or any other reachable URL the user
 * pastes in). The schema only keeps the URL + metadata.
 * ========================================================================== */
export const siteSurveyPhotos = pgTable(
  "site_survey_photos",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    surveyId: uuid("survey_id")
      .notNull()
      .references(() => siteSurveys.id, { onDelete: "cascade" }),
    /** When set, the photo documents this specific item. When null,
     *  the photo is a general site shot (server room overview, MDF,
     *  cable mess, building exterior, etc.). */
    itemId: uuid("item_id").references(() => siteSurveyItems.id, {
      onDelete: "set null",
    }),

    url: text("url").notNull(),
    /** Original filename — useful when the photo was uploaded directly. */
    filename: text("filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    /** Width / height in pixels — useful for gallery layout. */
    widthPx: integer("width_px"),
    heightPx: integer("height_px"),

    caption: text("caption"),
    /** EXIF or user-set capture time. */
    takenAt: timestamp("taken_at", { withTimezone: true }),

    uploadedByMembershipId: uuid("uploaded_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    ...timestamps,
  },
  (t) => ({
    surveyIdx: index("site_survey_photos_survey_idx").on(t.surveyId),
    itemIdx: index("site_survey_photos_item_idx").on(t.itemId),
  }),
);

export const siteSurveyPhotosRelations = relations(
  siteSurveyPhotos,
  ({ one }) => ({
    survey: one(siteSurveys, {
      fields: [siteSurveyPhotos.surveyId],
      references: [siteSurveys.id],
    }),
    item: one(siteSurveyItems, {
      fields: [siteSurveyPhotos.itemId],
      references: [siteSurveyItems.id],
    }),
  }),
);

export type SiteSurveyPhoto = typeof siteSurveyPhotos.$inferSelect;
export type NewSiteSurveyPhoto = typeof siteSurveyPhotos.$inferInsert;

/* ============================================================================
 * Display labels — used by both the UI and the eventual DOCX export.
 * ========================================================================== */
export const SITE_SURVEY_KIND_LABEL: Record<string, string> = {
  loi_diligence: "M&A · LOI diligence",
  onboarding: "Client onboarding",
  hardware_audit: "Hardware audit",
  general_site: "General site survey",
};

export const SITE_SURVEY_KIND_DESCRIPTION: Record<string, string> = {
  loi_diligence:
    "Pre-close diligence on an acquisition target. Lighter inventory — focus on capturing what's there, identifying material risks, and informing the deal sponsor.",
  onboarding:
    "USI is taking over IT. Maximum detail — every endpoint, monitor, peripheral, networking device, and physical-layer asset gets documented for the runbook + future billing tier baseline.",
  hardware_audit:
    "Existing client tech-stack assessment. Refresh windows, EOL items, recommended actions for the next year of capex planning.",
  general_site:
    "Standalone site walk. Ad-hoc discovery without a specific upstream consumer.",
};

export const SITE_SURVEY_STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  complete: "Complete",
  cancelled: "Cancelled",
};

export const SITE_SURVEY_ITEM_KIND_LABEL: Record<string, string> = {
  workstation: "Workstation / Desktop",
  laptop: "Laptop",
  monitor: "Monitor",
  tablet: "Tablet",
  phone_handset: "Phone handset",
  voice_gateway: "Voice gateway / PBX",
  server_physical: "Server (physical)",
  server_virtual: "Server (VM)",
  storage_array: "Storage array / NAS / SAN",
  firewall: "Firewall",
  router: "Router",
  switch: "Switch",
  wireless_ap: "Wireless access point",
  wireless_controller: "Wireless controller",
  patch_panel: "Patch panel",
  rack: "Rack",
  ups: "UPS",
  pdu: "PDU",
  modem: "Modem / ONT",
  printer: "Printer",
  mfp: "MFP / copier",
  scanner: "Scanner",
  camera: "Camera",
  nvr: "NVR / DVR",
  intercom: "Intercom / paging",
  tv_signage: "TV / Signage",
  projector: "Projector",
  speaker_system: "Speaker / audio system",
  pos_terminal: "POS terminal",
  kiosk: "Kiosk",
  specialty_equipment: "Specialty equipment",
  peripheral_keyboard: "Keyboard",
  peripheral_mouse: "Mouse",
  peripheral_dock: "Dock",
  peripheral_headset: "Headset",
  peripheral_other: "Peripheral (other)",
  cabling: "Cabling / structured wiring",
  other: "Other",
};

/** Visual grouping in the UI. Order matters — drives the rendered
 *  section order on the survey detail page. */
export const SITE_SURVEY_ITEM_GROUPS: Array<{
  group: string;
  label: string;
  kinds: string[];
}> = [
  {
    group: "endpoints",
    label: "Endpoints",
    kinds: ["workstation", "laptop", "tablet"],
  },
  {
    group: "displays_peripherals",
    label: "Displays & peripherals",
    kinds: [
      "monitor",
      "peripheral_keyboard",
      "peripheral_mouse",
      "peripheral_dock",
      "peripheral_headset",
      "peripheral_other",
    ],
  },
  {
    group: "servers_storage",
    label: "Servers & storage",
    kinds: ["server_physical", "server_virtual", "storage_array"],
  },
  {
    group: "network",
    label: "Network",
    kinds: [
      "firewall",
      "router",
      "switch",
      "wireless_ap",
      "wireless_controller",
      "modem",
      "patch_panel",
    ],
  },
  {
    group: "infrastructure",
    label: "Infrastructure",
    kinds: ["rack", "ups", "pdu", "cabling"],
  },
  {
    group: "voice_video",
    label: "Voice, video, signage",
    kinds: [
      "phone_handset",
      "voice_gateway",
      "camera",
      "nvr",
      "intercom",
      "tv_signage",
      "projector",
      "speaker_system",
    ],
  },
  {
    group: "print",
    label: "Print",
    kinds: ["printer", "mfp", "scanner"],
  },
  {
    group: "specialty",
    label: "Specialty / industry-specific",
    kinds: ["pos_terminal", "kiosk", "specialty_equipment", "other"],
  },
];
