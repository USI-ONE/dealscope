"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  billables,
  clients,
  vendorBillLines,
  vendorBills,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { generateMonthlyBillablesFromSnapshots } from "@/lib/billing/generate-from-snapshots";

/* ============================================================================
 * VENDOR BILLS
 * Finance-only — `bill` resource. Used to record amounts USI pays to vendors
 * on behalf of clients. Each bill has line items; lines are allocated to one
 * or more clients via `allocateBillLineToClient`, which creates `billables`.
 * ========================================================================== */

const billStatusSchema = z.enum([
  "received",
  "approved",
  "paid",
  "disputed",
  "void",
]);

const createBillSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNumber: z.string().max(120).optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  receivedAt: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  subtotalCents: z.number().int().nonnegative().default(0),
  taxCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int().nonnegative().default(0),
  status: billStatusSchema.default("received"),
  notes: z.string().max(20000).optional().nullable(),
});

export const createVendorBill = authedAction
  .schema(createBillSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "bill");
    const [created] = await db
      .insert(vendorBills)
      .values({
        organizationId: ctx.organization.id,
        vendorId: parsedInput.vendorId,
        invoiceNumber: parsedInput.invoiceNumber?.trim() || null,
        periodStart: parsedInput.periodStart || null,
        periodEnd: parsedInput.periodEnd || null,
        receivedAt: parsedInput.receivedAt || null,
        dueAt: parsedInput.dueAt || null,
        paidAt: parsedInput.paidAt || null,
        subtotalCents: parsedInput.subtotalCents,
        taxCents: parsedInput.taxCents,
        totalCents: parsedInput.totalCents,
        status: parsedInput.status,
        notes: parsedInput.notes?.trim() || null,
        uploadedByMembershipId: ctx.membership.id,
      })
      .returning();
    revalidatePath("/finance/bills");
    return { bill: created };
  });

export const updateVendorBill = authedAction
  .schema(createBillSchema.partial().extend({ billId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "bill");
    const existing = await db.query.vendorBills.findFirst({
      where: and(
        eq(vendorBills.id, parsedInput.billId),
        eq(vendorBills.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Bill not found");

    await db
      .update(vendorBills)
      .set({
        vendorId: parsedInput.vendorId ?? existing.vendorId,
        invoiceNumber:
          parsedInput.invoiceNumber !== undefined
            ? parsedInput.invoiceNumber?.trim() || null
            : existing.invoiceNumber,
        periodStart:
          parsedInput.periodStart !== undefined
            ? parsedInput.periodStart || null
            : existing.periodStart,
        periodEnd:
          parsedInput.periodEnd !== undefined
            ? parsedInput.periodEnd || null
            : existing.periodEnd,
        receivedAt:
          parsedInput.receivedAt !== undefined
            ? parsedInput.receivedAt || null
            : existing.receivedAt,
        dueAt:
          parsedInput.dueAt !== undefined
            ? parsedInput.dueAt || null
            : existing.dueAt,
        paidAt:
          parsedInput.paidAt !== undefined
            ? parsedInput.paidAt || null
            : existing.paidAt,
        subtotalCents: parsedInput.subtotalCents ?? existing.subtotalCents,
        taxCents: parsedInput.taxCents ?? existing.taxCents,
        totalCents: parsedInput.totalCents ?? existing.totalCents,
        status: parsedInput.status ?? existing.status,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(vendorBills.id, parsedInput.billId));

    revalidatePath("/finance/bills");
    revalidatePath(`/finance/bills/${parsedInput.billId}`);
    return { ok: true };
  });

export const deleteVendorBill = authedAction
  .schema(z.object({ billId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "bill");
    await db
      .delete(vendorBills)
      .where(
        and(
          eq(vendorBills.id, parsedInput.billId),
          eq(vendorBills.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath("/finance/bills");
    return { ok: true };
  });

/* ============================================================================
 * VENDOR BILL LINE ITEMS
 * ========================================================================== */
const lineSchema = z.object({
  billId: z.string().uuid(),
  description: z.string().min(1).max(500),
  sku: z.string().max(120).optional().nullable(),
  quantity: z.number().int().nonnegative().optional().nullable(),
  unitCostCents: z.number().int().nonnegative().optional().nullable(),
  totalCents: z.number().int().nonnegative().default(0),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  /** Cost attribution — which client + site this line is for. */
  clientId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  matchedLicenseId: z.string().uuid().optional().nullable(),
  matchedServiceId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createBillLine = authedAction
  .schema(lineSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "bill");
    const bill = await db.query.vendorBills.findFirst({
      where: and(
        eq(vendorBills.id, parsedInput.billId),
        eq(vendorBills.organizationId, ctx.organization.id),
      ),
    });
    if (!bill) throw new PublicError("Bill not found");

    const [created] = await db
      .insert(vendorBillLines)
      .values({
        organizationId: ctx.organization.id,
        billId: parsedInput.billId,
        description: parsedInput.description.trim(),
        sku: parsedInput.sku?.trim() || null,
        quantity: parsedInput.quantity ?? null,
        unitCostCents: parsedInput.unitCostCents ?? null,
        totalCents: parsedInput.totalCents,
        periodStart: parsedInput.periodStart || null,
        periodEnd: parsedInput.periodEnd || null,
        clientId: parsedInput.clientId || null,
        locationId: parsedInput.locationId || null,
        matchedLicenseId: parsedInput.matchedLicenseId || null,
        matchedServiceId: parsedInput.matchedServiceId || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/finance/bills/${parsedInput.billId}`);
    return { line: created };
  });

export const updateBillLine = authedAction
  .schema(lineSchema.extend({ lineId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "bill");
    await db
      .update(vendorBillLines)
      .set({
        description: parsedInput.description.trim(),
        sku: parsedInput.sku?.trim() || null,
        quantity: parsedInput.quantity ?? null,
        unitCostCents: parsedInput.unitCostCents ?? null,
        totalCents: parsedInput.totalCents,
        periodStart: parsedInput.periodStart || null,
        periodEnd: parsedInput.periodEnd || null,
        clientId: parsedInput.clientId || null,
        locationId: parsedInput.locationId || null,
        matchedLicenseId: parsedInput.matchedLicenseId || null,
        matchedServiceId: parsedInput.matchedServiceId || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vendorBillLines.id, parsedInput.lineId),
          eq(vendorBillLines.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/finance/bills/${parsedInput.billId}`);
    return { ok: true };
  });

export const deleteBillLine = authedAction
  .schema(z.object({ lineId: z.string().uuid(), billId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "bill");
    await db
      .delete(vendorBillLines)
      .where(
        and(
          eq(vendorBillLines.id, parsedInput.lineId),
          eq(vendorBillLines.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/finance/bills/${parsedInput.billId}`);
    return { ok: true };
  });

/* ============================================================================
 * ALLOCATE A BILL LINE TO A CLIENT (creates a billable row)
 * ========================================================================== */
const allocateSchema = z.object({
  lineId: z.string().uuid(),
  billId: z.string().uuid(),
  clientId: z.string().uuid(),
  description: z.string().max(500).optional().nullable(),
  costBasisCents: z.number().int().nonnegative(),
  markupPct: z.number().int().min(-100).max(10000).default(20),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  quantity: z.number().int().nonnegative().optional().nullable(),
});

export const allocateBillLineToClient = authedAction
  .schema(allocateSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "billable");
    const line = await db.query.vendorBillLines.findFirst({
      where: and(
        eq(vendorBillLines.id, parsedInput.lineId),
        eq(vendorBillLines.organizationId, ctx.organization.id),
      ),
    });
    if (!line) throw new PublicError("Bill line not found");

    const cost = parsedInput.costBasisCents;
    const markupCents = Math.round((cost * parsedInput.markupPct) / 100);
    const rebillCents = cost + markupCents;

    const [created] = await db
      .insert(billables)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        vendorBillLineId: parsedInput.lineId,
        licenseId: line.matchedLicenseId,
        serviceId: line.matchedServiceId,
        description: parsedInput.description?.trim() || line.description,
        periodStart: parsedInput.periodStart || line.periodStart || null,
        periodEnd: parsedInput.periodEnd || line.periodEnd || null,
        quantity: parsedInput.quantity ?? line.quantity ?? null,
        costBasisCents: cost,
        markupPct: parsedInput.markupPct,
        markupCents,
        rebillCents,
        status: "draft",
      })
      .returning();

    revalidatePath(`/finance/bills/${parsedInput.billId}`);
    revalidatePath("/finance/billables");
    revalidatePath(`/clients/${parsedInput.clientId}/billing`);
    return { billable: created };
  });

/* ============================================================================
 * BILLABLES (the rebill ledger)
 * ========================================================================== */
const billableStatusSchema = z.enum([
  "draft",
  "approved",
  "billed",
  "paid",
  "voided",
]);

const updateBillableSchema = z.object({
  billableId: z.string().uuid(),
  description: z.string().min(1).max(500).optional(),
  costBasisCents: z.number().int().nonnegative().optional(),
  markupPct: z.number().int().min(-100).max(10000).optional(),
  status: billableStatusSchema.optional(),
  invoiceReference: z.string().max(120).optional().nullable(),
  invoicedAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateBillable = authedAction
  .schema(updateBillableSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "billable");
    const existing = await db.query.billables.findFirst({
      where: and(
        eq(billables.id, parsedInput.billableId),
        eq(billables.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Billable not found");

    const cost = parsedInput.costBasisCents ?? existing.costBasisCents;
    const markupPct = parsedInput.markupPct ?? existing.markupPct;
    const markupCents = Math.round((cost * markupPct) / 100);
    const rebillCents = cost + markupCents;

    await db
      .update(billables)
      .set({
        description: parsedInput.description?.trim() ?? existing.description,
        costBasisCents: cost,
        markupPct,
        markupCents,
        rebillCents,
        status: parsedInput.status ?? existing.status,
        invoiceReference:
          parsedInput.invoiceReference !== undefined
            ? parsedInput.invoiceReference?.trim() || null
            : existing.invoiceReference,
        invoicedAt:
          parsedInput.invoicedAt !== undefined
            ? parsedInput.invoicedAt || null
            : existing.invoicedAt,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(billables.id, parsedInput.billableId));

    revalidatePath("/finance/billables");
    revalidatePath(`/clients/${existing.clientId}/billing`);
    return { ok: true };
  });

export const deleteBillable = authedAction
  .schema(z.object({ billableId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "billable");
    const existing = await db.query.billables.findFirst({
      where: and(
        eq(billables.id, parsedInput.billableId),
        eq(billables.organizationId, ctx.organization.id),
      ),
    });
    if (existing) {
      await db
        .delete(billables)
        .where(eq(billables.id, parsedInput.billableId));
      revalidatePath("/finance/billables");
      revalidatePath(`/clients/${existing.clientId}/billing`);
    }
    return { ok: true };
  });

/* ============================================================================
 * CLIENT CONTRACTED-SUPPORT FIELDS — per-tier rates + additional users.
 * Owner/exec/finance-access-only.
 * ========================================================================== */
const supportSchema = z.object({
  clientId: z.string().uuid(),
  supportBaselineCents: z.number().int().nonnegative().nullable(),
  supportRateFullComputeCents: z.number().int().nonnegative().nullable(),
  supportRateKioskCents: z.number().int().nonnegative().nullable(),
  supportRateVmCents: z.number().int().nonnegative().nullable(),
  supportRateManagedMobileCents: z.number().int().nonnegative().nullable(),
  supportRateAdditionalUserCents: z.number().int().nonnegative().nullable(),
  additionalUserCount: z.number().int().nonnegative().default(0),
});

export const updateClientContractedSupport = authedAction
  .schema(supportSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const existing = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Client not found");

    await db
      .update(clients)
      .set({
        supportBaselineCents: parsedInput.supportBaselineCents,
        supportRateFullComputeCents: parsedInput.supportRateFullComputeCents,
        supportRateKioskCents: parsedInput.supportRateKioskCents,
        supportRateVmCents: parsedInput.supportRateVmCents,
        supportRateManagedMobileCents: parsedInput.supportRateManagedMobileCents,
        supportRateAdditionalUserCents: parsedInput.supportRateAdditionalUserCents,
        additionalUserCount: parsedInput.additionalUserCount,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, parsedInput.clientId));

    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath(`/clients/${parsedInput.clientId}/billing`);
    return { ok: true };
  });

/* ============================================================================
 * CLIENT REBILL RATES — per-third-party-product unit prices used by the
 * PS monthly invoice generator. NULL on any field = fall back to the
 * template default in src/lib/invoices/ps-product-templates.ts.
 * Finance only.
 * ========================================================================== */
const rebillRatesSchema = z.object({
  clientId: z.string().uuid(),
  rebillRateBitdefenderCents: z.number().int().nonnegative().nullable(),
  rebillRateLiongardCents: z.number().int().nonnegative().nullable(),
  rebillRateTitanhqCents: z.number().int().nonnegative().nullable(),
  rebillRateSyncroRemoteCents: z.number().int().nonnegative().nullable(),
});

export const updateClientRebillRates = authedAction
  .schema(rebillRatesSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const existing = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Client not found");

    await db
      .update(clients)
      .set({
        rebillRateBitdefenderCents: parsedInput.rebillRateBitdefenderCents,
        rebillRateLiongardCents: parsedInput.rebillRateLiongardCents,
        rebillRateTitanhqCents: parsedInput.rebillRateTitanhqCents,
        rebillRateSyncroRemoteCents: parsedInput.rebillRateSyncroRemoteCents,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, parsedInput.clientId));

    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath(`/clients/${parsedInput.clientId}/billing`);
    return { ok: true };
  });

/* ============================================================================
 * generateBillablesFromSnapshots
 * Auto-create draft billables from the latest vendor seat snapshots for a
 * given period. Idempotent — skips license × period combos that already
 * have a non-voided billable row.
 * ========================================================================== */

const generateBillablesSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dryRun: z.boolean().default(false),
});

export const generateBillablesFromSnapshots = authedAction
  .schema(generateBillablesSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const rows = await generateMonthlyBillablesFromSnapshots({
      organizationId: ctx.organization.id,
      periodStart: parsedInput.periodStart,
      periodEnd: parsedInput.periodEnd,
      dryRun: parsedInput.dryRun,
    });
    if (!parsedInput.dryRun) {
      revalidatePath("/finance/billables");
      revalidatePath("/finance/reconciliation");
    }
    return {
      rows,
      created: rows.filter((r) => r.billableId).length,
      skipped: rows.filter((r) => r.skippedExisting).length,
      totalRebillCents: rows
        .filter((r) => !r.skippedExisting)
        .reduce((sum, r) => sum + r.rebillTotalCents, 0),
    };
  });

