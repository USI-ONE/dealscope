"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diligenceDataRequests } from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

const requestStatus = z.enum(["pending", "received", "accepted", "waived", "rejected"]);

export const createDataRequest = authedAction
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

export const updateDataRequest = authedAction
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

export const deleteDataRequest = authedAction
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
