"use server";

/**
 * Invoice lifecycle server actions.
 *
 *   runMonthlyInvoiceBatch(ym)     one-click batch — generates one
 *                                  monthly_contract invoice per active
 *                                  client. Idempotent.
 *   markInvoiceSent(invoiceId)     draft → sent (sets sent_at)
 *   markInvoicePaid(invoiceId)     sent → paid  (sets paid_at)
 *   voidInvoice(invoiceId, reason) any non-paid → void (frees the
 *                                  client+period slot so it can be
 *                                  regenerated)
 *   regenerateInvoice(invoiceId)   shortcut: void + rebuild for the
 *                                  same (client, period)
 *
 * All actions are gated to finance access.
 */
import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, invoices } from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { canCtx } from "@/lib/auth-helpers";
import {
  buildHardwareInvoiceFromOrder,
  buildMonthlyContractInvoice,
} from "@/lib/invoices/generate";

const ymSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM");

/* ============================================================================
 * BATCH GENERATION
 * ========================================================================== */
export const runMonthlyInvoiceBatch = authedAction
  .schema(z.object({ month: ymSchema }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    if (!canCtx("read", "finance", ctx)) {
      throw new PublicError("Finance access required.");
    }

    const activeClients = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(
        and(
          eq(clients.organizationId, ctx.organization.id),
          isNull(clients.archivedAt),
          eq(clients.status, "active"),
        ),
      )
      .orderBy(asc(clients.name));

    const outcomes: Array<{
      clientId: string;
      clientName: string;
      status:
        | "created"
        | "already_exists"
        | "no_lines"
        | "client_archived"
        | "error";
      invoiceId?: string;
      invoiceNumber?: string;
      totalCents?: number;
      message?: string;
    }> = [];

    for (const c of activeClients) {
      try {
        const r = await buildMonthlyContractInvoice(
          ctx.organization.id,
          c.id,
          parsedInput.month,
          { generatedByMembershipId: ctx.membership.id },
        );
        if (r.created && r.invoice) {
          outcomes.push({
            clientId: c.id,
            clientName: c.name,
            status: "created",
            invoiceId: r.invoice.id,
            invoiceNumber: r.invoice.invoiceNumber,
            totalCents: r.invoice.totalCents,
          });
        } else if (r.invoice && r.skippedReason === "already_exists") {
          outcomes.push({
            clientId: c.id,
            clientName: c.name,
            status: "already_exists",
            invoiceId: r.invoice.id,
            invoiceNumber: r.invoice.invoiceNumber,
            message: "Existing draft / sent invoice for this period left as-is.",
          });
        } else if (r.skippedReason === "no_lines") {
          outcomes.push({
            clientId: c.id,
            clientName: c.name,
            status: "no_lines",
            message:
              "No billable activity for this period (no support rates, no licenses, no services, no billables).",
          });
        } else if (r.skippedReason === "client_archived") {
          outcomes.push({
            clientId: c.id,
            clientName: c.name,
            status: "client_archived",
            message: "Client is archived — skipped.",
          });
        }
      } catch (e) {
        outcomes.push({
          clientId: c.id,
          clientName: c.name,
          status: "error",
          message: (e as Error).message.slice(0, 300),
        });
      }
    }

    const summary = {
      created: outcomes.filter((o) => o.status === "created").length,
      already_exists: outcomes.filter((o) => o.status === "already_exists").length,
      no_lines: outcomes.filter((o) => o.status === "no_lines").length,
      error: outcomes.filter((o) => o.status === "error").length,
    };
    revalidatePath("/finance/invoices");
    return { ok: true, month: parsedInput.month, outcomes, summary };
  });

/* ============================================================================
 * STATUS TRANSITIONS
 * ========================================================================== */
async function loadInvoice(invoiceId: string, organizationId: string) {
  const inv = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.id, invoiceId),
      eq(invoices.organizationId, organizationId),
    ),
  });
  if (!inv) throw new PublicError("Invoice not found.");
  return inv;
}

export const markInvoiceSent = authedAction
  .schema(z.object({ invoiceId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const inv = await loadInvoice(parsedInput.invoiceId, ctx.organization.id);
    if (inv.status !== "draft") {
      throw new PublicError(
        `Can only mark a draft invoice as sent — current status: ${inv.status}.`,
      );
    }
    await db
      .update(invoices)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(invoices.id, inv.id));
    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${inv.id}`);
    return { ok: true };
  });

export const markInvoicePaid = authedAction
  .schema(z.object({ invoiceId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const inv = await loadInvoice(parsedInput.invoiceId, ctx.organization.id);
    if (inv.status !== "sent" && inv.status !== "draft") {
      throw new PublicError(
        `Can only mark sent / draft as paid — current status: ${inv.status}.`,
      );
    }
    await db
      .update(invoices)
      .set({
        status: "paid",
        paidAt: new Date(),
        // If they paid a draft (skipping send), also stamp sentAt for
        // consistency.
        sentAt: inv.sentAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, inv.id));
    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${inv.id}`);
    return { ok: true };
  });

export const voidInvoice = authedAction
  .schema(
    z.object({
      invoiceId: z.string().uuid(),
      reason: z.string().min(1).max(2000),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const inv = await loadInvoice(parsedInput.invoiceId, ctx.organization.id);
    if (inv.status === "paid") {
      throw new PublicError(
        "Paid invoices can't be voided — issue a credit / correction instead.",
      );
    }
    if (inv.status === "void") {
      throw new PublicError("Invoice is already void.");
    }
    await db
      .update(invoices)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidReason: parsedInput.reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, inv.id));
    revalidatePath("/finance/invoices");
    revalidatePath(`/finance/invoices/${inv.id}`);
    return { ok: true };
  });

/**
 * Regenerate: void the existing (with a default reason) and rebuild
 * for the same (client, period). Returns the new invoice's id.
 */
export const regenerateInvoice = authedAction
  .schema(z.object({ invoiceId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const inv = await loadInvoice(parsedInput.invoiceId, ctx.organization.id);
    if (inv.status === "paid") {
      throw new PublicError("Paid invoices can't be regenerated.");
    }
    if (inv.kind !== "monthly_contract") {
      throw new PublicError(
        "Only monthly_contract invoices support one-click regenerate. For hardware invoices, void manually and re-ship the order.",
      );
    }
    if (!inv.periodStart) {
      throw new PublicError("Invoice has no period — cannot regenerate.");
    }
    // Void the existing.
    await db
      .update(invoices)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidReason: "Regenerated — superseded by a fresh build.",
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, inv.id));

    // Rebuild.
    const ym = inv.periodStart.slice(0, 7);
    const result = await buildMonthlyContractInvoice(
      ctx.organization.id,
      inv.clientId,
      ym,
      { generatedByMembershipId: ctx.membership.id },
    );
    revalidatePath("/finance/invoices");
    if (result.invoice) revalidatePath(`/finance/invoices/${result.invoice.id}`);
    return {
      ok: true,
      newInvoiceId: result.invoice?.id ?? null,
      newInvoiceNumber: result.invoice?.invoiceNumber ?? null,
    };
  });

/* ============================================================================
 * HARDWARE — manual entry point (auto-creation also happens in the
 * IT-order ship action; this is here for one-off cases).
 * ========================================================================== */
export const generateHardwareInvoice = authedAction
  .schema(z.object({ itOrderId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const r = await buildHardwareInvoiceFromOrder(
      ctx.organization.id,
      parsedInput.itOrderId,
      { generatedByMembershipId: ctx.membership.id },
    );
    revalidatePath("/finance/invoices");
    if (r.invoice) revalidatePath(`/finance/invoices/${r.invoice.id}`);
    return {
      ok: true,
      created: r.created,
      invoiceId: r.invoice?.id ?? null,
      invoiceNumber: r.invoice?.invoiceNumber ?? null,
      skippedReason: r.skippedReason,
    };
  });
