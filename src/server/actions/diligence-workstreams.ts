"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diligenceMilestones, diligenceWorkstreamTasks } from "@/db/schema";
import { guestAction, authorize, PublicError } from "@/server/safe-action";
import { assertOwned } from "@/server/ownership";
import { diligenceEngagements, memberships } from "@/db/schema";

/* ============================================================================
 * WORKSTREAM TASKS
 * ========================================================================== */

export const createWorkstreamTask = guestAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      track: z.string().nullable().optional(),
      title: z.string().min(1).max(500),
      description: z.string().max(4000).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      ownerMembershipId: z.string().uuid().optional().nullable(),
      dueDate: z.string().optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertOwned(diligenceEngagements, parsedInput.engagementId, ctx.organization.id, "Engagement");
    await assertOwned(memberships, parsedInput.ownerMembershipId, ctx.organization.id, "Member");
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(position), -1)` })
      .from(diligenceWorkstreamTasks)
      .where(eq(diligenceWorkstreamTasks.engagementId, parsedInput.engagementId));
    const [created] = await db.insert(diligenceWorkstreamTasks).values({
      organizationId: ctx.organization.id,
      engagementId: parsedInput.engagementId,
      track: parsedInput.track ?? null,
      title: parsedInput.title.trim(),
      description: parsedInput.description?.trim() || null,
      priority: parsedInput.priority,
      ownerMembershipId: parsedInput.ownerMembershipId || null,
      dueDate: parsedInput.dueDate || null,
      status: "open",
      position: maxPos + 1,
      createdByMembershipId: ctx.membership.id,
    }).returning();
    return { task: created };
  });

export const updateWorkstreamTask = guestAction
  .schema(
    z.object({
      taskId: z.string().uuid(),
      engagementId: z.string().uuid(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(4000).optional().nullable(),
      status: z.enum(["open", "in_progress", "blocked", "done"]).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      ownerMembershipId: z.string().uuid().optional().nullable(),
      dueDate: z.string().optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await assertOwned(memberships, parsedInput.ownerMembershipId, ctx.organization.id, "Member");
    const { taskId, engagementId, status, ...rest } = parsedInput;
    const completedAt =
      status === "done" ? new Date() : status !== undefined ? null : undefined;
    await db
      .update(diligenceWorkstreamTasks)
      .set({
        ...rest,
        ...(status !== undefined ? { status } : {}),
        ...(completedAt !== undefined ? { completedAt } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diligenceWorkstreamTasks.id, taskId),
          eq(diligenceWorkstreamTasks.engagementId, engagementId),
          eq(diligenceWorkstreamTasks.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });

export const deleteWorkstreamTask = guestAction
  .schema(z.object({ taskId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceWorkstreamTasks)
      .where(
        and(
          eq(diligenceWorkstreamTasks.id, parsedInput.taskId),
          eq(diligenceWorkstreamTasks.engagementId, parsedInput.engagementId),
          eq(diligenceWorkstreamTasks.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });

/* ============================================================================
 * MILESTONES
 * ========================================================================== */

export const createMilestone = guestAction
  .schema(
    z.object({
      engagementId: z.string().uuid(),
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      targetDate: z.string().optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "diligence");
    await assertOwned(diligenceEngagements, parsedInput.engagementId, ctx.organization.id, "Engagement");
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(position), -1)` })
      .from(diligenceMilestones)
      .where(eq(diligenceMilestones.engagementId, parsedInput.engagementId));
    const [created] = await db.insert(diligenceMilestones).values({
      organizationId: ctx.organization.id,
      engagementId: parsedInput.engagementId,
      name: parsedInput.name.trim(),
      description: parsedInput.description?.trim() || null,
      targetDate: parsedInput.targetDate || null,
      position: maxPos + 1,
    }).returning();
    return { milestone: created };
  });

export const completeMilestone = guestAction
  .schema(
    z.object({
      milestoneId: z.string().uuid(),
      engagementId: z.string().uuid(),
      completed: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    await db
      .update(diligenceMilestones)
      .set({
        completedAt: parsedInput.completed ? new Date() : null,
        completedByMembershipId: parsedInput.completed ? ctx.membership.id : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diligenceMilestones.id, parsedInput.milestoneId),
          eq(diligenceMilestones.engagementId, parsedInput.engagementId),
          eq(diligenceMilestones.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });

export const deleteMilestone = guestAction
  .schema(z.object({ milestoneId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    await db
      .delete(diligenceMilestones)
      .where(
        and(
          eq(diligenceMilestones.id, parsedInput.milestoneId),
          eq(diligenceMilestones.engagementId, parsedInput.engagementId),
          eq(diligenceMilestones.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });
