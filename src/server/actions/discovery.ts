"use server";

/**
 * Pre-install discovery actions.
 *
 * Capture writes (answers, records, photos) are idempotent upserts keyed
 * by natural keys / client-generated ids so the device outbox can replay
 * them after a dropped connection without duplicating anything.
 *
 * Photo bytes never pass through these actions — the phone uploads
 * straight to Vercel Blob (see /api/discovery/upload) and then registers
 * the resulting URL here.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { z } from "zod";
import { db } from "@/db";
import {
  clients,
  diligenceEngagements,
  discoveryAnswers,
  discoveryPhotos,
  discoveryProjects,
  discoveryRecords,
} from "@/db/schema";
import { getTemplate, templateIndex } from "@/lib/discovery/templates";
import { photoPathPrefix } from "@/lib/discovery/paths";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

async function assertProject(projectId: string, organizationId: string) {
  const p = await db.query.discoveryProjects.findFirst({
    where: and(
      eq(discoveryProjects.id, projectId),
      eq(discoveryProjects.organizationId, organizationId),
    ),
  });
  if (!p) throw new PublicError("Discovery project not found");
  return p;
}

/** First capture on a planning project flips it to in-progress. */
async function touchProject(p: typeof discoveryProjects.$inferSelect) {
  if (p.status === "planning") {
    await db
      .update(discoveryProjects)
      .set({ status: "in_progress", startedAt: p.startedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(discoveryProjects.id, p.id));
  } else {
    await db
      .update(discoveryProjects)
      .set({ updatedAt: new Date() })
      .where(eq(discoveryProjects.id, p.id));
  }
}

/* ============================================================================
 * PROJECTS
 * ========================================================================== */
const projectSchema = z.object({
  name: z.string().trim().min(2).max(200),
  clientId: z.string().uuid().optional().nullable(),
  engagementId: z.string().uuid().optional().nullable(),
  siteAddress: z.string().max(500).optional().nullable(),
  scheduledDate: z.string().max(20).optional().nullable(),
  leadMembershipId: z.string().uuid().optional().nullable(),
});

async function validateLinks(
  input: { clientId?: string | null; engagementId?: string | null },
  organizationId: string,
) {
  let clientName: string | null = null;
  if (input.clientId) {
    const c = await db.query.clients.findFirst({
      where: and(eq(clients.id, input.clientId), eq(clients.organizationId, organizationId)),
      columns: { name: true },
    });
    if (!c) throw new PublicError("Client not found");
    clientName = c.name;
  }
  if (input.engagementId) {
    const e = await db.query.diligenceEngagements.findFirst({
      where: and(
        eq(diligenceEngagements.id, input.engagementId),
        eq(diligenceEngagements.organizationId, organizationId),
      ),
      columns: { targetCompanyName: true },
    });
    if (!e) throw new PublicError("Engagement not found");
    clientName ??= e.targetCompanyName;
  }
  return { clientName };
}

export const createDiscoveryProject = authedAction
  .schema(projectSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const { clientName } = await validateLinks(parsedInput, ctx.organization.id);

    const [created] = await db
      .insert(discoveryProjects)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name,
        clientId: parsedInput.clientId ?? null,
        engagementId: parsedInput.engagementId ?? null,
        siteAddress: parsedInput.siteAddress?.trim() || null,
        scheduledDate: parsedInput.scheduledDate || null,
        leadMembershipId: parsedInput.leadMembershipId ?? ctx.membership.id,
        createdByMembershipId: ctx.membership.id,
      })
      .returning();

    // Seed the cover section from what we already know so the walker
    // isn't re-typing it on a phone keyboard.
    const seed: Array<[string, string]> = [];
    if (clientName) seed.push(["cover.client_name", clientName]);
    seed.push(["cover.site_name", parsedInput.name]);
    if (parsedInput.siteAddress?.trim()) seed.push(["cover.street", parsedInput.siteAddress.trim()]);
    if (seed.length) {
      await db.insert(discoveryAnswers).values(
        seed.map(([questionKey, v]) => ({
          organizationId: ctx.organization.id,
          projectId: created.id,
          questionKey,
          value: { v },
          answeredByMembershipId: ctx.membership.id,
        })),
      );
    }

    revalidatePath("/discovery");
    return { project: created };
  });

export const updateDiscoveryProject = authedAction
  .schema(projectSchema.partial().extend({ projectId: z.string().uuid(), summary: z.string().max(20_000).optional().nullable() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    await validateLinks(parsedInput, ctx.organization.id);
    await db
      .update(discoveryProjects)
      .set({
        name: parsedInput.name ?? p.name,
        clientId: parsedInput.clientId !== undefined ? parsedInput.clientId : p.clientId,
        engagementId: parsedInput.engagementId !== undefined ? parsedInput.engagementId : p.engagementId,
        siteAddress:
          parsedInput.siteAddress !== undefined ? parsedInput.siteAddress?.trim() || null : p.siteAddress,
        scheduledDate:
          parsedInput.scheduledDate !== undefined ? parsedInput.scheduledDate || null : p.scheduledDate,
        leadMembershipId:
          parsedInput.leadMembershipId !== undefined ? parsedInput.leadMembershipId : p.leadMembershipId,
        summary: parsedInput.summary !== undefined ? parsedInput.summary?.trim() || null : p.summary,
        updatedAt: new Date(),
      })
      .where(eq(discoveryProjects.id, p.id));
    revalidatePath(`/discovery/${p.id}`);
    revalidatePath("/discovery");
    return { ok: true };
  });

export const setDiscoveryStatus = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      to: z.enum(["planning", "in_progress", "review", "complete", "cancelled"]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    await db
      .update(discoveryProjects)
      .set({
        status: parsedInput.to,
        startedAt: parsedInput.to === "in_progress" ? (p.startedAt ?? new Date()) : p.startedAt,
        completedAt: parsedInput.to === "complete" ? new Date() : parsedInput.to === "cancelled" ? p.completedAt : null,
        updatedAt: new Date(),
      })
      .where(eq(discoveryProjects.id, p.id));
    revalidatePath(`/discovery/${p.id}`);
    revalidatePath("/discovery");
    return { ok: true };
  });

export const archiveDiscoveryProject = authedAction
  .schema(z.object({ projectId: z.string().uuid(), archived: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    await db
      .update(discoveryProjects)
      .set({ archivedAt: parsedInput.archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(discoveryProjects.id, p.id));
    revalidatePath("/discovery");
    return { ok: true };
  });

/** Permanently remove a walk: rows cascade from the project; blobs are swept after. */
export const deleteDiscoveryProject = authedAction
  .schema(z.object({ projectId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    const photos = await db
      .select({ url: discoveryPhotos.url })
      .from(discoveryPhotos)
      .where(eq(discoveryPhotos.projectId, p.id));
    await db.delete(discoveryProjects).where(eq(discoveryProjects.id, p.id));
    await deleteBlobs(photos.map((r) => r.url));
    revalidatePath("/discovery");
    return { ok: true };
  });

export const setDiscoverySectionNa = authedAction
  .schema(z.object({ projectId: z.string().uuid(), sectionKey: z.string().max(60), na: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    if (!templateIndex(getTemplate(p.templateKey)).sections.has(parsedInput.sectionKey)) {
      throw new PublicError("Unknown section");
    }
    const next = new Set(p.naSections);
    if (parsedInput.na) next.add(parsedInput.sectionKey);
    else next.delete(parsedInput.sectionKey);
    await db
      .update(discoveryProjects)
      .set({ naSections: [...next], updatedAt: new Date() })
      .where(eq(discoveryProjects.id, p.id));
    revalidatePath(`/discovery/${p.id}`);
    return { ok: true };
  });

/* ============================================================================
 * ANSWERS
 * ========================================================================== */
const scalar = z.union([z.string().max(10_000), z.number(), z.boolean(), z.null()]);
const answerValueSchema = z.object({
  v: z
    .union([
      scalar,
      z.array(z.string().max(500)).max(100),
      // contact / signature objects; signatures carry a PNG data URL
      z.record(z.string().max(300_000)),
    ])
    .optional(),
  extras: z.record(z.union([z.string().max(2_000), z.number(), z.null()])).optional(),
});

export const saveDiscoveryAnswer = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      questionKey: z.string().max(120),
      value: answerValueSchema,
      notApplicable: z.boolean().default(false),
      notes: z.string().max(10_000).nullable().optional(),
      clientUpdatedAt: z.string().datetime().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    if (!templateIndex(getTemplate(p.templateKey)).fields.has(parsedInput.questionKey)) {
      throw new PublicError("Unknown question");
    }
    const clientUpdatedAt = parsedInput.clientUpdatedAt ? new Date(parsedInput.clientUpdatedAt) : new Date();
    const values = {
      value: parsedInput.value,
      notApplicable: parsedInput.notApplicable,
      notes: parsedInput.notes?.trim() || null,
      answeredByMembershipId: ctx.membership.id,
      clientUpdatedAt,
      updatedAt: new Date(),
    };
    await db
      .insert(discoveryAnswers)
      .values({
        organizationId: ctx.organization.id,
        projectId: p.id,
        questionKey: parsedInput.questionKey,
        ...values,
      })
      .onConflictDoUpdate({
        target: [discoveryAnswers.projectId, discoveryAnswers.questionKey],
        set: values,
        // Last writer wins by device edit time, so a stale offline replay
        // can't clobber a newer edit made from another device.
        setWhere: sql`${discoveryAnswers.clientUpdatedAt} IS NULL OR ${discoveryAnswers.clientUpdatedAt} <= ${clientUpdatedAt.toISOString()}`,
      });
    await touchProject(p);
    return { ok: true };
  });

/* ============================================================================
 * RECORDS (repeating inventory rows)
 * ========================================================================== */
export const upsertDiscoveryRecord = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      recordId: z.string().uuid(),
      tableKey: z.string().max(60),
      data: z.record(z.string().max(5_000)),
      sortOrder: z.number().int().optional(),
      clientUpdatedAt: z.string().datetime().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    const table = templateIndex(getTemplate(p.templateKey)).tables.get(parsedInput.tableKey);
    if (!table) throw new PublicError("Unknown table");
    const allowed = new Set(table.table.columns.map((c) => c.key));
    const data = Object.fromEntries(
      Object.entries(parsedInput.data).filter(([k]) => allowed.has(k)),
    );

    const existing = await db.query.discoveryRecords.findFirst({
      where: eq(discoveryRecords.id, parsedInput.recordId),
      columns: { projectId: true },
    });
    if (existing && existing.projectId !== p.id) throw new PublicError("Record belongs to another project");

    const clientUpdatedAt = parsedInput.clientUpdatedAt ? new Date(parsedInput.clientUpdatedAt) : new Date();
    await db
      .insert(discoveryRecords)
      .values({
        id: parsedInput.recordId,
        organizationId: ctx.organization.id,
        projectId: p.id,
        tableKey: parsedInput.tableKey,
        data,
        sortOrder: parsedInput.sortOrder ?? Date.now() % 2_000_000_000,
        createdByMembershipId: ctx.membership.id,
        clientUpdatedAt,
      })
      .onConflictDoUpdate({
        target: discoveryRecords.id,
        set: { data, clientUpdatedAt, updatedAt: new Date() },
        setWhere: sql`${discoveryRecords.clientUpdatedAt} IS NULL OR ${discoveryRecords.clientUpdatedAt} <= ${clientUpdatedAt.toISOString()}`,
      });
    await touchProject(p);
    return { ok: true };
  });

export const deleteDiscoveryRecord = authedAction
  .schema(z.object({ projectId: z.string().uuid(), recordId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    const photos = await db
      .select({ url: discoveryPhotos.url })
      .from(discoveryPhotos)
      .where(and(eq(discoveryPhotos.projectId, p.id), eq(discoveryPhotos.recordId, parsedInput.recordId)));
    await db
      .delete(discoveryRecords)
      .where(and(eq(discoveryRecords.id, parsedInput.recordId), eq(discoveryRecords.projectId, p.id)));
    await deleteBlobs(photos.map((r) => r.url));
    return { ok: true };
  });

/* ============================================================================
 * PHOTOS
 * ========================================================================== */
async function deleteBlobs(urls: string[]) {
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(urls);
  } catch (err) {
    // Orphaned blobs are harmless; never fail the user action over them.
    console.error("discovery: blob delete failed", err);
  }
}

export const registerDiscoveryPhoto = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      photoId: z.string().uuid(),
      url: z.string().url().max(2_000),
      pathname: z.string().max(1_000),
      questionKey: z.string().max(120).nullable().optional(),
      recordId: z.string().uuid().nullable().optional(),
      sectionKey: z.string().max(60).nullable().optional(),
      mimeType: z.string().max(100).optional(),
      sizeBytes: z.number().int().nonnegative().optional(),
      widthPx: z.number().int().positive().optional(),
      heightPx: z.number().int().positive().optional(),
      caption: z.string().max(1_000).nullable().optional(),
      takenAt: z.string().datetime().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);

    // The upload token only allows this prefix, but re-check so a caller
    // can't register an arbitrary URL against the project.
    const prefix = photoPathPrefix(ctx.organization.id, p.id);
    let host = "";
    try {
      host = new URL(parsedInput.url).hostname;
    } catch {
      /* rejected below */
    }
    if (
      !parsedInput.pathname.startsWith(prefix) ||
      !host.endsWith(".blob.vercel-storage.com") ||
      !parsedInput.url.includes(parsedInput.pathname)
    ) {
      throw new PublicError("Photo is not stored under this project");
    }

    const idx = templateIndex(getTemplate(p.templateKey));
    if (parsedInput.questionKey && !idx.fields.has(parsedInput.questionKey)) {
      throw new PublicError("Unknown question");
    }
    if (parsedInput.recordId) {
      const r = await db.query.discoveryRecords.findFirst({
        where: and(eq(discoveryRecords.id, parsedInput.recordId), eq(discoveryRecords.projectId, p.id)),
        columns: { id: true },
      });
      if (!r) throw new PublicError("Record not found");
    }

    await db
      .insert(discoveryPhotos)
      .values({
        id: parsedInput.photoId,
        organizationId: ctx.organization.id,
        projectId: p.id,
        questionKey: parsedInput.questionKey ?? null,
        recordId: parsedInput.recordId ?? null,
        sectionKey: parsedInput.sectionKey ?? null,
        url: parsedInput.url,
        pathname: parsedInput.pathname,
        mimeType: parsedInput.mimeType ?? null,
        sizeBytes: parsedInput.sizeBytes ?? null,
        widthPx: parsedInput.widthPx ?? null,
        heightPx: parsedInput.heightPx ?? null,
        caption: parsedInput.caption?.trim() || null,
        takenAt: parsedInput.takenAt ? new Date(parsedInput.takenAt) : new Date(),
        uploadedByMembershipId: ctx.membership.id,
      })
      .onConflictDoNothing({ target: discoveryPhotos.id });
    await touchProject(p);
    return { ok: true };
  });

export const updateDiscoveryPhoto = authedAction
  .schema(
    z.object({
      projectId: z.string().uuid(),
      photoId: z.string().uuid(),
      caption: z.string().max(1_000).nullable().optional(),
      /** Re-file a photo onto a different question (e.g. from the
       *  general gallery onto a required shot). */
      questionKey: z.string().max(120).nullable().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    const set: Partial<typeof discoveryPhotos.$inferInsert> = { updatedAt: new Date() };
    if (parsedInput.caption !== undefined) set.caption = parsedInput.caption?.trim() || null;
    if (parsedInput.questionKey !== undefined) {
      const field = parsedInput.questionKey
        ? templateIndex(getTemplate(p.templateKey)).fields.get(parsedInput.questionKey)
        : null;
      if (parsedInput.questionKey && !field) throw new PublicError("Unknown question");
      set.questionKey = parsedInput.questionKey;
      set.recordId = null;
      if (field) set.sectionKey = field.sectionKey;
    }
    await db
      .update(discoveryPhotos)
      .set(set)
      .where(and(eq(discoveryPhotos.id, parsedInput.photoId), eq(discoveryPhotos.projectId, p.id)));
    revalidatePath(`/discovery/${p.id}/photos`);
    return { ok: true };
  });

export const deleteDiscoveryPhotos = authedAction
  .schema(z.object({ projectId: z.string().uuid(), photoIds: z.array(z.string().uuid()).min(1).max(200) }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "project");
    const p = await assertProject(parsedInput.projectId, ctx.organization.id);
    const rows = await db
      .delete(discoveryPhotos)
      .where(and(eq(discoveryPhotos.projectId, p.id), inArray(discoveryPhotos.id, parsedInput.photoIds)))
      .returning({ url: discoveryPhotos.url });
    await deleteBlobs(rows.map((r) => r.url));
    revalidatePath(`/discovery/${p.id}/photos`);
    return { ok: true };
  });
