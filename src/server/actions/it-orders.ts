"use server";

/**
 * IT Ordering workflow actions.
 *
 * Status machine (allowed forward transitions):
 *   draft → submitted → quoted → quote_sent_to_client →
 *   client_approved → ordered → received → being_configured →
 *   ready_to_ship → shipped → delivered → complete
 *   * → cancelled (any time before complete)
 *
 * "Notification sent" is captured as an audit event whenever the user
 * clicks one of the mailto: notify buttons. The action records the
 * intent + transitions status; the actual email goes out via the user's
 * own mail client.
 */
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clients,
  itOrderAttachments,
  itOrderEvents,
  itOrderLines,
  itOrders,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { buildHardwareInvoiceFromOrder } from "@/lib/invoices/generate";

async function loadOrder(id: string, organizationId: string) {
  const o = await db.query.itOrders.findFirst({
    where: and(
      eq(itOrders.id, id),
      eq(itOrders.organizationId, organizationId),
    ),
  });
  if (!o) throw new PublicError("Order not found");
  return o;
}

async function nextRefCode(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  const [{ count } = { count: 0 }] = await db
    .select({
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(itOrders)
    .where(
      and(
        eq(itOrders.organizationId, organizationId),
        sql`${itOrders.refCode} LIKE ${prefix + "%"}`,
      ),
    );
  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
}

async function recordEvent(
  orderId: string,
  organizationId: string,
  byMembershipId: string,
  kind:
    | "status_change"
    | "comment"
    | "notification_sent"
    | "file_attached"
    | "approval_recorded",
  text: string,
  payload: Record<string, unknown> = {},
) {
  await db.insert(itOrderEvents).values({
    organizationId,
    orderId,
    kind,
    text,
    payload,
    byMembershipId,
    occurredAt: new Date(),
  });
}

async function recalcOrderTotal(orderId: string) {
  const lines = await db
    .select({
      lineTotalCents: itOrderLines.lineTotalCents,
    })
    .from(itOrderLines)
    .where(eq(itOrderLines.orderId, orderId));
  const total = lines.reduce((s, l) => s + (l.lineTotalCents ?? 0), 0);
  await db
    .update(itOrders)
    .set({ estimatedTotalCents: total, updatedAt: new Date() })
    .where(eq(itOrders.id, orderId));
}

/* ============================================================================
 * CREATE / UPDATE
 * ========================================================================== */
const baseSchema = z.object({
  title: z.string().min(2).max(300),
  summary: z.string().max(20_000).optional().nullable(),
  businessJustification: z.string().max(20_000).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  procurementOwnerMembershipId: z.string().uuid().optional().nullable(),
  neededByDate: z.string().optional().nullable(),
  shipToAddress: z.string().max(2_000).optional().nullable(),
  shipToContact: z.string().max(500).optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  notes: z.string().max(50_000).optional().nullable(),
});

export const createItOrder = authedAction
  .schema(baseSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    if (parsedInput.clientId) {
      const c = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      });
      if (!c) throw new PublicError("Client not found");
    }
    const refCode = await nextRefCode(ctx.organization.id);
    const [created] = await db
      .insert(itOrders)
      .values({
        organizationId: ctx.organization.id,
        refCode,
        title: parsedInput.title.trim(),
        summary: parsedInput.summary?.trim() || null,
        businessJustification:
          parsedInput.businessJustification?.trim() || null,
        clientId: parsedInput.clientId ?? null,
        submittedByMembershipId: ctx.membership.id,
        procurementOwnerMembershipId:
          parsedInput.procurementOwnerMembershipId ?? null,
        neededByDate: parsedInput.neededByDate
          ? new Date(parsedInput.neededByDate)
          : null,
        shipToAddress: parsedInput.shipToAddress?.trim() || null,
        shipToContact: parsedInput.shipToContact?.trim() || null,
        vendorId: parsedInput.vendorId ?? null,
        notes: parsedInput.notes?.trim() || null,
        status: "draft",
      })
      .returning();
    await recordEvent(
      created.id,
      ctx.organization.id,
      ctx.membership.id,
      "status_change",
      `Order created in draft`,
      { from: null, to: "draft" },
    );
    revalidatePath("/orders");
    return { order: created };
  });

export const updateItOrder = authedAction
  .schema(baseSchema.partial().extend({ orderId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    if (o.status === "complete" || o.status === "cancelled") {
      throw new PublicError(
        `Cannot edit a ${o.status} order. Open a new one instead.`,
      );
    }
    await db
      .update(itOrders)
      .set({
        title: parsedInput.title?.trim() ?? o.title,
        summary:
          parsedInput.summary !== undefined
            ? parsedInput.summary?.trim() || null
            : o.summary,
        businessJustification:
          parsedInput.businessJustification !== undefined
            ? parsedInput.businessJustification?.trim() || null
            : o.businessJustification,
        clientId:
          parsedInput.clientId !== undefined ? parsedInput.clientId : o.clientId,
        procurementOwnerMembershipId:
          parsedInput.procurementOwnerMembershipId !== undefined
            ? parsedInput.procurementOwnerMembershipId
            : o.procurementOwnerMembershipId,
        neededByDate:
          parsedInput.neededByDate !== undefined
            ? parsedInput.neededByDate
              ? new Date(parsedInput.neededByDate)
              : null
            : o.neededByDate,
        shipToAddress:
          parsedInput.shipToAddress !== undefined
            ? parsedInput.shipToAddress?.trim() || null
            : o.shipToAddress,
        shipToContact:
          parsedInput.shipToContact !== undefined
            ? parsedInput.shipToContact?.trim() || null
            : o.shipToContact,
        vendorId:
          parsedInput.vendorId !== undefined ? parsedInput.vendorId : o.vendorId,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : o.notes,
        updatedAt: new Date(),
      })
      .where(eq(itOrders.id, o.id));
    revalidatePath(`/orders/${o.id}`);
    revalidatePath("/orders");
    return { ok: true };
  });

/* ============================================================================
 * LINES
 * ========================================================================== */
const lineSchema = z.object({
  orderId: z.string().uuid(),
  category: z
    .enum([
      "hardware",
      "software",
      "peripheral",
      "service",
      "subscription",
      "consumable",
      "other",
    ])
    .default("hardware"),
  description: z.string().min(1).max(500),
  sku: z.string().max(120).optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).max(100_000).default(1),
  unitPriceCents: z.number().int().min(0).optional().nullable(),
  receivedQuantity: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
});

export const addItOrderLine = authedAction
  .schema(lineSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    const siblings = await db
      .select({ position: itOrderLines.position })
      .from(itOrderLines)
      .where(eq(itOrderLines.orderId, o.id));
    const nextPos = siblings.reduce((m, s) => Math.max(m, s.position), -1) + 1;
    const lineTotal =
      parsedInput.unitPriceCents != null
        ? parsedInput.unitPriceCents * parsedInput.quantity
        : null;
    const [created] = await db
      .insert(itOrderLines)
      .values({
        organizationId: ctx.organization.id,
        orderId: o.id,
        position: nextPos,
        category: parsedInput.category,
        description: parsedInput.description.trim(),
        sku: parsedInput.sku?.trim() || null,
        vendorId: parsedInput.vendorId ?? null,
        quantity: parsedInput.quantity,
        unitPriceCents: parsedInput.unitPriceCents ?? null,
        lineTotalCents: lineTotal,
        receivedQuantity: parsedInput.receivedQuantity ?? null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    await recalcOrderTotal(o.id);
    revalidatePath(`/orders/${o.id}`);
    return { line: created };
  });

export const updateItOrderLine = authedAction
  .schema(
    lineSchema
      .partial()
      .extend({
        lineId: z.string().uuid(),
        orderId: z.string().uuid(),
        serials: z
          .array(
            z.object({
              serial: z.string().max(200),
              assetTag: z.string().max(120).optional(),
              hostname: z.string().max(200).optional(),
              notes: z.string().max(2_000).optional(),
            }),
          )
          .max(500)
          .optional(),
      }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    const line = await db.query.itOrderLines.findFirst({
      where: and(
        eq(itOrderLines.id, parsedInput.lineId),
        eq(itOrderLines.orderId, o.id),
      ),
    });
    if (!line) throw new PublicError("Line not found");
    const nextQty = parsedInput.quantity ?? line.quantity;
    const nextUnitPrice =
      parsedInput.unitPriceCents !== undefined
        ? parsedInput.unitPriceCents
        : line.unitPriceCents;
    const lineTotal = nextUnitPrice != null ? nextUnitPrice * nextQty : null;
    await db
      .update(itOrderLines)
      .set({
        category: parsedInput.category ?? line.category,
        description: parsedInput.description?.trim() ?? line.description,
        sku:
          parsedInput.sku !== undefined
            ? parsedInput.sku?.trim() || null
            : line.sku,
        vendorId:
          parsedInput.vendorId !== undefined
            ? parsedInput.vendorId
            : line.vendorId,
        quantity: nextQty,
        unitPriceCents: nextUnitPrice,
        lineTotalCents: lineTotal,
        receivedQuantity:
          parsedInput.receivedQuantity !== undefined
            ? parsedInput.receivedQuantity
            : line.receivedQuantity,
        serials: parsedInput.serials ?? line.serials,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : line.notes,
        updatedAt: new Date(),
      })
      .where(eq(itOrderLines.id, line.id));
    await recalcOrderTotal(o.id);
    revalidatePath(`/orders/${o.id}`);
    return { ok: true };
  });

export const deleteItOrderLine = authedAction
  .schema(z.object({ lineId: z.string().uuid(), orderId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    await db
      .delete(itOrderLines)
      .where(
        and(
          eq(itOrderLines.id, parsedInput.lineId),
          eq(itOrderLines.orderId, o.id),
        ),
      );
    await recalcOrderTotal(o.id);
    revalidatePath(`/orders/${o.id}`);
    return { ok: true };
  });

/* ============================================================================
 * ATTACHMENTS
 * ========================================================================== */
const attachmentSchema = z.object({
  orderId: z.string().uuid(),
  kind: z
    .enum([
      "quote",
      "sales_order",
      "purchase_order",
      "invoice",
      "packing_slip",
      "approval_evidence",
      "configuration_notes",
      "completion_evidence",
      "other",
    ])
    .default("other"),
  label: z.string().min(1).max(300),
  url: z.string().max(2_000).optional().nullable(),
  filename: z.string().max(300).optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
});

export const addItOrderAttachment = authedAction
  .schema(attachmentSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    const [created] = await db
      .insert(itOrderAttachments)
      .values({
        organizationId: ctx.organization.id,
        orderId: o.id,
        kind: parsedInput.kind,
        label: parsedInput.label.trim(),
        url: parsedInput.url?.trim() || null,
        filename: parsedInput.filename?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        uploadedByMembershipId: ctx.membership.id,
        uploadedAt: new Date(),
      })
      .returning();
    await recordEvent(
      o.id,
      ctx.organization.id,
      ctx.membership.id,
      "file_attached",
      `Added ${parsedInput.kind.replace(/_/g, " ")}: ${created.label}`,
      { attachmentId: created.id, kind: parsedInput.kind },
    );
    revalidatePath(`/orders/${o.id}`);
    return { attachment: created };
  });

export const removeItOrderAttachment = authedAction
  .schema(z.object({ attachmentId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const att = await db.query.itOrderAttachments.findFirst({
      where: and(
        eq(itOrderAttachments.id, parsedInput.attachmentId),
        eq(itOrderAttachments.organizationId, ctx.organization.id),
      ),
    });
    if (!att) throw new PublicError("Attachment not found");
    await db
      .delete(itOrderAttachments)
      .where(eq(itOrderAttachments.id, att.id));
    revalidatePath(`/orders/${att.orderId}`);
    return { ok: true };
  });

/* ============================================================================
 * STATUS TRANSITIONS
 * ========================================================================== */
type Status =
  | "draft"
  | "submitted"
  | "quoted"
  | "quote_sent_to_client"
  | "client_approved"
  | "ordered"
  | "received"
  | "being_configured"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "complete"
  | "cancelled";

const ALLOWED: Record<Status, Status[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["quoted", "cancelled"],
  quoted: ["quote_sent_to_client", "cancelled"],
  quote_sent_to_client: ["client_approved", "cancelled"],
  client_approved: ["ordered", "cancelled"],
  ordered: ["received", "cancelled"],
  received: ["being_configured", "cancelled"],
  being_configured: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["complete"],
  complete: [],
  cancelled: [],
};

export const transitionItOrderStatus = authedAction
  .schema(
    z.object({
      orderId: z.string().uuid(),
      to: z.enum([
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
      ]),
      reason: z.string().max(2_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    const allowed = ALLOWED[o.status as Status] ?? [];
    if (!allowed.includes(parsedInput.to)) {
      throw new PublicError(
        `Can't move "${o.status}" → "${parsedInput.to}". Allowed: ${allowed.join(", ") || "(none)"}`,
      );
    }
    const now = new Date();
    const updates: Record<string, unknown> = {
      status: parsedInput.to,
      updatedAt: now,
    };
    if (parsedInput.to === "shipped") updates.shippedAt = now;
    if (parsedInput.to === "delivered") updates.deliveredAt = now;
    if (parsedInput.to === "complete") updates.completedAt = now;
    await db.update(itOrders).set(updates).where(eq(itOrders.id, o.id));
    await recordEvent(
      o.id,
      ctx.organization.id,
      ctx.membership.id,
      "status_change",
      `Status: ${o.status} → ${parsedInput.to}${parsedInput.reason ? ` — ${parsedInput.reason}` : ""}`,
      { from: o.status, to: parsedInput.to, reason: parsedInput.reason ?? null },
    );

    // Auto-generate a hardware invoice when the order ships. Idempotent
    // on (it_order_id, kind='hardware') — if an invoice already exists
    // for this order, this is a no-op. Failures are logged on the order
    // event timeline but don't block the status transition (the
    // bookkeeper can re-trigger via Finance → Invoices if needed).
    let invoiceNote: string | null = null;
    if (parsedInput.to === "shipped" && o.clientId) {
      try {
        const r = await buildHardwareInvoiceFromOrder(
          ctx.organization.id,
          o.id,
          { generatedByMembershipId: ctx.membership.id },
        );
        if (r.created && r.invoice) {
          invoiceNote = `Hardware invoice ${r.invoice.invoiceNumber} created as draft.`;
        } else if (r.invoice && r.skippedReason === "already_exists") {
          invoiceNote = `Hardware invoice ${r.invoice.invoiceNumber} already existed — left as-is.`;
        } else if (r.skippedReason === "no_lines") {
          invoiceNote = "Order has no line items — no invoice created.";
        }
      } catch (e) {
        invoiceNote = `Invoice generation failed: ${(e as Error).message.slice(0, 200)}`;
      }
      if (invoiceNote) {
        await recordEvent(
          o.id,
          ctx.organization.id,
          ctx.membership.id,
          "comment",
          invoiceNote,
          { source: "auto_invoice_on_ship" },
        );
      }
    }

    revalidatePath(`/orders/${o.id}`);
    revalidatePath("/orders");
    revalidatePath("/finance/invoices");
    return { ok: true, invoiceNote };
  });

/* ============================================================================
 * CLIENT APPROVAL CAPTURE
 * ========================================================================== */
export const recordItOrderClientApproval = authedAction
  .schema(
    z.object({
      orderId: z.string().uuid(),
      method: z.enum(["in_app", "phone", "teams", "email", "in_person", "other"]),
      evidence: z.string().max(20_000).optional().nullable(),
      approvedByName: z.string().max(200).optional().nullable(),
      approvedByEmail: z.string().email().max(320).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);

    if (
      parsedInput.method !== "in_app" &&
      !parsedInput.evidence?.trim()
    ) {
      throw new PublicError(
        "Out-of-band approvals need an evidence note (link to email, Teams message, or summary of the call).",
      );
    }

    const now = new Date();
    await db
      .update(itOrders)
      .set({
        approvalMethod: parsedInput.method,
        approvalEvidence: parsedInput.evidence?.trim() || null,
        approvedAt: now,
        approvedByName: parsedInput.approvedByName?.trim() || null,
        approvedByEmail: parsedInput.approvedByEmail?.trim() || null,
        updatedAt: now,
      })
      .where(eq(itOrders.id, o.id));
    await recordEvent(
      o.id,
      ctx.organization.id,
      ctx.membership.id,
      "approval_recorded",
      `Client approval recorded via ${parsedInput.method}${parsedInput.approvedByName ? ` from ${parsedInput.approvedByName}` : ""}`,
      {
        method: parsedInput.method,
        evidence: parsedInput.evidence ?? null,
        approvedByName: parsedInput.approvedByName ?? null,
        approvedByEmail: parsedInput.approvedByEmail ?? null,
      },
    );
    // Auto-advance if currently in quote_sent_to_client.
    if (o.status === "quote_sent_to_client") {
      await db
        .update(itOrders)
        .set({ status: "client_approved", updatedAt: now })
        .where(eq(itOrders.id, o.id));
      await recordEvent(
        o.id,
        ctx.organization.id,
        ctx.membership.id,
        "status_change",
        `Status: quote_sent_to_client → client_approved (auto on approval recorded)`,
        { from: "quote_sent_to_client", to: "client_approved" },
      );
    }
    revalidatePath(`/orders/${o.id}`);
    return { ok: true };
  });

/* ============================================================================
 * SHIPPING DETAILS
 * ========================================================================== */
export const recordItOrderShipping = authedAction
  .schema(
    z.object({
      orderId: z.string().uuid(),
      carrier: z.string().max(120).optional().nullable(),
      trackingId: z.string().max(200).optional().nullable(),
      trackingUrl: z.string().max(2_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    await db
      .update(itOrders)
      .set({
        carrier: parsedInput.carrier?.trim() || null,
        trackingId: parsedInput.trackingId?.trim() || null,
        trackingUrl: parsedInput.trackingUrl?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(itOrders.id, o.id));
    await recordEvent(
      o.id,
      ctx.organization.id,
      ctx.membership.id,
      "comment",
      `Shipping updated: ${[parsedInput.carrier, parsedInput.trackingId].filter(Boolean).join(" ") || "(cleared)"}`,
      { carrier: parsedInput.carrier, trackingId: parsedInput.trackingId },
    );
    revalidatePath(`/orders/${o.id}`);
    return { ok: true };
  });

/* ============================================================================
 * COMMENT / NOTIFICATION RECORDING
 * ========================================================================== */
export const addItOrderComment = authedAction
  .schema(
    z.object({
      orderId: z.string().uuid(),
      text: z.string().min(1).max(10_000),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    await recordEvent(
      o.id,
      ctx.organization.id,
      ctx.membership.id,
      "comment",
      parsedInput.text.trim(),
    );
    revalidatePath(`/orders/${o.id}`);
    return { ok: true };
  });

export const recordItOrderNotification = authedAction
  .schema(
    z.object({
      orderId: z.string().uuid(),
      channel: z.enum(["email", "teams", "phone", "in_person", "other"]),
      recipient: z.string().max(500),
      subject: z.string().max(500).optional().nullable(),
      autoAdvanceTo: z
        .enum([
          "submitted",
          "quote_sent_to_client",
          "ordered",
          "complete",
        ])
        .optional()
        .nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    await recordEvent(
      o.id,
      ctx.organization.id,
      ctx.membership.id,
      "notification_sent",
      `Notification sent via ${parsedInput.channel} to ${parsedInput.recipient}${parsedInput.subject ? ` — "${parsedInput.subject}"` : ""}`,
      {
        channel: parsedInput.channel,
        recipient: parsedInput.recipient,
        subject: parsedInput.subject ?? null,
      },
    );
    // Optionally advance status on notification — used to keep status
    // and "I told them" in sync.
    if (parsedInput.autoAdvanceTo) {
      const allowed = ALLOWED[o.status as Status] ?? [];
      if (allowed.includes(parsedInput.autoAdvanceTo)) {
        const now = new Date();
        const updates: Record<string, unknown> = {
          status: parsedInput.autoAdvanceTo,
          updatedAt: now,
        };
        if (parsedInput.autoAdvanceTo === "complete") updates.completedAt = now;
        await db.update(itOrders).set(updates).where(eq(itOrders.id, o.id));
        await recordEvent(
          o.id,
          ctx.organization.id,
          ctx.membership.id,
          "status_change",
          `Status: ${o.status} → ${parsedInput.autoAdvanceTo} (auto on notification)`,
          { from: o.status, to: parsedInput.autoAdvanceTo },
        );
      }
    }
    revalidatePath(`/orders/${o.id}`);
    return { ok: true };
  });

/* ============================================================================
 * SET CONFIGURATION SUMMARY (drives the completion doc).
 * ========================================================================== */
export const updateItOrderConfiguration = authedAction
  .schema(
    z.object({
      orderId: z.string().uuid(),
      configurationSummary: z.string().max(50_000).optional().nullable(),
      completionNotes: z.string().max(50_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    await db
      .update(itOrders)
      .set({
        configurationSummary:
          parsedInput.configurationSummary?.trim() || null,
        completionNotes: parsedInput.completionNotes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(itOrders.id, o.id));
    revalidatePath(`/orders/${o.id}`);
    return { ok: true };
  });

/* ============================================================================
 * DELETE — drafts only.
 * ========================================================================== */
export const deleteItOrder = authedAction
  .schema(z.object({ orderId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    const o = await loadOrder(parsedInput.orderId, ctx.organization.id);
    if (o.status !== "draft") {
      throw new PublicError(
        "Only drafts can be deleted. Cancel instead to preserve audit history.",
      );
    }
    await db.delete(itOrders).where(eq(itOrders.id, o.id));
    revalidatePath("/orders");
    return { ok: true };
  });

/* ============================================================================
 * READ HELPERS
 * ========================================================================== */
export async function listItOrders(organizationId: string) {
  return db
    .select()
    .from(itOrders)
    .where(eq(itOrders.organizationId, organizationId))
    .orderBy(desc(itOrders.createdAt));
}

export async function loadItOrderFull(
  orderId: string,
  organizationId: string,
) {
  const order = await db.query.itOrders.findFirst({
    where: and(
      eq(itOrders.id, orderId),
      eq(itOrders.organizationId, organizationId),
    ),
  });
  if (!order) return null;
  const [lines, attachments, events] = await Promise.all([
    db
      .select()
      .from(itOrderLines)
      .where(eq(itOrderLines.orderId, order.id))
      .orderBy(asc(itOrderLines.position)),
    db
      .select()
      .from(itOrderAttachments)
      .where(eq(itOrderAttachments.orderId, order.id))
      .orderBy(desc(itOrderAttachments.uploadedAt)),
    db
      .select()
      .from(itOrderEvents)
      .where(eq(itOrderEvents.orderId, order.id))
      .orderBy(desc(itOrderEvents.occurredAt)),
  ]);
  return { order, lines, attachments, events };
}
