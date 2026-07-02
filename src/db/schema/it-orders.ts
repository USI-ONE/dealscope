/**
 * IT Ordering workflow — Professional Services orders hardware, software,
 * peripherals, or services on behalf of a client. Tracks:
 *   - the request (lines, justification, client)
 *   - the procurement back-and-forth (quote upload, PO, receipt)
 *   - the client approval (out-of-band email/phone/Teams + evidence)
 *   - the PS-side configuration + handoff
 *   - shipping (carrier + tracking)
 *   - delivery + customer-facing completion
 *
 * Status flow (allowed forward transitions):
 *   draft → submitted → quoted → quote_sent_to_client →
 *   client_approved → ordered → received → being_configured →
 *   ready_to_ship → shipped → delivered → complete
 *   * → cancelled (any time before complete)
 *
 * Notifications happen via mailto: links that pre-fill the user's mail
 * client. Each "Notify ..." button records a row in it_order_events with
 * channel + recipient so the audit trail captures the trigger, while
 * the user's Sent folder captures the actual send.
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { memberships, organizations } from "./organizations";
import { clients } from "./clients";
import { vendors } from "./catalog";

export const itOrderStatusEnum = pgEnum("it_order_status", [
  "draft",
  "submitted",
  "quoted",
  "quote_sent_to_client",
  "client_approved",
  "ordered",
  "received",
  "being_configured",
  "ready_to_ship",
  "shipped",
  "delivered",
  "complete",
  "cancelled",
]);

export const itOrderLineCategoryEnum = pgEnum("it_order_line_category", [
  "hardware",
  "software",
  "peripheral",
  "service",
  "subscription",
  "consumable",
  "other",
]);

export const itOrderAttachmentKindEnum = pgEnum(
  "it_order_attachment_kind",
  [
    "quote",
    "sales_order",
    "purchase_order",
    "invoice",
    "packing_slip",
    "approval_evidence",
    "configuration_notes",
    "completion_evidence",
    "other",
  ],
);

export const itOrderEventKindEnum = pgEnum("it_order_event_kind", [
  "status_change",
  "comment",
  "notification_sent",
  "file_attached",
  "approval_recorded",
]);

export const itOrders = pgTable(
  "it_orders",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Human-readable identifier — ORD-2026-001 style. */
    refCode: text("ref_code").notNull(),

    title: text("title").notNull(),
    summary: text("summary"),
    businessJustification: text("business_justification"),

    status: itOrderStatusEnum("status").notNull().default("draft"),

    /** The end customer the order is for. Nullable so a draft can be
     *  started before the client is decided. */
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),

    /** PS team member who submitted the request. */
    submittedByMembershipId: uuid("submitted_by_membership_id").references(
      () => memberships.id,
      { onDelete: "set null" },
    ),
    /** Procurement team member who took ownership. Optional — used for
     *  routing follow-ups. */
    procurementOwnerMembershipId: uuid(
      "procurement_owner_membership_id",
    ).references(() => memberships.id, { onDelete: "set null" }),

    neededByDate: timestamp("needed_by_date", { withTimezone: true }),

    /* ---- Procurement-side identifiers ---------------------------------- */
    purchaseOrderNumber: text("purchase_order_number"),
    salesOrderNumber: text("sales_order_number"),
    invoiceNumber: text("invoice_number"),
    /** Vendor the order was placed with (the original supplier). Optional. */
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),

    /* ---- Client approval capture --------------------------------------- */
    /** How the approval was conveyed: in_app / phone / teams / email /
     *  in_person / other. */
    approvalMethod: text("approval_method"),
    approvalEvidence: text("approval_evidence"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** Free-form name of the client contact who approved. */
    approvedByName: text("approved_by_name"),
    approvedByEmail: text("approved_by_email"),

    /* ---- Shipping ------------------------------------------------------ */
    carrier: text("carrier"),
    trackingId: text("tracking_id"),
    trackingUrl: text("tracking_url"),
    /** Free-form ship-to (often the client's site, sometimes USI). */
    shipToAddress: text("ship_to_address"),
    /** Where the items should ultimately end up — e.g., "Reception desk,
     *  hand to Sarah Smith". */
    shipToContact: text("ship_to_contact"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),

    /* ---- Configuration & completion ----------------------------------- */
    /** Summary of what configuration / setup was done by PS. Drives the
     *  customer-facing completion doc. */
    configurationSummary: text("configuration_summary"),
    completionNotes: text("completion_notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    /* ---- Totals (cached aggregate from lines) -------------------------- */
    estimatedTotalCents: integer("estimated_total_cents"),

    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index("it_orders_org_idx").on(t.organizationId),
    statusIdx: index("it_orders_status_idx").on(t.status),
    clientIdx: index("it_orders_client_idx").on(t.clientId),
    refCodeUq: uniqueIndex("it_orders_ref_code_uq").on(
      t.organizationId,
      t.refCode,
    ),
  }),
);

export const itOrdersRelations = relations(itOrders, ({ one, many }) => ({
  client: one(clients, {
    fields: [itOrders.clientId],
    references: [clients.id],
  }),
  vendor: one(vendors, {
    fields: [itOrders.vendorId],
    references: [vendors.id],
  }),
  lines: many(itOrderLines),
  attachments: many(itOrderAttachments),
  events: many(itOrderEvents),
}));

export type ItOrder = typeof itOrders.$inferSelect;
export type NewItOrder = typeof itOrders.$inferInsert;

/* ============================================================================
 * Lines — what's actually being ordered.
 * ========================================================================== */
export const itOrderLines = pgTable(
  "it_order_lines",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => itOrders.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    category: itOrderLineCategoryEnum("category").notNull().default("hardware"),
    description: text("description").notNull(),
    /** Manufacturer / vendor part number — Dell SKU, MS license SKU, etc. */
    sku: text("sku"),
    /** Per-line vendor override (when different lines come from different vendors). */
    vendorId: uuid("vendor_id").references(() => vendors.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents"),
    /** Cached — quantity × unitPriceCents (or null if either is null). */
    lineTotalCents: integer("line_total_cents"),
    /** How many of this line were actually received by procurement. */
    receivedQuantity: integer("received_quantity"),
    /** Serial numbers / asset tags captured during configuration. JSONB
     *  array of { serial, assetTag, hostname?, notes? } so it works for
     *  bulk lines (3 identical laptops → 3 serials). */
    serials: jsonb("serials")
      .$type<
        Array<{
          serial: string;
          assetTag?: string;
          hostname?: string;
          notes?: string;
        }>
      >()
      .notNull()
      .default([]),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => ({
    orderIdx: index("it_order_lines_order_idx").on(t.orderId),
  }),
);

export const itOrderLinesRelations = relations(itOrderLines, ({ one }) => ({
  order: one(itOrders, {
    fields: [itOrderLines.orderId],
    references: [itOrders.id],
  }),
  vendor: one(vendors, {
    fields: [itOrderLines.vendorId],
    references: [vendors.id],
  }),
}));

export type ItOrderLine = typeof itOrderLines.$inferSelect;
export type NewItOrderLine = typeof itOrderLines.$inferInsert;

/* ============================================================================
 * Attachments — quotes, POs, invoices, packing slips, approval evidence.
 * ========================================================================== */
export const itOrderAttachments = pgTable(
  "it_order_attachments",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => itOrders.id, { onDelete: "cascade" }),
    kind: itOrderAttachmentKindEnum("kind").notNull().default("other"),
    label: text("label").notNull(),
    url: text("url"),
    filename: text("filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    notes: text("notes"),
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
    orderIdx: index("it_order_attachments_order_idx").on(t.orderId),
  }),
);

export type ItOrderAttachment = typeof itOrderAttachments.$inferSelect;
export type NewItOrderAttachment = typeof itOrderAttachments.$inferInsert;

/* ============================================================================
 * Audit trail.
 * ========================================================================== */
export const itOrderEvents = pgTable(
  "it_order_events",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => itOrders.id, { onDelete: "cascade" }),
    kind: itOrderEventKindEnum("kind").notNull(),
    /** Human-readable line. */
    text: text("text").notNull(),
    /** Structured payload — e.g., { from, to } for status_change,
     *  { channel, to, subject } for notification_sent. */
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    byMembershipId: uuid("by_membership_id").references(() => memberships.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => ({
    orderIdx: index("it_order_events_order_idx").on(t.orderId),
  }),
);

export type ItOrderEvent = typeof itOrderEvents.$inferSelect;
export type NewItOrderEvent = typeof itOrderEvents.$inferInsert;

/* ============================================================================
 * Labels — used by both UI and DOCX exports.
 * ========================================================================== */
export const IT_ORDER_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted to procurement",
  quoted: "Quote received",
  quote_sent_to_client: "Sent to client for approval",
  client_approved: "Client approved",
  ordered: "Ordered (PO placed)",
  received: "Received by procurement",
  being_configured: "Being configured by PS",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  complete: "Complete",
  cancelled: "Cancelled",
};

export const IT_ORDER_LINE_CATEGORY_LABEL: Record<string, string> = {
  hardware: "Hardware",
  software: "Software",
  peripheral: "Peripheral",
  service: "Service",
  subscription: "Subscription",
  consumable: "Consumable",
  other: "Other",
};

export const IT_ORDER_ATTACHMENT_KIND_LABEL: Record<string, string> = {
  quote: "Quote",
  sales_order: "Sales order",
  purchase_order: "Purchase order",
  invoice: "Invoice",
  packing_slip: "Packing slip",
  approval_evidence: "Client approval evidence",
  configuration_notes: "Configuration notes",
  completion_evidence: "Completion evidence",
  other: "Other",
};
