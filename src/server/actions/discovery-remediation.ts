"use server";

/**
 * Remediation tasks: build the plan from the assessment, then work it —
 * status, notes, custom tasks. Closing a finding-sourced task re-grades
 * the client assessment (see lib/discovery/remediation.ts).
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { discoveryTasks } from "@/db/schema";
import { loadSiteAssessment } from "@/lib/discovery/assessment-store";
import { getProject } from "@/lib/discovery/load";
import { plannedTasks, syncTasks, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/discovery/remediation";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

async function project(projectId: string, organizationId: string) {
  const p = await getProject(projectId, organizationId);
  if (!p) throw new PublicError("Site walk not found");
  return p;
}

function refresh(projectId: string) {
  revalidatePath(`/discovery/${projectId}/remediation`);
  revalidatePath(`/discovery/${projectId}/assessment`);
  revalidatePath(`/discovery/${projectId}`);
}

export const buildRemediationPlan = authedAction
  .schema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    const { assessment, data } = await loadSiteAssessment(p);
    const added = await syncTasks({
      organizationId: ctx.organization.id,
      projectId: p.id,
      membershipId: ctx.membership.id,
      planned: plannedTasks(assessment, data),
    });
    refresh(p.id);
    return { added };
  });

export const updateTask = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      taskId: z.string().uuid(),
      status: z.enum(TASK_STATUSES).optional(),
      notes: z.string().max(4000).nullable().optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    const set: Partial<typeof discoveryTasks.$inferInsert> = { updatedAt: new Date() };
    if (parsedInput.status) {
      set.status = parsedInput.status;
      const closed = parsedInput.status === "done";
      set.completedAt = closed ? new Date() : null;
      set.completedByMembershipId = closed ? ctx.membership.id : null;
    }
    if (parsedInput.notes !== undefined) set.notes = parsedInput.notes?.trim() || null;
    if (parsedInput.priority) set.priority = parsedInput.priority;
    const [t] = await db
      .update(discoveryTasks)
      .set(set)
      .where(and(eq(discoveryTasks.id, parsedInput.taskId), eq(discoveryTasks.projectId, p.id)))
      .returning({ id: discoveryTasks.id });
    if (!t) throw new PublicError("Task not found");
    refresh(p.id);
    return { ok: true };
  });

export const addTask = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      title: z.string().trim().min(2).max(300),
      detail: z.string().max(2000).nullable().optional(),
      area: z.string().max(40).nullable().optional(),
      priority: z.enum(TASK_PRIORITIES).default("Medium"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    await db.insert(discoveryTasks).values({
      organizationId: ctx.organization.id,
      projectId: p.id,
      source: "manual",
      title: parsedInput.title,
      detail: parsedInput.detail?.trim() || null,
      area: parsedInput.area || null,
      priority: parsedInput.priority,
      sortOrder: 10_000,
      createdByMembershipId: ctx.membership.id,
    });
    refresh(p.id);
    return { ok: true };
  });

export const deleteTask = authedAction
  .schema(z.object({ projectId: z.string().uuid(), taskId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await project(parsedInput.projectId, ctx.organization.id);
    // Only hand-added tasks can be removed; planned ones are skipped instead,
    // otherwise the next plan rebuild would just add them back.
    const [t] = await db
      .delete(discoveryTasks)
      .where(and(eq(discoveryTasks.id, parsedInput.taskId), eq(discoveryTasks.projectId, p.id), eq(discoveryTasks.source, "manual")))
      .returning({ id: discoveryTasks.id });
    if (!t) throw new PublicError("Only tasks you added can be deleted — skip planned ones instead");
    refresh(p.id);
    return { ok: true };
  });
