"use server";

/**
 * Project Management server actions — v1 surface area.
 *
 * Covered actions:
 *   createProject              — from a template OR blank, on a given client
 *   updateProject              — header fields (name, summary, dates, status,
 *                                health, priority, PM, lead engineer, scope)
 *   archiveProject / restore   — soft-archive; doesn't delete data
 *   createMilestone / update / delete
 *   createTask / update / delete / toggleComplete
 *   postStatusUpdate           — narrative status note with health snapshot
 *   addDocument / updateDocument / deleteDocument
 *
 * Permissions:
 *   manage  → owner / executive / manager — full control
 *   update  → member — can mark tasks done + post status notes, but can't
 *             create/delete projects or change client assignment
 *   read    — currently no resource-read gate; project visibility is
 *             governed by the org boundary like everything else
 *
 * Why one file?
 * ─────────────
 * Keeping the actions co-located makes it easy to see the contract for
 * project mutation in one place. If this grows past ~600 lines we'll
 * split by surface (project / milestone / task / status / document).
 */
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  projects,
  projectMilestones,
  projectTasks,
  projectStatusUpdates,
  projectDocuments,
  projectStakeholders,
  projectComments,
  projectAttachments,
  projectTaskDependencies,
  projectDependencies,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import {
  getProjectTemplate,
  type ProjectKind,
} from "@/lib/projects/templates";
import { nextProjectCode } from "@/lib/projects/code-generator";

/* ---------------------------------------------------------------------- */
/* Enums + shared schemas                                                  */
/* ---------------------------------------------------------------------- */

const projectKindZ = z.enum([
  "m365_migration",
  "win11_rollout",
  "server_replacement",
  "network_refresh",
  "onboarding",
  "security_baseline",
  "eol_refresh",
  "cybersecurity_audit",
  "custom",
]);
const projectStatusZ = z.enum([
  "planning",
  "in_progress",
  "on_hold",
  "blocked",
  "completed",
  "cancelled",
]);
const projectHealthZ = z.enum(["green", "amber", "red"]);
const projectPriorityZ = z.enum(["low", "normal", "high", "critical"]);
const milestoneStatusZ = z.enum([
  "planned",
  "in_progress",
  "completed",
  "missed",
]);
const taskStatusZ = z.enum([
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);
const statusUpdateKindZ = z.enum(["status", "risk", "decision", "note"]);
const documentKindZ = z.enum([
  "deliverable",
  "runbook",
  "meeting_notes",
  "risk_log",
  "scope",
  "other",
]);

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadProjectOrThrow(
  organizationId: string,
  projectId: string,
): Promise<{ id: string; organizationId: string; clientId: string }> {
  const p = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.organizationId, organizationId),
    ),
    columns: { id: true, organizationId: true, clientId: true },
  });
  if (!p) throw new PublicError("Project not found");
  return p;
}

function revalidateProject(projectId: string) {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
}

/* ---------------------------------------------------------------------- */
/* createProject — from template or blank                                  */
/* ---------------------------------------------------------------------- */

const createProjectSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(2).max(200),
  kind: projectKindZ.default("custom"),
  summary: z.string().max(1000).optional().nullable(),
  scopeMd: z.string().max(50_000).optional().nullable(),
  priority: projectPriorityZ.default("normal"),
  primaryPmMembershipId: z.string().uuid().optional().nullable(),
  leadEngineerMembershipId: z.string().uuid().optional().nullable(),
  plannedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  budgetCents: z.number().int().nonnegative().optional().nullable(),
  contractTypeLabel: z.string().max(200).optional().nullable(),
  totalEstimatedHours: z.number().int().nonnegative().optional().nullable(),
  /** When true, seed milestones + tasks from the kind's template (if
   *  one exists). When false, the project is created empty. */
  seedFromTemplate: z.boolean().default(true),
});

export const createProject = authedAction
  .schema(createProjectSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("create", "project");

    const code = await nextProjectCode(ctx.organization.id);
    const template =
      parsedInput.seedFromTemplate && parsedInput.kind !== "custom"
        ? getProjectTemplate(parsedInput.kind as ProjectKind)
        : undefined;

    // Resolve planned end date if start was given + template carries
    // a default duration.
    let plannedEnd = parsedInput.plannedEndDate ?? null;
    if (!plannedEnd && parsedInput.plannedStartDate && template?.defaultDurationDays) {
      plannedEnd = addDays(
        parsedInput.plannedStartDate,
        template.defaultDurationDays,
      );
    }

    const [created] = await db
      .insert(projects)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        code,
        name: parsedInput.name.trim(),
        kind: parsedInput.kind,
        status: "planning",
        health: "green",
        priority: parsedInput.priority,
        summary:
          parsedInput.summary?.trim() || template?.summary || null,
        scopeMd: parsedInput.scopeMd?.trim() || null,
        primaryPmMembershipId: parsedInput.primaryPmMembershipId || null,
        leadEngineerMembershipId: parsedInput.leadEngineerMembershipId || null,
        plannedStartDate: parsedInput.plannedStartDate || null,
        plannedEndDate: plannedEnd,
        budgetCents: parsedInput.budgetCents ?? null,
        contractTypeLabel:
          parsedInput.contractTypeLabel?.trim() ||
          template?.defaultContractType ||
          null,
        totalEstimatedHours:
          parsedInput.totalEstimatedHours ??
          template?.defaultEstimatedHours ??
          null,
      })
      .returning({ id: projects.id });

    // Seed milestones + tasks if requested.
    if (template) {
      for (const ms of template.milestones) {
        const targetDate =
          parsedInput.plannedStartDate && ms.targetOffsetDays != null
            ? addDays(parsedInput.plannedStartDate, ms.targetOffsetDays)
            : null;
        const [insertedMs] = await db
          .insert(projectMilestones)
          .values({
            organizationId: ctx.organization.id,
            projectId: created.id,
            name: ms.name,
            description: ms.description ?? null,
            targetDate,
            status: "planned",
            position: ms.position,
            clientVisible: true,
          })
          .returning({ id: projectMilestones.id });

        if (ms.tasks.length > 0) {
          await db.insert(projectTasks).values(
            ms.tasks.map((t) => ({
              organizationId: ctx.organization.id,
              projectId: created.id,
              milestoneId: insertedMs.id,
              title: t.title,
              description: t.description ?? null,
              status: "todo" as const,
              estimatedHours: t.estimatedHours ?? null,
              position: t.position,
            })),
          );
        }
      }
    }

    revalidatePath("/projects");
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { projectId: created.id, code };
  });

/* ---------------------------------------------------------------------- */
/* updateProject — header fields                                           */
/* ---------------------------------------------------------------------- */

const updateProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(2).max(200).optional(),
  status: projectStatusZ.optional(),
  health: projectHealthZ.optional(),
  priority: projectPriorityZ.optional(),
  summary: z.string().max(1000).optional().nullable(),
  scopeMd: z.string().max(50_000).optional().nullable(),
  primaryPmMembershipId: z.string().uuid().optional().nullable(),
  leadEngineerMembershipId: z.string().uuid().optional().nullable(),
  plannedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  plannedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  actualStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  actualEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  budgetCents: z.number().int().nonnegative().optional().nullable(),
  contractTypeLabel: z.string().max(200).optional().nullable(),
  totalEstimatedHours: z.number().int().nonnegative().optional().nullable(),
  totalActualHours: z.number().int().nonnegative().optional().nullable(),
});

export const updateProject = authedAction
  .schema(updateProjectSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(parsedInput)) {
      if (k === "projectId") continue;
      if (v === undefined) continue;
      // Trim strings to null when empty.
      if (typeof v === "string" && v.trim() === "") patch[k] = null;
      else patch[k] = typeof v === "string" ? v.trim() : v;
    }
    // Auto-stamp actualStartDate when first moving to in_progress.
    if (patch.status === "in_progress" && !parsedInput.actualStartDate) {
      patch.actualStartDate = new Date().toISOString().slice(0, 10);
    }
    if (patch.status === "completed" && !parsedInput.actualEndDate) {
      patch.actualEndDate = new Date().toISOString().slice(0, 10);
    }

    await db
      .update(projects)
      .set(patch)
      .where(eq(projects.id, existing.id));
    revalidateProject(existing.id);
    revalidatePath(`/clients/${existing.clientId}`);
    return { ok: true };
  });

export const archiveProject = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      restore: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );
    await db
      .update(projects)
      .set({
        archivedAt: parsedInput.restore ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, existing.id));
    revalidateProject(existing.id);
    return { ok: true };
  });

export const deleteProject = authedAction
  .schema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "project");
    const existing = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );
    await db.delete(projects).where(eq(projects.id, existing.id));
    revalidatePath("/projects");
    revalidatePath(`/clients/${existing.clientId}`);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Milestones                                                              */
/* ---------------------------------------------------------------------- */

export const createMilestone = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      name: z.string().min(1).max(200),
      description: z.string().max(5000).optional().nullable(),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      assigneeMembershipId: z.string().uuid().optional().nullable(),
      stakeholderId: z.string().uuid().optional().nullable(),
      position: z.number().int().nonnegative().optional(),
      clientVisible: z.boolean().default(true),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const proj = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );

    // Default position = N (next slot after existing milestones).
    // The previous implementation used `db.$count(...)` inside a
    // .select().from(projectMilestones), which collapsed to zero
    // rows when the project had no milestones yet — destructuring
    // `[{maxPos}] = []` threw TypeError and surfaced as the generic
    // "Something went wrong" error. Plain count(*) always returns
    // exactly one row.
    let position = parsedInput.position;
    if (position === undefined) {
      try {
        const [row] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(projectMilestones)
          .where(eq(projectMilestones.projectId, proj.id));
        position = row?.n ?? 0;
      } catch {
        position = 0;
      }
    }

    let m;
    try {
      [m] = await db
        .insert(projectMilestones)
        .values({
          organizationId: ctx.organization.id,
          projectId: proj.id,
          name: parsedInput.name.trim(),
          description: parsedInput.description?.trim() || null,
          targetDate: parsedInput.targetDate || null,
          assigneeMembershipId: parsedInput.assigneeMembershipId || null,
          stakeholderId: parsedInput.stakeholderId || null,
          status: "planned",
          position,
          clientVisible: parsedInput.clientVisible,
        })
        .returning({ id: projectMilestones.id });
    } catch (err) {
      console.error("createMilestone: insert failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new PublicError(`Couldn't create milestone: ${msg}`);
    }
    revalidateProject(proj.id);
    return { milestoneId: m.id };
  });

export const updateMilestone = authedAction
  .schema(
    z.object({
      milestoneId: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(5000).optional().nullable(),
      targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      assigneeMembershipId: z.string().uuid().optional().nullable(),
      stakeholderId: z.string().uuid().optional().nullable(),
      requiresSignoff: z.boolean().optional(),
      status: milestoneStatusZ.optional(),
      position: z.number().int().nonnegative().optional(),
      clientVisible: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectMilestones.findFirst({
      where: and(
        eq(projectMilestones.id, parsedInput.milestoneId),
        eq(projectMilestones.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Milestone not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsedInput.name !== undefined) patch.name = parsedInput.name.trim();
    if (parsedInput.description !== undefined)
      patch.description = parsedInput.description?.trim() || null;
    if (parsedInput.targetDate !== undefined)
      patch.targetDate = parsedInput.targetDate || null;
    if (parsedInput.assigneeMembershipId !== undefined)
      patch.assigneeMembershipId = parsedInput.assigneeMembershipId || null;
    if (parsedInput.stakeholderId !== undefined)
      patch.stakeholderId = parsedInput.stakeholderId || null;
    if (parsedInput.requiresSignoff !== undefined)
      patch.requiresSignoff = parsedInput.requiresSignoff;
    if (parsedInput.position !== undefined) patch.position = parsedInput.position;
    if (parsedInput.clientVisible !== undefined)
      patch.clientVisible = parsedInput.clientVisible;
    if (parsedInput.status !== undefined) {
      patch.status = parsedInput.status;
      if (parsedInput.status === "completed" && !existing.completedAt) {
        patch.completedAt = new Date();
      }
      if (parsedInput.status !== "completed" && existing.completedAt) {
        patch.completedAt = null;
      }
    }
    await db
      .update(projectMilestones)
      .set(patch)
      .where(eq(projectMilestones.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const deleteMilestone = authedAction
  .schema(z.object({ milestoneId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectMilestones.findFirst({
      where: and(
        eq(projectMilestones.id, parsedInput.milestoneId),
        eq(projectMilestones.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Milestone not found");
    await db
      .delete(projectMilestones)
      .where(eq(projectMilestones.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Tasks                                                                   */
/* ---------------------------------------------------------------------- */

export const createTask = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      milestoneId: z.string().uuid().optional().nullable(),
      /** When set, this row is a SUBTASK of that parent task. Single-
       *  level nesting only — see validation below. */
      parentTaskId: z.string().uuid().optional().nullable(),
      title: z.string().min(1).max(300),
      description: z.string().max(5000).optional().nullable(),
      assigneeMembershipId: z.string().uuid().optional().nullable(),
      stakeholderId: z.string().uuid().optional().nullable(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      estimatedHours: z.number().int().nonnegative().optional().nullable(),
      position: z.number().int().nonnegative().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const proj = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );

    // Subtask validation: the parent must exist, be in this same
    // project, and itself be top-level (parent_task_id IS NULL).
    // This is what keeps the tree single-level.
    let effectiveMilestoneId = parsedInput.milestoneId ?? null;
    if (parsedInput.parentTaskId) {
      const parent = await db.query.projectTasks.findFirst({
        where: and(
          eq(projectTasks.id, parsedInput.parentTaskId),
          eq(projectTasks.organizationId, ctx.organization.id),
        ),
        columns: {
          id: true,
          projectId: true,
          milestoneId: true,
          parentTaskId: true,
        },
      });
      if (!parent) throw new PublicError("Parent task not found");
      if (parent.projectId !== proj.id) {
        throw new PublicError(
          "Subtask must live in the same project as its parent.",
        );
      }
      if (parent.parentTaskId) {
        throw new PublicError(
          "Subtasks can't have their own subtasks — flatten the work into the parent task.",
        );
      }
      // Subtask inherits its parent's milestone. The operator's
      // milestone choice (if any) is ignored when there's a parent —
      // keeps the tree consistent.
      effectiveMilestoneId = parent.milestoneId;
    }

    let t;
    try {
      [t] = await db
      .insert(projectTasks)
      .values({
        organizationId: ctx.organization.id,
        projectId: proj.id,
        milestoneId: effectiveMilestoneId,
        parentTaskId: parsedInput.parentTaskId || null,
        title: parsedInput.title.trim(),
        description: parsedInput.description?.trim() || null,
        status: "todo",
        assigneeMembershipId: parsedInput.assigneeMembershipId || null,
        stakeholderId: parsedInput.stakeholderId || null,
        dueDate: parsedInput.dueDate || null,
        estimatedHours: parsedInput.estimatedHours ?? null,
        position: parsedInput.position ?? 0,
      })
      .returning({ id: projectTasks.id });
    } catch (err) {
      console.error("createTask: insert failed", err);
      const msg = err instanceof Error ? err.message : String(err);
      throw new PublicError(`Couldn't create task: ${msg}`);
    }
    revalidateProject(proj.id);
    return { taskId: t.id };
  });

export const updateTask = authedAction
  .schema(
    z.object({
      taskId: z.string().uuid(),
      milestoneId: z.string().uuid().optional().nullable(),
      title: z.string().min(1).max(300).optional(),
      description: z.string().max(5000).optional().nullable(),
      status: taskStatusZ.optional(),
      assigneeMembershipId: z.string().uuid().optional().nullable(),
      stakeholderId: z.string().uuid().optional().nullable(),
      requiresSignoff: z.boolean().optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      estimatedHours: z.number().int().nonnegative().optional().nullable(),
      position: z.number().int().nonnegative().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsedInput.taskId),
        eq(projectTasks.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Task not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(parsedInput)) {
      if (k === "taskId") continue;
      if (v === undefined) continue;
      patch[k] = typeof v === "string" ? v.trim() : v;
    }
    if (parsedInput.status === "done" && !existing.completedAt) {
      patch.completedAt = new Date();
    }
    if (
      parsedInput.status !== undefined &&
      parsedInput.status !== "done" &&
      existing.completedAt
    ) {
      patch.completedAt = null;
    }
    await db.update(projectTasks).set(patch).where(eq(projectTasks.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const deleteTask = authedAction
  .schema(z.object({ taskId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsedInput.taskId),
        eq(projectTasks.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Task not found");
    await db.delete(projectTasks).where(eq(projectTasks.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Status updates                                                          */
/* ---------------------------------------------------------------------- */

export const postStatusUpdate = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      kind: statusUpdateKindZ.default("status"),
      body: z.string().min(1).max(20_000),
      clientVisible: z.boolean().default(true),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const proj = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, parsedInput.projectId),
        eq(projects.organizationId, ctx.organization.id),
      ),
      columns: { id: true, health: true },
    });
    if (!proj) throw new PublicError("Project not found");

    const [u] = await db
      .insert(projectStatusUpdates)
      .values({
        organizationId: ctx.organization.id,
        projectId: proj.id,
        authorMembershipId: ctx.membership.id,
        kind: parsedInput.kind,
        healthAtPost: proj.health,
        body: parsedInput.body.trim(),
        clientVisible: parsedInput.clientVisible,
      })
      .returning({ id: projectStatusUpdates.id });
    revalidateProject(proj.id);
    return { statusUpdateId: u.id };
  });

export const deleteStatusUpdate = authedAction
  .schema(z.object({ statusUpdateId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectStatusUpdates.findFirst({
      where: and(
        eq(projectStatusUpdates.id, parsedInput.statusUpdateId),
        eq(projectStatusUpdates.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Status update not found");
    await db
      .delete(projectStatusUpdates)
      .where(eq(projectStatusUpdates.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Documents                                                               */
/* ---------------------------------------------------------------------- */

export const createDocument = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      kind: documentKindZ.default("other"),
      title: z.string().min(1).max(300),
      bodyMd: z.string().max(100_000).optional().nullable(),
      fileUrl: z.string().url().max(2000).optional().nullable(),
      fileMimeType: z.string().max(200).optional().nullable(),
      clientVisible: z.boolean().default(true),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const proj = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );
    const [d] = await db
      .insert(projectDocuments)
      .values({
        organizationId: ctx.organization.id,
        projectId: proj.id,
        kind: parsedInput.kind,
        title: parsedInput.title.trim(),
        bodyMd: parsedInput.bodyMd?.trim() || null,
        fileUrl: parsedInput.fileUrl?.trim() || null,
        fileMimeType: parsedInput.fileMimeType?.trim() || null,
        uploadedByMembershipId: ctx.membership.id,
        clientVisible: parsedInput.clientVisible,
      })
      .returning({ id: projectDocuments.id });
    revalidateProject(proj.id);
    return { documentId: d.id };
  });

export const updateDocument = authedAction
  .schema(
    z.object({
      documentId: z.string().uuid(),
      kind: documentKindZ.optional(),
      title: z.string().min(1).max(300).optional(),
      bodyMd: z.string().max(100_000).optional().nullable(),
      fileUrl: z.string().url().max(2000).optional().nullable(),
      fileMimeType: z.string().max(200).optional().nullable(),
      clientVisible: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectDocuments.findFirst({
      where: and(
        eq(projectDocuments.id, parsedInput.documentId),
        eq(projectDocuments.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Document not found");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(parsedInput)) {
      if (k === "documentId") continue;
      if (v === undefined) continue;
      patch[k] = typeof v === "string" ? v.trim() : v;
    }
    await db
      .update(projectDocuments)
      .set(patch)
      .where(eq(projectDocuments.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const deleteDocument = authedAction
  .schema(z.object({ documentId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectDocuments.findFirst({
      where: and(
        eq(projectDocuments.id, parsedInput.documentId),
        eq(projectDocuments.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Document not found");
    await db
      .delete(projectDocuments)
      .where(eq(projectDocuments.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Stakeholders — client-side people on the project                        */
/* ---------------------------------------------------------------------- */

const stakeholderFields = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(200).optional().nullable(),
  email: z.string().max(320).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  roleLabel: z.string().max(120).optional().nullable(),
  isPrimary: z.boolean().default(false),
  notes: z.string().max(5000).optional().nullable(),
});

/**
 * Ensure at most one primary stakeholder per project. When this row
 * is being set primary, demote any other primaries on the same project
 * in the same transaction. Keeps the project header simple: there's
 * always exactly zero or one "go-to contact".
 */
async function ensureSinglePrimary(
  projectId: string,
  organizationId: string,
  becomingPrimaryStakeholderId: string | null,
): Promise<void> {
  if (!becomingPrimaryStakeholderId) return;
  await db
    .update(projectStakeholders)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(
      and(
        eq(projectStakeholders.projectId, projectId),
        eq(projectStakeholders.organizationId, organizationId),
        eq(projectStakeholders.isPrimary, true),
      ),
    );
}

export const createStakeholder = authedAction
  .schema(
    stakeholderFields.extend({ projectId: z.string().uuid() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const proj = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );

    if (parsedInput.isPrimary) {
      await ensureSinglePrimary(proj.id, ctx.organization.id, "pending");
    }

    const [s] = await db
      .insert(projectStakeholders)
      .values({
        organizationId: ctx.organization.id,
        projectId: proj.id,
        name: parsedInput.name.trim(),
        title: parsedInput.title?.trim() || null,
        email: parsedInput.email?.trim() || null,
        phone: parsedInput.phone?.trim() || null,
        roleLabel: parsedInput.roleLabel?.trim() || null,
        isPrimary: parsedInput.isPrimary,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning({ id: projectStakeholders.id });
    revalidateProject(proj.id);
    return { stakeholderId: s.id };
  });

export const updateStakeholder = authedAction
  .schema(
    stakeholderFields.partial().extend({
      stakeholderId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectStakeholders.findFirst({
      where: and(
        eq(projectStakeholders.id, parsedInput.stakeholderId),
        eq(projectStakeholders.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Stakeholder not found");

    if (parsedInput.isPrimary === true && !existing.isPrimary) {
      await ensureSinglePrimary(
        existing.projectId,
        ctx.organization.id,
        existing.id,
      );
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(parsedInput)) {
      if (k === "stakeholderId") continue;
      if (v === undefined) continue;
      patch[k] = typeof v === "string" ? v.trim() || null : v;
    }
    await db
      .update(projectStakeholders)
      .set(patch)
      .where(eq(projectStakeholders.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const deleteStakeholder = authedAction
  .schema(z.object({ stakeholderId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectStakeholders.findFirst({
      where: and(
        eq(projectStakeholders.id, parsedInput.stakeholderId),
        eq(projectStakeholders.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Stakeholder not found");
    await db
      .delete(projectStakeholders)
      .where(eq(projectStakeholders.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Comments — flat thread, scoped to project / milestone / task            */
/* ---------------------------------------------------------------------- */

export const postComment = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      // At most one of these. Both NULL = project-level comment.
      milestoneId: z.string().uuid().optional().nullable(),
      taskId: z.string().uuid().optional().nullable(),
      bodyMd: z.string().min(1).max(20_000),
      clientVisible: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    if (parsedInput.milestoneId && parsedInput.taskId) {
      throw new PublicError(
        "A comment can scope to a milestone OR a task, not both.",
      );
    }
    const proj = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );

    // Cross-check that the milestone/task actually belongs to this
    // project. Cheap insurance against a forged scope.
    if (parsedInput.milestoneId) {
      const m = await db.query.projectMilestones.findFirst({
        where: and(
          eq(projectMilestones.id, parsedInput.milestoneId),
          eq(projectMilestones.projectId, proj.id),
        ),
        columns: { id: true },
      });
      if (!m) throw new PublicError("Milestone not in this project");
    }
    if (parsedInput.taskId) {
      const t = await db.query.projectTasks.findFirst({
        where: and(
          eq(projectTasks.id, parsedInput.taskId),
          eq(projectTasks.projectId, proj.id),
        ),
        columns: { id: true },
      });
      if (!t) throw new PublicError("Task not in this project");
    }

    const [c] = await db
      .insert(projectComments)
      .values({
        organizationId: ctx.organization.id,
        projectId: proj.id,
        milestoneId: parsedInput.milestoneId || null,
        taskId: parsedInput.taskId || null,
        authorMembershipId: ctx.membership.id,
        bodyMd: parsedInput.bodyMd.trim(),
        clientVisible: parsedInput.clientVisible,
      })
      .returning({ id: projectComments.id });
    revalidateProject(proj.id);
    return { commentId: c.id };
  });

export const updateComment = authedAction
  .schema(
    z.object({
      commentId: z.string().uuid(),
      bodyMd: z.string().min(1).max(20_000).optional(),
      clientVisible: z.boolean().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectComments.findFirst({
      where: and(
        eq(projectComments.id, parsedInput.commentId),
        eq(projectComments.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Comment not found");

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsedInput.bodyMd !== undefined)
      patch.bodyMd = parsedInput.bodyMd.trim();
    if (parsedInput.clientVisible !== undefined)
      patch.clientVisible = parsedInput.clientVisible;
    await db
      .update(projectComments)
      .set(patch)
      .where(eq(projectComments.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const deleteComment = authedAction
  .schema(z.object({ commentId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectComments.findFirst({
      where: and(
        eq(projectComments.id, parsedInput.commentId),
        eq(projectComments.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Comment not found");
    await db
      .delete(projectComments)
      .where(eq(projectComments.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Attachments — file references (URL-based for v1)                        */
/* ---------------------------------------------------------------------- */

export const createAttachment = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      milestoneId: z.string().uuid().optional().nullable(),
      taskId: z.string().uuid().optional().nullable(),
      commentId: z.string().uuid().optional().nullable(),
      fileUrl: z.string().url().max(2000),
      fileName: z.string().min(1).max(300),
      fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
      fileMimeType: z.string().max(200).optional().nullable(),
      description: z.string().max(1000).optional().nullable(),
      clientVisible: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");

    // Scope rule: at most ONE of milestone / task / comment.
    const scopes = [
      parsedInput.milestoneId,
      parsedInput.taskId,
      parsedInput.commentId,
    ].filter(Boolean);
    if (scopes.length > 1) {
      throw new PublicError(
        "An attachment can attach to a project, a milestone, a task, or a comment — pick one.",
      );
    }

    const proj = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.projectId,
    );

    const [a] = await db
      .insert(projectAttachments)
      .values({
        organizationId: ctx.organization.id,
        projectId: proj.id,
        milestoneId: parsedInput.milestoneId || null,
        taskId: parsedInput.taskId || null,
        commentId: parsedInput.commentId || null,
        fileUrl: parsedInput.fileUrl,
        fileName: parsedInput.fileName.trim(),
        fileSizeBytes: parsedInput.fileSizeBytes ?? null,
        fileMimeType: parsedInput.fileMimeType?.trim() || null,
        description: parsedInput.description?.trim() || null,
        uploadedByMembershipId: ctx.membership.id,
        clientVisible: parsedInput.clientVisible,
      })
      .returning({ id: projectAttachments.id });
    revalidateProject(proj.id);
    return { attachmentId: a.id };
  });

export const deleteAttachment = authedAction
  .schema(z.object({ attachmentId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectAttachments.findFirst({
      where: and(
        eq(projectAttachments.id, parsedInput.attachmentId),
        eq(projectAttachments.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Attachment not found");
    await db
      .delete(projectAttachments)
      .where(eq(projectAttachments.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Task dependencies (within-project)                                      */
/* ---------------------------------------------------------------------- */

/**
 * Detect a cycle: does adding (dependent ← predecessor) create one?
 *
 * BFS the predecessor chain starting from the proposed `predecessor`.
 * If we ever reach `dependent` along that chain, then dependent is
 * (transitively) already a predecessor of predecessor — adding the
 * new edge would close the loop.
 *
 * The graph for a single project is small (dozens to low-hundreds of
 * tasks; few edges) so an in-app BFS is comfortably fast — no need
 * for a recursive CTE.
 */
async function wouldCreateTaskCycle(
  organizationId: string,
  dependentTaskId: string,
  predecessorTaskId: string,
): Promise<boolean> {
  if (dependentTaskId === predecessorTaskId) return true;

  // Pull all task-dep edges within the org and walk the predecessor
  // chain. We could scope to the project but the dependent + predecessor
  // are already in the same project by FK + a project-level invariant.
  const edges = await db
    .select({
      dep: projectTaskDependencies.dependentTaskId,
      pred: projectTaskDependencies.predecessorTaskId,
    })
    .from(projectTaskDependencies)
    .where(eq(projectTaskDependencies.organizationId, organizationId));
  // Build: for each task, its predecessors.
  const predecessorsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = predecessorsOf.get(e.dep) ?? [];
    list.push(e.pred);
    predecessorsOf.set(e.dep, list);
  }

  // BFS from predecessorTaskId following the predecessor chain. If
  // we land on dependentTaskId, there's a cycle.
  const visited = new Set<string>();
  const queue: string[] = [predecessorTaskId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === dependentTaskId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const next = predecessorsOf.get(cur);
    if (next) queue.push(...next);
  }
  return false;
}

export const createTaskDependency = authedAction
  .schema(
    z.object({
      dependentTaskId: z.string().uuid(),
      predecessorTaskId: z.string().uuid(),
      notes: z.string().max(1000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    if (parsedInput.dependentTaskId === parsedInput.predecessorTaskId) {
      throw new PublicError("A task can't depend on itself.");
    }

    // Confirm both tasks exist, in this org, and belong to the same
    // project. The check joins through projectTasks once for each ID.
    const dependent = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsedInput.dependentTaskId),
        eq(projectTasks.organizationId, ctx.organization.id),
      ),
      columns: { id: true, projectId: true },
    });
    if (!dependent) throw new PublicError("Dependent task not found");
    const predecessor = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsedInput.predecessorTaskId),
        eq(projectTasks.organizationId, ctx.organization.id),
      ),
      columns: { id: true, projectId: true },
    });
    if (!predecessor) throw new PublicError("Predecessor task not found");
    if (dependent.projectId !== predecessor.projectId) {
      throw new PublicError(
        "Task dependencies must stay within the same project.",
      );
    }

    if (
      await wouldCreateTaskCycle(
        ctx.organization.id,
        parsedInput.dependentTaskId,
        parsedInput.predecessorTaskId,
      )
    ) {
      throw new PublicError(
        "That would create a circular dependency.",
      );
    }

    try {
      const [d] = await db
        .insert(projectTaskDependencies)
        .values({
          organizationId: ctx.organization.id,
          projectId: dependent.projectId,
          dependentTaskId: parsedInput.dependentTaskId,
          predecessorTaskId: parsedInput.predecessorTaskId,
          notes: parsedInput.notes?.trim() || null,
        })
        .returning({ id: projectTaskDependencies.id });
      revalidateProject(dependent.projectId);
      return { dependencyId: d.id };
    } catch (err) {
      // Duplicate edge (unique constraint) — surface a friendly message.
      if (err instanceof Error && /unique/i.test(err.message)) {
        throw new PublicError(
          "That dependency already exists on this task.",
        );
      }
      throw err;
    }
  });

export const deleteTaskDependency = authedAction
  .schema(z.object({ dependencyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectTaskDependencies.findFirst({
      where: and(
        eq(projectTaskDependencies.id, parsedInput.dependencyId),
        eq(projectTaskDependencies.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Dependency not found");
    await db
      .delete(projectTaskDependencies)
      .where(eq(projectTaskDependencies.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Project dependencies (cross-project, same org)                          */
/* ---------------------------------------------------------------------- */

async function wouldCreateProjectCycle(
  organizationId: string,
  dependentProjectId: string,
  predecessorProjectId: string,
): Promise<boolean> {
  if (dependentProjectId === predecessorProjectId) return true;
  const edges = await db
    .select({
      dep: projectDependencies.dependentProjectId,
      pred: projectDependencies.predecessorProjectId,
    })
    .from(projectDependencies)
    .where(eq(projectDependencies.organizationId, organizationId));
  const predecessorsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = predecessorsOf.get(e.dep) ?? [];
    list.push(e.pred);
    predecessorsOf.set(e.dep, list);
  }
  const visited = new Set<string>();
  const queue: string[] = [predecessorProjectId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === dependentProjectId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const next = predecessorsOf.get(cur);
    if (next) queue.push(...next);
  }
  return false;
}

export const createProjectDependency = authedAction
  .schema(
    z.object({
      dependentProjectId: z.string().uuid(),
      predecessorProjectId: z.string().uuid(),
      notes: z.string().max(1000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    if (
      parsedInput.dependentProjectId === parsedInput.predecessorProjectId
    ) {
      throw new PublicError("A project can't depend on itself.");
    }

    const dependent = await loadProjectOrThrow(
      ctx.organization.id,
      parsedInput.dependentProjectId,
    );
    // Just verify the predecessor exists in the same org.
    const predecessor = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, parsedInput.predecessorProjectId),
        eq(projects.organizationId, ctx.organization.id),
      ),
      columns: { id: true },
    });
    if (!predecessor) throw new PublicError("Predecessor project not found");

    if (
      await wouldCreateProjectCycle(
        ctx.organization.id,
        parsedInput.dependentProjectId,
        parsedInput.predecessorProjectId,
      )
    ) {
      throw new PublicError("That would create a circular dependency.");
    }

    try {
      const [d] = await db
        .insert(projectDependencies)
        .values({
          organizationId: ctx.organization.id,
          dependentProjectId: parsedInput.dependentProjectId,
          predecessorProjectId: parsedInput.predecessorProjectId,
          notes: parsedInput.notes?.trim() || null,
        })
        .returning({ id: projectDependencies.id });
      revalidateProject(dependent.id);
      revalidateProject(predecessor.id);
      return { dependencyId: d.id };
    } catch (err) {
      if (err instanceof Error && /unique/i.test(err.message)) {
        throw new PublicError("That dependency already exists.");
      }
      throw err;
    }
  });

export const deleteProjectDependency = authedAction
  .schema(z.object({ dependencyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectDependencies.findFirst({
      where: and(
        eq(projectDependencies.id, parsedInput.dependencyId),
        eq(projectDependencies.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Dependency not found");
    await db
      .delete(projectDependencies)
      .where(eq(projectDependencies.id, existing.id));
    revalidateProject(existing.dependentProjectId);
    revalidateProject(existing.predecessorProjectId);
    return { ok: true };
  });

/* ---------------------------------------------------------------------- */
/* Stakeholder sign-off (record + clear, tasks + milestones)               */
/* ---------------------------------------------------------------------- */

/**
 * Record an explicit stakeholder sign-off on a task. Operator captures
 * the approval on the stakeholder's behalf — USI is the system of
 * record; the client doesn't log in to sign off in v1.
 *
 * Defaults: if signedOffByStakeholderId isn't passed, use the task's
 * currently-assigned stakeholderId. If signedOffAt isn't passed, use
 * "now."
 *
 * No constraint that the task be "done" status — operators sometimes
 * pre-approve work mid-flight, and we don't want to fight that.
 */
const recordSignoffSchema = z.object({
  signedOffByStakeholderId: z.string().uuid().optional().nullable(),
  signedOffAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  signoffNotes: z.string().max(2000).optional().nullable(),
});

export const recordTaskSignoff = authedAction
  .schema(
    recordSignoffSchema.extend({ taskId: z.string().uuid() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsedInput.taskId),
        eq(projectTasks.organizationId, ctx.organization.id),
      ),
      columns: { id: true, projectId: true, stakeholderId: true },
    });
    if (!existing) throw new PublicError("Task not found");
    const signedOffBy =
      parsedInput.signedOffByStakeholderId ?? existing.stakeholderId;
    // Mostly a sanity guard — the operator could record a sign-off
    // with no stakeholder, but it's barely meaningful.
    const signedOffAt = parsedInput.signedOffAt
      ? new Date(parsedInput.signedOffAt + "T12:00:00Z")
      : new Date();
    await db
      .update(projectTasks)
      .set({
        signedOffAt,
        signedOffByStakeholderId: signedOffBy,
        signoffNotes: parsedInput.signoffNotes?.trim() || null,
        // Sign-off implies the operator IS requiring it — flip the
        // flag on if it wasn't already, so the UI badge logic stays
        // coherent.
        requiresSignoff: true,
        updatedAt: new Date(),
      })
      .where(eq(projectTasks.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const clearTaskSignoff = authedAction
  .schema(z.object({ taskId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, parsedInput.taskId),
        eq(projectTasks.organizationId, ctx.organization.id),
      ),
      columns: { id: true, projectId: true },
    });
    if (!existing) throw new PublicError("Task not found");
    await db
      .update(projectTasks)
      .set({
        signedOffAt: null,
        signedOffByStakeholderId: null,
        signoffNotes: null,
        updatedAt: new Date(),
      })
      .where(eq(projectTasks.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const recordMilestoneSignoff = authedAction
  .schema(
    recordSignoffSchema.extend({ milestoneId: z.string().uuid() }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectMilestones.findFirst({
      where: and(
        eq(projectMilestones.id, parsedInput.milestoneId),
        eq(projectMilestones.organizationId, ctx.organization.id),
      ),
      columns: { id: true, projectId: true, stakeholderId: true },
    });
    if (!existing) throw new PublicError("Milestone not found");
    const signedOffBy =
      parsedInput.signedOffByStakeholderId ?? existing.stakeholderId;
    const signedOffAt = parsedInput.signedOffAt
      ? new Date(parsedInput.signedOffAt + "T12:00:00Z")
      : new Date();
    await db
      .update(projectMilestones)
      .set({
        signedOffAt,
        signedOffByStakeholderId: signedOffBy,
        signoffNotes: parsedInput.signoffNotes?.trim() || null,
        requiresSignoff: true,
        updatedAt: new Date(),
      })
      .where(eq(projectMilestones.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });

export const clearMilestoneSignoff = authedAction
  .schema(z.object({ milestoneId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const existing = await db.query.projectMilestones.findFirst({
      where: and(
        eq(projectMilestones.id, parsedInput.milestoneId),
        eq(projectMilestones.organizationId, ctx.organization.id),
      ),
      columns: { id: true, projectId: true },
    });
    if (!existing) throw new PublicError("Milestone not found");
    await db
      .update(projectMilestones)
      .set({
        signedOffAt: null,
        signedOffByStakeholderId: null,
        signoffNotes: null,
        updatedAt: new Date(),
      })
      .where(eq(projectMilestones.id, existing.id));
    revalidateProject(existing.projectId);
    return { ok: true };
  });
