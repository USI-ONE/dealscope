"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientEvents,
  clientRecurringTasks,
  clients,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

async function assertClient(clientId: string, organizationId: string) {
  const c = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, clientId),
      eq(clients.organizationId, organizationId),
    ),
  });
  if (!c) throw new PublicError("Client not found");
  return c;
}

/* ============================================================================
 * RECURRING TASKS
 * ========================================================================== */
const recurringTaskSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(2).max(200),
  kind: z
    .enum(["review", "audit", "renewal", "maintenance", "compliance", "other"])
    .default("other"),
  cadenceDays: z.number().int().min(1).max(3650).default(90),
  nextDueAt: z.string().min(1),
  ownerMembershipId: z.string().uuid().optional().nullable(),
  procedureId: z.string().uuid().optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
});

export const createRecurringTask = authedAction
  .schema(recurringTaskSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientRecurringTasks)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        cadenceDays: parsedInput.cadenceDays,
        nextDueAt: new Date(parsedInput.nextDueAt),
        ownerMembershipId: parsedInput.ownerMembershipId || null,
        procedureId: parsedInput.procedureId || null,
        notes: parsedInput.notes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/upcoming");
    return { task: created };
  });

export const updateRecurringTask = authedAction
  .schema(recurringTaskSchema.extend({ taskId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clientRecurringTasks)
      .set({
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        cadenceDays: parsedInput.cadenceDays,
        nextDueAt: new Date(parsedInput.nextDueAt),
        ownerMembershipId: parsedInput.ownerMembershipId || null,
        procedureId: parsedInput.procedureId || null,
        notes: parsedInput.notes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientRecurringTasks.id, parsedInput.taskId),
          eq(clientRecurringTasks.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/upcoming");
    return { ok: true };
  });

export const completeRecurringTask = authedAction
  .schema(
    z.object({
      taskId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const task = await db.query.clientRecurringTasks.findFirst({
      where: and(
        eq(clientRecurringTasks.id, parsedInput.taskId),
        eq(clientRecurringTasks.organizationId, ctx.organization.id),
      ),
    });
    if (!task) throw new PublicError("Task not found");
    const now = new Date();
    const next = new Date(now.getTime() + task.cadenceDays * 86_400_000);
    await db
      .update(clientRecurringTasks)
      .set({
        lastDoneAt: now,
        nextDueAt: next,
        updatedAt: now,
      })
      .where(eq(clientRecurringTasks.id, parsedInput.taskId));
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/upcoming");
    return { ok: true, nextDueAt: next.toISOString() };
  });

export const deleteRecurringTask = authedAction
  .schema(
    z.object({
      taskId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .delete(clientRecurringTasks)
      .where(
        and(
          eq(clientRecurringTasks.id, parsedInput.taskId),
          eq(clientRecurringTasks.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath("/upcoming");
    return { ok: true };
  });

/* ============================================================================
 * EVENTS (change / incident log)
 * ========================================================================== */
const eventSchema = z.object({
  clientId: z.string().uuid(),
  occurredAt: z.string().min(1),
  kind: z
    .enum([
      "change",
      "incident",
      "maintenance",
      "discovery",
      "risk_resolution",
      "outage",
      "deployment",
      "other",
    ])
    .default("change"),
  severity: z
    .enum(["critical", "high", "medium", "low", "info"])
    .default("info"),
  title: z.string().min(2).max(200),
  narrative: z.string().max(50_000).optional().nullable(),
  rootCause: z.string().max(20_000).optional().nullable(),
  resolution: z.string().max(20_000).optional().nullable(),
  durationMinutes: z.number().int().nonnegative().optional().nullable(),
  affectedSystems: z.array(z.string().max(200)).default([]),
  resolvedAt: z.string().optional().nullable(),
});

export const createClientEvent = authedAction
  .schema(eventSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientEvents)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        occurredAt: new Date(parsedInput.occurredAt),
        kind: parsedInput.kind,
        severity: parsedInput.severity,
        title: parsedInput.title.trim(),
        narrative: parsedInput.narrative?.trim() || null,
        rootCause: parsedInput.rootCause?.trim() || null,
        resolution: parsedInput.resolution?.trim() || null,
        durationMinutes: parsedInput.durationMinutes ?? null,
        affectedSystems: parsedInput.affectedSystems,
        recordedByMembershipId: ctx.membership.id,
        resolvedAt: parsedInput.resolvedAt
          ? new Date(parsedInput.resolvedAt)
          : null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { event: created };
  });

export const updateClientEvent = authedAction
  .schema(eventSchema.extend({ eventId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .update(clientEvents)
      .set({
        occurredAt: new Date(parsedInput.occurredAt),
        kind: parsedInput.kind,
        severity: parsedInput.severity,
        title: parsedInput.title.trim(),
        narrative: parsedInput.narrative?.trim() || null,
        rootCause: parsedInput.rootCause?.trim() || null,
        resolution: parsedInput.resolution?.trim() || null,
        durationMinutes: parsedInput.durationMinutes ?? null,
        affectedSystems: parsedInput.affectedSystems,
        resolvedAt: parsedInput.resolvedAt
          ? new Date(parsedInput.resolvedAt)
          : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(clientEvents.id, parsedInput.eventId),
          eq(clientEvents.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteClientEvent = authedAction
  .schema(
    z.object({
      eventId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await db
      .delete(clientEvents)
      .where(
        and(
          eq(clientEvents.id, parsedInput.eventId),
          eq(clientEvents.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });
