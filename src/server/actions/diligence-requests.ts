"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diligenceDataRequests, diligenceVaultFiles } from "@/db/schema";
import { guestAction, authorize, PublicError } from "@/server/safe-action";
import { assertOwned } from "@/server/ownership";
import { diligenceEngagements } from "@/db/schema";

const requestStatus = z.enum(["pending", "received", "accepted", "waived", "rejected"]);

export const createDataRequest = guestAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      track: z.string().nullable().optional(),
      title: z.string().min(1).max(500),
      description: z.string().max(4000).optional(),
      dueDate: z.string().optional().nullable(),
      assignedTo: z.string().max(200).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertOwned(diligenceEngagements, parsedInput.engagementId, ctx.organization.id, "Engagement");
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(position), -1)` })
      .from(diligenceDataRequests)
      .where(eq(diligenceDataRequests.engagementId, parsedInput.engagementId));
    const [created] = await db.insert(diligenceDataRequests).values({
      organizationId: ctx.organization.id,
      engagementId: parsedInput.engagementId,
      track: parsedInput.track ?? null,
      title: parsedInput.title.trim(),
      description: parsedInput.description?.trim() || null,
      dueDate: parsedInput.dueDate || null,
      assignedTo: parsedInput.assignedTo?.trim() || null,
      status: "pending",
      position: maxPos + 1,
      createdByMembershipId: ctx.membership.id,
    }).returning();
    return { request: created };
  });

export const updateDataRequest = guestAction
  .schema(
    z.object({
      requestId: z.string().uuid(),
      engagementId: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(4000).optional().nullable(),
      status: requestStatus.optional(),
      dueDate: z.string().optional().nullable(),
      assignedTo: z.string().max(200).optional().nullable(),
      notes: z.string().max(4000).optional().nullable(),
      fulfilledByFileId: z.string().uuid().optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    const { requestId, engagementId, ...updates } = parsedInput;
    if (updates.fulfilledByFileId) {
      const [file] = await db
        .select({ id: diligenceVaultFiles.id })
        .from(diligenceVaultFiles)
        .where(
          and(
            eq(diligenceVaultFiles.id, updates.fulfilledByFileId),
            eq(diligenceVaultFiles.engagementId, engagementId),
            eq(diligenceVaultFiles.organizationId, ctx.organization.id),
          ),
        )
        .limit(1);
      if (!file) throw new PublicError("File not found");
    }
    await db
      .update(diligenceDataRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(diligenceDataRequests.id, requestId),
          eq(diligenceDataRequests.engagementId, engagementId),
          eq(diligenceDataRequests.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });

export const deleteDataRequest = guestAction
  .schema(z.object({ requestId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceDataRequests)
      .where(
        and(
          eq(diligenceDataRequests.id, parsedInput.requestId),
          eq(diligenceDataRequests.engagementId, parsedInput.engagementId),
          eq(diligenceDataRequests.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });
