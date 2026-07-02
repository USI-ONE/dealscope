"use server";

/**
 * Server actions for the per-client security posture checklist.
 *
 *   createSecurityReview  — append a fresh snapshot (with answers).
 *   updateSecurityReview  — edit a draft / fix typos on an existing review.
 *
 * Reviews are append-only by design (one row per review_date), so the
 * "save" UI gesture creates a new row rather than mutating the last
 * one. update is for the typo case only.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clients, clientSecurityReviews } from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";
import { SECURITY_QUESTIONS } from "@/lib/security-review/checklist";

const ANSWER_STATUSES = ["yes", "partial", "no", "na"] as const;

const answerSchema = z.object({
  status: z.enum(ANSWER_STATUSES),
  detail: z.string().max(2000).default(""),
  autoFilled: z.boolean().default(false),
});

/** Validate that the answers payload covers all known questions. We
 *  accept extra keys (for forward compat with newer checklists) but
 *  require every question.id from the current registry. */
const answersSchema = z
  .record(z.string(), answerSchema)
  .superRefine((val, ctx) => {
    for (const q of SECURITY_QUESTIONS) {
      if (!val[q.id]) {
        ctx.addIssue({
          code: "custom",
          message: `Missing answer for ${q.id}`,
        });
      }
    }
  });

const createSchema = z.object({
  clientId: z.string().uuid(),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nextReviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  totalSeats: z.number().int().nullable().optional(),
  totalDevices: z.number().int().nullable().optional(),
  answers: answersSchema,
  generalNotes: z.string().max(10000).nullable().optional(),
});

export const createSecurityReview = authedAction
  .schema(createSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const client = await db.query.clients.findFirst({
      where: and(
        eq(clients.id, parsedInput.clientId),
        eq(clients.organizationId, ctx.organization.id),
      ),
    });
    if (!client) throw new PublicError("Client not found");

    const [created] = await db
      .insert(clientSecurityReviews)
      .values({
        organizationId: ctx.organization.id,
        clientId: parsedInput.clientId,
        reviewDate: parsedInput.reviewDate,
        reviewedByMembershipId: ctx.membership.id,
        nextReviewDate: parsedInput.nextReviewDate ?? null,
        totalSeats: parsedInput.totalSeats ?? null,
        totalDevices: parsedInput.totalDevices ?? null,
        answersJson: parsedInput.answers,
        generalNotes: parsedInput.generalNotes ?? null,
      })
      .returning({ id: clientSecurityReviews.id });

    revalidatePath(`/clients/${parsedInput.clientId}`);
    revalidatePath(`/clients/${parsedInput.clientId}/security`);
    return { ok: true, reviewId: created.id };
  });

const updateSchema = z.object({
  reviewId: z.string().uuid(),
  nextReviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  answers: answersSchema.optional(),
  generalNotes: z.string().max(10000).nullable().optional(),
});

export const updateSecurityReview = authedAction
  .schema(updateSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const existing = await db.query.clientSecurityReviews.findFirst({
      where: and(
        eq(clientSecurityReviews.id, parsedInput.reviewId),
        eq(clientSecurityReviews.organizationId, ctx.organization.id),
      ),
    });
    if (!existing) throw new PublicError("Review not found");

    await db
      .update(clientSecurityReviews)
      .set({
        nextReviewDate:
          parsedInput.nextReviewDate !== undefined
            ? parsedInput.nextReviewDate
            : existing.nextReviewDate,
        answersJson: parsedInput.answers ?? existing.answersJson,
        generalNotes:
          parsedInput.generalNotes !== undefined
            ? parsedInput.generalNotes
            : existing.generalNotes,
        updatedAt: new Date(),
      })
      .where(eq(clientSecurityReviews.id, parsedInput.reviewId));

    revalidatePath(`/clients/${existing.clientId}`);
    revalidatePath(`/clients/${existing.clientId}/security`);
    return { ok: true };
  });
