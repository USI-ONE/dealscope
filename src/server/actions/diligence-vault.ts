"use server";

import { del } from "@vercel/blob";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { diligenceVaultFiles } from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

export const deleteVaultFile = authedAction
  .schema(z.object({ fileId: z.string().uuid(), engagementId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "diligence");
    const file = await db.query.diligenceVaultFiles.findFirst({
      where: and(
        eq(diligenceVaultFiles.id, parsedInput.fileId),
        eq(diligenceVaultFiles.engagementId, parsedInput.engagementId),
        eq(diligenceVaultFiles.organizationId, ctx.organization.id),
      ),
    });
    if (!file) throw new PublicError("File not found");
    try { await del(file.blobUrl); } catch { /* blob may already be gone */ }
    await db.delete(diligenceVaultFiles).where(eq(diligenceVaultFiles.id, file.id));
    return { ok: true };
  });

export const updateVaultFile = authedAction
  .schema(
    z.object({
      fileId: z.string().uuid(),
      engagementId: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional(),
      track: z.string().nullable().optional(),
      accessTier: z.enum(["private", "shared"]).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "diligence");
    const { fileId, engagementId, ...updates } = parsedInput;
    await db
      .update(diligenceVaultFiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(diligenceVaultFiles.id, fileId),
          eq(diligenceVaultFiles.engagementId, engagementId),
          eq(diligenceVaultFiles.organizationId, ctx.organization.id),
        ),
      );
    return { ok: true };
  });
