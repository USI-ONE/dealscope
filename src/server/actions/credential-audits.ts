"use server";

/**
 * Server actions for the 30-day credential audit cycle.
 *
 * USI's compliance rule: every external system credential (voice
 * service, internet circuit, future: vendor portals) gets a manual
 * "log in, confirm it works" check every 30 days. The audit step
 * stamps `last_audited_at` + `last_audited_by_membership_id` on the
 * target row and surfaces it on the runbook + /upcoming.
 *
 * For voice services we also let the operator set the 1Password
 * item URL from the same action so it can be filled in during the
 * first audit without a separate edit gesture. Circuits already
 * carry a 1Password URL — the existing network-circuit edit form
 * handles that, so we only stamp the audit fields here.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientNetworkCircuits,
  voiceServices,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

/* ============================================================================
 * VOICE SERVICE — record audit + optionally set 1Password URL.
 * ========================================================================== */
const voiceAuditSchema = z.object({
  voiceServiceId: z.string().uuid(),
  notes: z.string().max(2000).nullable().optional(),
  onePasswordItemUrl: z
    .string()
    .url("Must be a valid URL")
    .max(2000)
    .nullable()
    .optional(),
});

export const recordVoiceServiceAudit = authedAction
  .schema(voiceAuditSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const existing = await db.query.voiceServices.findFirst({
      where: and(
        eq(voiceServices.id, parsedInput.voiceServiceId),
        eq(voiceServices.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Voice service not found");

    await db
      .update(voiceServices)
      .set({
        lastAuditedAt: new Date(),
        lastAuditedByMembershipId: ctx.membership.id,
        lastAuditNotes:
          parsedInput.notes !== undefined ? parsedInput.notes : existing.lastAuditNotes,
        // 1Password URL: only overwrite when the caller passed a value.
        // Empty string treated as "unset"; null = explicit clear.
        onePasswordItemUrl:
          parsedInput.onePasswordItemUrl !== undefined
            ? parsedInput.onePasswordItemUrl || null
            : existing.onePasswordItemUrl,
        updatedAt: new Date(),
      })
      .where(eq(voiceServices.id, parsedInput.voiceServiceId));

    revalidatePath(`/clients/${existing.clientId}`, "layout");
    return { ok: true };
  });

/* ============================================================================
 * CIRCUIT — record audit only. 1Password URL is edited via the
 * existing network-map card.
 * ========================================================================== */
const circuitAuditSchema = z.object({
  circuitId: z.string().uuid(),
  notes: z.string().max(2000).nullable().optional(),
});

export const recordCircuitAudit = authedAction
  .schema(circuitAuditSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const existing = await db.query.clientNetworkCircuits.findFirst({
      where: and(
        eq(clientNetworkCircuits.id, parsedInput.circuitId),
        eq(clientNetworkCircuits.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Circuit not found");

    await db
      .update(clientNetworkCircuits)
      .set({
        lastAuditedAt: new Date(),
        lastAuditedByMembershipId: ctx.membership.id,
        lastAuditNotes:
          parsedInput.notes !== undefined ? parsedInput.notes : existing.lastAuditNotes,
        updatedAt: new Date(),
      })
      .where(eq(clientNetworkCircuits.id, parsedInput.circuitId));

    revalidatePath(`/clients/${existing.clientId}`, "layout");
    return { ok: true };
  });
