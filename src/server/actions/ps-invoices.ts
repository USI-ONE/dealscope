"use server";

/**
 * Server actions for PS-style monthly invoice generation.
 *
 *   previewPsInvoice  — read-only, returns the line preview (with the
 *                       operator's per-location overrides applied) for
 *                       the new-invoice page to show before commit.
 *   generatePsInvoice — persists the draft into invoices + invoice_lines.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  generatePsMonthlyInvoice,
  previewPsMonthlyInvoice,
} from "@/lib/invoices/ps-monthly-orchestrator";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const PRODUCT_KEYS = [
  "compute_node",
  "bitdefender_secure_plus",
  "liongard",
  "titanhq_plus",
  "syncro_remote",
] as const;

// Per-(location × product) override map. Zod's record with enum keys
// + value type covers the shape; `.partial()` on records was removed
// in Zod v3 — we accept any subset because the enum key is already
// constrained.
const overrideSchema = z.record(
  z.string(), // locationId
  z.record(z.enum(PRODUCT_KEYS), z.number().int().nonnegative()),
);

const baseSchema = z.object({
  clientId: z.string().uuid(),
  yyyymm: z.string().regex(/^\d{4}-\d{2}$/),
  perLocationOverrides: overrideSchema.optional(),
  syncroRemoteContacts: z.number().int().nonnegative().default(0),
});

export const previewPsInvoice = authedAction
  .schema(baseSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const draft = await previewPsMonthlyInvoice({
      organizationId: ctx.organization.id,
      clientId: parsedInput.clientId,
      yyyymm: parsedInput.yyyymm,
      perLocationOverrides: parsedInput.perLocationOverrides,
      syncroRemoteContacts: parsedInput.syncroRemoteContacts,
    });
    return { draft };
  });

export const generatePsInvoice = authedAction
  .schema(baseSchema.extend({ replace: z.boolean().default(false) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");
    const result = await generatePsMonthlyInvoice({
      organizationId: ctx.organization.id,
      clientId: parsedInput.clientId,
      yyyymm: parsedInput.yyyymm,
      perLocationOverrides: parsedInput.perLocationOverrides,
      syncroRemoteContacts: parsedInput.syncroRemoteContacts,
      generatedByMembershipId: ctx.membership.id,
      replace: parsedInput.replace,
    });
    if (result.created) {
      revalidatePath("/finance/invoices");
      revalidatePath(`/finance/invoices/${result.invoiceId}`);
      revalidatePath(`/clients/${parsedInput.clientId}`);
      return {
        ok: true as const,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        totalCents: result.totalCents,
      };
    }
    if (result.reason === "already_exists") {
      throw new PublicError(
        "An invoice already exists for this client + month. Use the 'Replace existing' option to void it and re-generate.",
      );
    }
    throw new PublicError(
      "Nothing to bill — no active compute nodes at any location for this client.",
    );
  });
