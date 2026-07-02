"use server";

/**
 * User provisioning (onboarding / offboarding / change) workflow actions.
 *
 * The headline behaviour: when a request hits "handed_off" the requestor
 * gets a customer-facing completion document with concrete details —
 * username, login URL, MFA setup link, asset tags, license SKUs, etc.
 * That document is generated from the task `result` fields the PS team
 * captures during fulfillment, so there's never confusion about whether
 * the work was done or how the user logs in.
 *
 * Status machine:
 *   draft → submitted → in_progress → ready_for_handoff → handed_off
 *   * → cancelled
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  clients,
  userProvisioningRequests,
  type ProvisioningTask,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { seedTasksForKind } from "@/lib/user-provisioning/task-templates";

async function loadRequest(id: string, organizationId: string) {
  const r = await db.query.userProvisioningRequests.findFirst({
    where: and(
      eq(userProvisioningRequests.id, id),
      eq(userProvisioningRequests.organizationId, organizationId),
    ),
  });
  if (!r) throw new PublicError("Request not found");
  return r;
}

async function nextRefCode(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `UPR-${year}-`;
  const [{ count } = { count: 0 }] = await db
    .select({
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(userProvisioningRequests)
    .where(
      and(
        eq(userProvisioningRequests.organizationId, organizationId),
        sql`${userProvisioningRequests.refCode} LIKE ${prefix + "%"}`,
      ),
    );
  return `${prefix}${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/* ============================================================================
 * CREATE / UPDATE
 * ========================================================================== */
const baseSchema = z.object({
  kind: z.enum(["onboarding", "offboarding", "change"]),
  clientId: z.string().uuid().optional().nullable(),
  subjectFullName: z.string().min(1).max(200),
  subjectEmail: z.string().email().max(320).optional().nullable(),
  subjectTitle: z.string().max(200).optional().nullable(),
  subjectDepartment: z.string().max(200).optional().nullable(),
  subjectManagerName: z.string().max(200).optional().nullable(),
  subjectManagerEmail: z.string().email().max(320).optional().nullable(),
  subjectPhone: z.string().max(80).optional().nullable(),
  subjectLocation: z.string().max(200).optional().nullable(),
  startDate: z.string().optional().nullable(),
  copyFromUser: z.string().max(200).optional().nullable(),
  lastDay: z.string().optional().nullable(),
  mailboxDisposition: z.string().max(120).optional().nullable(),
  mailboxForwardTo: z.string().max(320).optional().nullable(),
  hardwareDisposition: z.string().max(120).optional().nullable(),
  dataRetentionPlan: z.string().max(10_000).optional().nullable(),
  notifyRecipientName: z.string().max(200).optional().nullable(),
  notifyRecipientEmail: z.string().email().max(320).optional().nullable(),
  summary: z.string().max(20_000).optional().nullable(),
  notes: z.string().max(50_000).optional().nullable(),
});

export const createUserProvisioningRequest = authedAction
  .schema(baseSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    if (parsedInput.clientId) {
      const c = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      });
      if (!c) throw new PublicError("Client not found");
    }
    const refCode = await nextRefCode(ctx.organization.id);
    const tasks = seedTasksForKind(parsedInput.kind);
    const [created] = await db
      .insert(userProvisioningRequests)
      .values({
        organizationId: ctx.organization.id,
        refCode,
        kind: parsedInput.kind,
        status: "draft",
        clientId: parsedInput.clientId ?? null,
        subjectFullName: parsedInput.subjectFullName.trim(),
        subjectEmail: parsedInput.subjectEmail?.trim() || null,
        subjectTitle: parsedInput.subjectTitle?.trim() || null,
        subjectDepartment: parsedInput.subjectDepartment?.trim() || null,
        subjectManagerName: parsedInput.subjectManagerName?.trim() || null,
        subjectManagerEmail: parsedInput.subjectManagerEmail?.trim() || null,
        subjectPhone: parsedInput.subjectPhone?.trim() || null,
        subjectLocation: parsedInput.subjectLocation?.trim() || null,
        startDate: parsedInput.startDate || null,
        copyFromUser: parsedInput.copyFromUser?.trim() || null,
        lastDay: parsedInput.lastDay || null,
        mailboxDisposition: parsedInput.mailboxDisposition?.trim() || null,
        mailboxForwardTo: parsedInput.mailboxForwardTo?.trim() || null,
        hardwareDisposition: parsedInput.hardwareDisposition?.trim() || null,
        dataRetentionPlan: parsedInput.dataRetentionPlan?.trim() || null,
        notifyRecipientName: parsedInput.notifyRecipientName?.trim() || null,
        notifyRecipientEmail: parsedInput.notifyRecipientEmail?.trim() || null,
        summary: parsedInput.summary?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        requestedByMembershipId: ctx.membership.id,
        tasks,
      })
      .returning();
    revalidatePath("/user-requests");
    return { request: created };
  });

export const updateUserProvisioningRequest = authedAction
  .schema(baseSchema.partial().extend({ requestId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const r = await loadRequest(parsedInput.requestId, ctx.organization.id);
    if (r.status === "handed_off" || r.status === "cancelled") {
      throw new PublicError(
        `Cannot edit a ${r.status} request. Open a new one if a change is needed.`,
      );
    }
    await db
      .update(userProvisioningRequests)
      .set({
        kind: parsedInput.kind ?? r.kind,
        clientId:
          parsedInput.clientId !== undefined ? parsedInput.clientId : r.clientId,
        subjectFullName:
          parsedInput.subjectFullName?.trim() ?? r.subjectFullName,
        subjectEmail:
          parsedInput.subjectEmail !== undefined
            ? parsedInput.subjectEmail?.trim() || null
            : r.subjectEmail,
        subjectTitle:
          parsedInput.subjectTitle !== undefined
            ? parsedInput.subjectTitle?.trim() || null
            : r.subjectTitle,
        subjectDepartment:
          parsedInput.subjectDepartment !== undefined
            ? parsedInput.subjectDepartment?.trim() || null
            : r.subjectDepartment,
        subjectManagerName:
          parsedInput.subjectManagerName !== undefined
            ? parsedInput.subjectManagerName?.trim() || null
            : r.subjectManagerName,
        subjectManagerEmail:
          parsedInput.subjectManagerEmail !== undefined
            ? parsedInput.subjectManagerEmail?.trim() || null
            : r.subjectManagerEmail,
        subjectPhone:
          parsedInput.subjectPhone !== undefined
            ? parsedInput.subjectPhone?.trim() || null
            : r.subjectPhone,
        subjectLocation:
          parsedInput.subjectLocation !== undefined
            ? parsedInput.subjectLocation?.trim() || null
            : r.subjectLocation,
        startDate:
          parsedInput.startDate !== undefined
            ? parsedInput.startDate || null
            : r.startDate,
        copyFromUser:
          parsedInput.copyFromUser !== undefined
            ? parsedInput.copyFromUser?.trim() || null
            : r.copyFromUser,
        lastDay:
          parsedInput.lastDay !== undefined
            ? parsedInput.lastDay || null
            : r.lastDay,
        mailboxDisposition:
          parsedInput.mailboxDisposition !== undefined
            ? parsedInput.mailboxDisposition?.trim() || null
            : r.mailboxDisposition,
        mailboxForwardTo:
          parsedInput.mailboxForwardTo !== undefined
            ? parsedInput.mailboxForwardTo?.trim() || null
            : r.mailboxForwardTo,
        hardwareDisposition:
          parsedInput.hardwareDisposition !== undefined
            ? parsedInput.hardwareDisposition?.trim() || null
            : r.hardwareDisposition,
        dataRetentionPlan:
          parsedInput.dataRetentionPlan !== undefined
            ? parsedInput.dataRetentionPlan?.trim() || null
            : r.dataRetentionPlan,
        notifyRecipientName:
          parsedInput.notifyRecipientName !== undefined
            ? parsedInput.notifyRecipientName?.trim() || null
            : r.notifyRecipientName,
        notifyRecipientEmail:
          parsedInput.notifyRecipientEmail !== undefined
            ? parsedInput.notifyRecipientEmail?.trim() || null
            : r.notifyRecipientEmail,
        summary:
          parsedInput.summary !== undefined
            ? parsedInput.summary?.trim() || null
            : r.summary,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : r.notes,
        updatedAt: new Date(),
      })
      .where(eq(userProvisioningRequests.id, r.id));
    revalidatePath(`/user-requests/${r.id}`);
    revalidatePath("/user-requests");
    return { ok: true };
  });

/* ============================================================================
 * TASK MUTATIONS — surgical updates against the JSONB tasks array.
 * ========================================================================== */
export const updateProvisioningTask = authedAction
  .schema(
    z.object({
      requestId: z.string().uuid(),
      taskId: z.string().min(1).max(40),
      patch: z.object({
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(2_000).optional().nullable(),
        applicable: z.boolean().optional(),
        completed: z.boolean().optional(),
        completionNotes: z.string().max(10_000).optional().nullable(),
        result: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      }),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const r = await loadRequest(parsedInput.requestId, ctx.organization.id);
    const now = new Date();
    const tasks: ProvisioningTask[] = r.tasks.map((t) => {
      if (t.id !== parsedInput.taskId) return t;
      const patch = parsedInput.patch;
      const completedNow =
        patch.completed === true && !t.completed
          ? {
              completedAt: now.toISOString(),
              completedByMembershipId: ctx.membership.id,
            }
          : patch.completed === false && t.completed
            ? {
                completedAt: null,
                completedByMembershipId: null,
              }
            : {};
      return {
        ...t,
        title: patch.title ?? t.title,
        description:
          patch.description !== undefined ? patch.description ?? undefined : t.description,
        applicable: patch.applicable ?? t.applicable,
        completed: patch.completed ?? t.completed,
        completionNotes:
          patch.completionNotes !== undefined
            ? patch.completionNotes?.trim() || null
            : t.completionNotes,
        result: patch.result ? { ...t.result, ...patch.result } : t.result,
        ...completedNow,
      };
    });
    await db
      .update(userProvisioningRequests)
      .set({ tasks, updatedAt: now })
      .where(eq(userProvisioningRequests.id, r.id));
    revalidatePath(`/user-requests/${r.id}`);
    return { ok: true };
  });

export const addProvisioningTask = authedAction
  .schema(
    z.object({
      requestId: z.string().uuid(),
      title: z.string().min(1).max(300),
      description: z.string().max(2_000).optional().nullable(),
      category: z
        .enum([
          "identity",
          "mailbox",
          "hardware",
          "license",
          "access",
          "training",
          "communication",
          "data",
          "other",
        ])
        .default("other"),
      required: z.boolean().default(false),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const r = await loadRequest(parsedInput.requestId, ctx.organization.id);
    const task: ProvisioningTask = {
      id: nanoid(8),
      title: parsedInput.title.trim(),
      description: parsedInput.description?.trim() || undefined,
      category: parsedInput.category,
      required: parsedInput.required,
      applicable: true,
      completed: false,
      completedAt: null,
      completedByMembershipId: null,
      completionNotes: null,
      result: {},
    };
    await db
      .update(userProvisioningRequests)
      .set({ tasks: [...r.tasks, task], updatedAt: new Date() })
      .where(eq(userProvisioningRequests.id, r.id));
    revalidatePath(`/user-requests/${r.id}`);
    return { task };
  });

export const removeProvisioningTask = authedAction
  .schema(
    z.object({
      requestId: z.string().uuid(),
      taskId: z.string().min(1).max(40),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const r = await loadRequest(parsedInput.requestId, ctx.organization.id);
    const next = r.tasks.filter((t) => t.id !== parsedInput.taskId);
    await db
      .update(userProvisioningRequests)
      .set({ tasks: next, updatedAt: new Date() })
      .where(eq(userProvisioningRequests.id, r.id));
    revalidatePath(`/user-requests/${r.id}`);
    return { ok: true };
  });

/* ============================================================================
 * STATUS TRANSITIONS
 * ========================================================================== */
type Status =
  | "draft"
  | "submitted"
  | "in_progress"
  | "ready_for_handoff"
  | "handed_off"
  | "cancelled";

const ALLOWED: Record<Status, Status[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_progress", "cancelled"],
  in_progress: ["ready_for_handoff", "cancelled"],
  ready_for_handoff: ["handed_off", "in_progress"],
  handed_off: [],
  cancelled: [],
};

export const transitionProvisioningStatus = authedAction
  .schema(
    z.object({
      requestId: z.string().uuid(),
      to: z.enum([
        "draft",
        "submitted",
        "in_progress",
        "ready_for_handoff",
        "handed_off",
        "cancelled",
      ]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const r = await loadRequest(parsedInput.requestId, ctx.organization.id);
    const allowed = ALLOWED[r.status as Status] ?? [];
    if (!allowed.includes(parsedInput.to)) {
      throw new PublicError(
        `Can't move "${r.status}" → "${parsedInput.to}". Allowed: ${allowed.join(", ") || "(none)"}`,
      );
    }

    // Gate: can only mark ready_for_handoff if every required +
    // applicable task is complete.
    if (parsedInput.to === "ready_for_handoff") {
      const stillOpen = r.tasks.filter(
        (t) => t.required && t.applicable && !t.completed,
      );
      if (stillOpen.length > 0) {
        throw new PublicError(
          `${stillOpen.length} required task${stillOpen.length === 1 ? "" : "s"} not yet complete: ${stillOpen
            .slice(0, 3)
            .map((t) => `"${t.title}"`)
            .join(", ")}${stillOpen.length > 3 ? "…" : ""}`,
        );
      }
    }

    const now = new Date();
    const updates: Record<string, unknown> = {
      status: parsedInput.to,
      updatedAt: now,
    };
    if (parsedInput.to === "submitted" && !r.submittedAt)
      updates.submittedAt = now;
    if (parsedInput.to === "in_progress") {
      if (!r.startedAt) updates.startedAt = now;
      updates.fulfilledByMembershipId = ctx.membership.id;
    }
    if (parsedInput.to === "handed_off") {
      updates.handedOffAt = now;
    }
    await db
      .update(userProvisioningRequests)
      .set(updates)
      .where(eq(userProvisioningRequests.id, r.id));
    revalidatePath(`/user-requests/${r.id}`);
    revalidatePath("/user-requests");
    return { ok: true };
  });

/* ============================================================================
 * DELETE — drafts only.
 * ========================================================================== */
export const deleteUserProvisioningRequest = authedAction
  .schema(z.object({ requestId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    const r = await loadRequest(parsedInput.requestId, ctx.organization.id);
    if (r.status !== "draft") {
      throw new PublicError(
        "Only drafts can be deleted. Cancel instead to preserve audit history.",
      );
    }
    await db
      .delete(userProvisioningRequests)
      .where(eq(userProvisioningRequests.id, r.id));
    revalidatePath("/user-requests");
    return { ok: true };
  });

/* ============================================================================
 * READ HELPERS
 * ========================================================================== */
export async function listUserProvisioningRequests(organizationId: string) {
  return db
    .select()
    .from(userProvisioningRequests)
    .where(eq(userProvisioningRequests.organizationId, organizationId))
    .orderBy(desc(userProvisioningRequests.createdAt));
}
