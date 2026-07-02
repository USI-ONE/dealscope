"use server";

/**
 * Batch monthly-invoice generator.
 *
 * The one-click endpoint behind /finance/invoices/batch. For a chosen
 * billing month + a chosen set of clientIds (typically "every READY
 * client" per the pre-flight), runs `generatePsMonthlyInvoice` for each
 * and returns a structured summary.
 *
 * Decisions encoded:
 *   - Skip-on-block: if a client somehow no longer qualifies as ready
 *     by the time the action fires (race with rate edits), we capture
 *     that as a skipped entry rather than failing the whole batch.
 *   - Sequential not parallel: each client touches the same `invoices`
 *     table and we want deterministic invoice number ordering. The
 *     per-client work is fast (<200ms) so a 21-client run is ~4s.
 *   - Idempotent: per-client orchestrator already refuses to double-bill
 *     a (client, period). The batch is safe to re-run after fixing a
 *     gap — already-invoiced clients show as skipped, not errors.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generatePsMonthlyInvoice } from "@/lib/invoices/ps-monthly-orchestrator";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const batchSchema = z.object({
  yyyymm: z.string().regex(/^\d{4}-\d{2}$/),
  clientIds: z.array(z.string().uuid()).min(1).max(500),
});

export type BatchResultEntry = {
  clientId: string;
  status:
    | "created"
    | "skipped_no_lines"
    | "skipped_already_exists"
    | "errored";
  invoiceId?: string;
  invoiceNumber?: string;
  totalCents?: number;
  errorMessage?: string;
};

export const generateMonthlyBatch = authedAction
  .schema(batchSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "finance");

    const results: BatchResultEntry[] = [];

    for (const clientId of parsedInput.clientIds) {
      try {
        const r = await generatePsMonthlyInvoice({
          organizationId: ctx.organization.id,
          clientId,
          yyyymm: parsedInput.yyyymm,
          generatedByMembershipId: ctx.membership.id,
          syncroRemoteContacts: 0,
        });
        if (r.created) {
          results.push({
            clientId,
            status: "created",
            invoiceId: r.invoiceId,
            invoiceNumber: r.invoiceNumber,
            totalCents: r.totalCents,
          });
        } else {
          results.push({
            clientId,
            status:
              r.reason === "already_exists"
                ? "skipped_already_exists"
                : "skipped_no_lines",
          });
        }
      } catch (err) {
        // One client errored — log + record but keep the batch going.
        // The page summary will show what failed so the operator can
        // re-run just those.
        console.error(`Batch invoice for ${clientId} failed:`, err);
        results.push({
          clientId,
          status: "errored",
          errorMessage:
            err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    // If literally nothing succeeded, treat as a hard failure so the
    // toast in the UI is unambiguous.
    const createdCount = results.filter((r) => r.status === "created").length;
    if (createdCount === 0 && results.every((r) => r.status === "errored")) {
      throw new PublicError(
        `All ${results.length} client(s) errored. First error: ${results[0].errorMessage}`,
      );
    }

    revalidatePath("/finance/invoices");
    revalidatePath("/finance/invoices/batch");

    return {
      yyyymm: parsedInput.yyyymm,
      total: results.length,
      created: createdCount,
      skipped: results.filter((r) => r.status.startsWith("skipped")).length,
      errored: results.filter((r) => r.status === "errored").length,
      totalDollarsCreated: results.reduce(
        (sum, r) => sum + (r.status === "created" ? r.totalCents ?? 0 : 0),
        0,
      ),
      results,
    };
  });
