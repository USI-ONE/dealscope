"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clientProcedureRuns,
  clientProcedures,
  clients,
  type ProcedureStep,
  type ProcedureStepResult,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { DEVICE_PROCEDURE_TEMPLATES } from "@/lib/procedures/device-templates";

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

async function loadProcedure(procedureId: string, organizationId: string) {
  const p = await db.query.clientProcedures.findFirst({
    where: and(
      eq(clientProcedures.id, procedureId),
      eq(clientProcedures.organizationId, organizationId),
    ),
  });
  if (!p) throw new PublicError("Procedure not found");
  return p;
}

async function loadRun(runId: string, organizationId: string) {
  const r = await db.query.clientProcedureRuns.findFirst({
    where: and(
      eq(clientProcedureRuns.id, runId),
      eq(clientProcedureRuns.organizationId, organizationId),
    ),
  });
  if (!r) throw new PublicError("Procedure run not found");
  return r;
}

const stepSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(1000),
  hint: z.string().max(2000).optional(),
});

const procedureSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().min(2).max(200),
  kind: z
    .enum([
      "onboarding",
      "offboarding",
      "device_onboarding",
      "device_offboarding",
      "password_rotation",
      "firmware_update",
      "cert_renewal",
      "dr_test",
      "incident_response",
      "audit",
      "monthly_review",
      "quarterly_review",
      "annual_review",
      "other",
    ])
    .default("other"),
  description: z.string().max(20_000).optional().nullable(),
  steps: z.array(stepSchema).default([]),
  ownerMembershipId: z.string().uuid().optional().nullable(),
  scheduleNotes: z.string().max(2000).optional().nullable(),
});

export const createProcedure = authedAction
  .schema(procedureSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);
    const [created] = await db
      .insert(clientProcedures)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        description: parsedInput.description?.trim() || null,
        steps: parsedInput.steps,
        ownerMembershipId: parsedInput.ownerMembershipId || null,
        scheduleNotes: parsedInput.scheduleNotes?.trim() || null,
      })
      .returning();
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { procedure: created };
  });

export const updateProcedure = authedAction
  .schema(procedureSchema.extend({ procedureId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await loadProcedure(parsedInput.procedureId, ctx.organization.id);
    await db
      .update(clientProcedures)
      .set({
        title: parsedInput.title.trim(),
        kind: parsedInput.kind,
        description: parsedInput.description?.trim() || null,
        steps: parsedInput.steps,
        ownerMembershipId: parsedInput.ownerMembershipId || null,
        scheduleNotes: parsedInput.scheduleNotes?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(clientProcedures.id, parsedInput.procedureId));
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

export const deleteProcedure = authedAction
  .schema(
    z.object({
      procedureId: z.string().uuid(),
      clientId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    // Delete cascade removes runs.
    await db
      .delete(clientProcedures)
      .where(
        and(
          eq(clientProcedures.id, parsedInput.procedureId),
          eq(clientProcedures.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { ok: true };
  });

/* ============================================================================
 * RUN WORKFLOW
 * ========================================================================== */

export const startProcedureRun = authedAction
  .schema(z.object({ procedureId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const procedure = await loadProcedure(
      parsedInput.procedureId,
      ctx.organization.id,
    );

    // Snapshot the steps into the run so historical runs stay readable
    // even if the procedure is later edited.
    const steps = (procedure.steps ?? []) as ProcedureStep[];
    const stepResults: ProcedureStepResult[] = steps.map((s, idx) => ({
      stepIndex: idx,
      stepText: s.text,
      done: false,
      doneAt: null,
      notes: null,
    }));

    const [run] = await db
      .insert(clientProcedureRuns)
      .values({
        organizationId: ctx.organization.id,
        clientId: procedure.clientId,
        procedureId: procedure.id,
        status: "in_progress",
        startedByMembershipId: ctx.membership.id,
        stepResults,
      })
      .returning();
    revalidatePath(`/clients/${procedure.clientId}`);
    return { run };
  });

export const updateRunStep = authedAction
  .schema(
    z.object({
      runId: z.string().uuid(),
      stepIndex: z.number().int().nonnegative(),
      done: z.boolean(),
      notes: z.string().max(2000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const run = await loadRun(parsedInput.runId, ctx.organization.id);
    if (run.status !== "in_progress") {
      throw new PublicError("Run is no longer in progress");
    }
    const updated = (run.stepResults as ProcedureStepResult[]).map((r) =>
      r.stepIndex === parsedInput.stepIndex
        ? {
            ...r,
            done: parsedInput.done,
            doneAt: parsedInput.done ? new Date().toISOString() : null,
            notes: parsedInput.notes?.trim() || r.notes,
          }
        : r,
    );
    await db
      .update(clientProcedureRuns)
      .set({ stepResults: updated, updatedAt: new Date() })
      .where(eq(clientProcedureRuns.id, parsedInput.runId));
    revalidatePath(`/clients/${run.clientId}`);
    return { ok: true };
  });

export const completeProcedureRun = authedAction
  .schema(
    z.object({
      runId: z.string().uuid(),
      outcomeNotes: z.string().max(20_000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const run = await loadRun(parsedInput.runId, ctx.organization.id);
    if (run.status !== "in_progress") {
      throw new PublicError("Run is no longer in progress");
    }
    const completedAt = new Date();
    const durationMinutes = Math.round(
      (completedAt.getTime() - new Date(run.startedAt).getTime()) / 60_000,
    );
    await db
      .update(clientProcedureRuns)
      .set({
        status: "completed",
        completedAt,
        outcomeNotes: parsedInput.outcomeNotes?.trim() || null,
        durationMinutes,
        updatedAt: completedAt,
      })
      .where(eq(clientProcedureRuns.id, parsedInput.runId));
    // Update procedure.lastRunAt convenience cache.
    await db
      .update(clientProcedures)
      .set({ lastRunAt: completedAt, updatedAt: completedAt })
      .where(eq(clientProcedures.id, run.procedureId));
    revalidatePath(`/clients/${run.clientId}`);
    return { ok: true };
  });

/**
 * Seed the default device onboarding + offboarding procedures for a client
 * if not already present. Skips templates whose `kind` already exists on
 * the client — so re-running is safe and only fills gaps.
 *
 * Returns { created: number, skipped: number } so the UI can show what
 * actually happened.
 */
export const seedDeviceProcedures = authedAction
  .schema(z.object({ clientId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    await assertClient(parsedInput.clientId, ctx.organization.id);

    const existing = await db
      .select({ kind: clientProcedures.kind })
      .from(clientProcedures)
      .where(
        and(
          eq(clientProcedures.clientId, parsedInput.clientId),
          eq(clientProcedures.organizationId, ctx.organization.id),
        ),
      );
    const haveKinds = new Set(existing.map((e) => e.kind));

    let created = 0;
    let skipped = 0;
    for (const tpl of DEVICE_PROCEDURE_TEMPLATES) {
      if (haveKinds.has(tpl.kind)) {
        skipped++;
        continue;
      }
      await db.insert(clientProcedures).values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        title: tpl.title,
        kind: tpl.kind,
        description: tpl.description,
        steps: tpl.steps,
        scheduleNotes: tpl.scheduleNotes,
      });
      created++;
    }
    revalidatePath(`/clients/${parsedInput.clientId}`);
    return { created, skipped };
  });

export const abandonProcedureRun = authedAction
  .schema(
    z.object({
      runId: z.string().uuid(),
      reason: z.string().max(2000).optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const run = await loadRun(parsedInput.runId, ctx.organization.id);
    if (run.status !== "in_progress") {
      throw new PublicError("Run is no longer in progress");
    }
    await db
      .update(clientProcedureRuns)
      .set({
        status: "abandoned",
        completedAt: new Date(),
        outcomeNotes: parsedInput.reason?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(clientProcedureRuns.id, parsedInput.runId));
    revalidatePath(`/clients/${run.clientId}`);
    return { ok: true };
  });
