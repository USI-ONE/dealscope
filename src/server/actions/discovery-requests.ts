"use server";

/**
 * Client info requests (staff side): create a no-login link with a set of
 * open questions, email it, resend, close. The client side lives in
 * app/request/[token].
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/db";
import { discoveryInfoRequests } from "@/db/schema";
import { appBaseUrl } from "@/lib/email/account";
import { sendInfoRequestEmail } from "@/lib/email/discovery";
import { REQUEST_TTL_DAYS } from "@/lib/discovery/info-request";
import { getProject, loadProjectData, walkTitle } from "@/lib/discovery/load";
import { templateIndex } from "@/lib/discovery/templates";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

function requestLink(token: string) {
  return `${appBaseUrl()}/request/${token}`;
}

async function emailRequest(r: typeof discoveryInfoRequests.$inferSelect, fromName: string) {
  if (!r.recipientEmail) return { emailed: false, error: "No email address" as string | null };
  const project = await getProject(r.projectId, r.organizationId);
  if (!project) return { emailed: false, error: "Site walk not found" };
  const { answers } = await loadProjectData(project);
  const t = walkTitle(project, answers);
  try {
    await sendInfoRequestEmail({
      to: r.recipientEmail,
      toName: r.recipientName,
      fromName,
      company: t.subtitle ? t.title : "",
      site: t.subtitle || t.title,
      count: r.questionKeys.length,
      message: r.message,
      link: requestLink(r.token),
      expires: r.expiresAt,
    });
    await db.update(discoveryInfoRequests).set({ sentAt: new Date(), updatedAt: new Date() }).where(eq(discoveryInfoRequests.id, r.id));
    return { emailed: true, error: null };
  } catch (err) {
    console.error("[info-request] email failed", err);
    return { emailed: false, error: err instanceof Error ? err.message : "Email failed" };
  }
}

export const createInfoRequest = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      recipientName: z.string().trim().max(200).nullable().optional(),
      recipientEmail: z.string().trim().email().max(320).nullable().optional().or(z.literal("")),
      message: z.string().max(2000).nullable().optional(),
      questionKeys: z.array(z.string().max(120)).min(1).max(80),
      send: z.boolean().default(true),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const project = await getProject(parsedInput.projectId, ctx.organization.id);
    if (!project) throw new PublicError("Site walk not found");
    const idx = templateIndex((await loadProjectData(project)).template);
    const keys = [...new Set(parsedInput.questionKeys)].filter((k) => idx.fields.has(k));
    if (!keys.length) throw new PublicError("Pick at least one question");

    const [r] = await db
      .insert(discoveryInfoRequests)
      .values({
        organizationId: ctx.organization.id,
        projectId: project.id,
        token: nanoid(32),
        recipientName: parsedInput.recipientName?.trim() || null,
        recipientEmail: parsedInput.recipientEmail?.trim() || null,
        message: parsedInput.message?.trim() || null,
        questionKeys: keys,
        expiresAt: new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000),
        createdByMembershipId: ctx.membership.id,
      })
      .returning();

    const mail = parsedInput.send && r.recipientEmail ? await emailRequest(r, ctx.user.name ?? ctx.user.email) : { emailed: false, error: null };
    revalidatePath(`/discovery/${project.id}/requests`);
    return { link: requestLink(r.token), ...mail };
  });

export const resendInfoRequest = authedAction
  .schema(z.object({ projectId: z.string().uuid(), requestId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const r = await db.query.discoveryInfoRequests.findFirst({
      where: and(
        eq(discoveryInfoRequests.id, parsedInput.requestId),
        eq(discoveryInfoRequests.projectId, parsedInput.projectId),
        eq(discoveryInfoRequests.organizationId, ctx.organization.id),
      ),
    });
    if (!r) throw new PublicError("Request not found");
    if (!r.recipientEmail) throw new PublicError("This request has no email address — copy the link instead");
    // Resending also extends the deadline.
    const expiresAt = new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000);
    await db
      .update(discoveryInfoRequests)
      .set({ expiresAt, status: r.status === "closed" ? "open" : r.status, updatedAt: new Date() })
      .where(eq(discoveryInfoRequests.id, r.id));
    const mail = await emailRequest({ ...r, expiresAt }, ctx.user.name ?? ctx.user.email);
    if (mail.error) throw new PublicError(`Couldn’t send: ${mail.error}`);
    revalidatePath(`/discovery/${parsedInput.projectId}/requests`);
    return { ok: true };
  });

export const closeInfoRequest = authedAction
  .schema(z.object({ projectId: z.string().uuid(), requestId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    await db
      .update(discoveryInfoRequests)
      .set({ status: "closed", updatedAt: new Date() })
      .where(
        and(
          eq(discoveryInfoRequests.id, parsedInput.requestId),
          eq(discoveryInfoRequests.projectId, parsedInput.projectId),
          eq(discoveryInfoRequests.organizationId, ctx.organization.id),
        ),
      );
    revalidatePath(`/discovery/${parsedInput.projectId}/requests`);
    return { ok: true };
  });
