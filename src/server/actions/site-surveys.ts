"use server";

/**
 * Site survey actions — CRUD on surveys + items + photos.
 *
 * Status machine:
 *   planning → in_progress → complete (also any → cancelled)
 *
 * Photos are stored as URLs. The actual file upload happens in the
 * route handler at src/app/(app)/surveys/[id]/photos/upload — this
 * action only registers the stored URL on a survey.
 */
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  clients,
  diligenceEngagements,
  siteSurveyItems,
  siteSurveyPhotos,
  siteSurveys,
} from "@/db/schema";
import { authedAction, authorize, PublicError } from "@/server/safe-action";

async function assertSurvey(surveyId: string, organizationId: string) {
  const s = await db.query.siteSurveys.findFirst({
    where: and(
      eq(siteSurveys.id, surveyId),
      eq(siteSurveys.organizationId, organizationId),
    ),
  });
  if (!s) throw new PublicError("Survey not found");
  return s;
}

/* ============================================================================
 * SURVEY CRUD
 * ========================================================================== */
const surveySchema = z.object({
  name: z.string().min(2).max(200),
  kind: z
    .enum(["loi_diligence", "onboarding", "hardware_audit", "general_site"])
    .default("general_site"),
  engagementId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  clientLocationId: z.string().uuid().optional().nullable(),
  siteAddress: z.string().max(500).optional().nullable(),
  leadTechnicianMembershipId: z.string().uuid().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  performedAt: z.string().optional().nullable(),
  summary: z.string().max(20_000).optional().nullable(),
  notes: z.string().max(50_000).optional().nullable(),
  accompaniedBy: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        role: z.string().max(200).optional(),
        email: z.string().email().max(320).optional(),
      }),
    )
    .max(20)
    .optional(),
});

export const createSiteSurvey = authedAction
  .schema(surveySchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");

    // Validate scope: a survey can attach to a client, an engagement,
    // or BOTH (engagements are commonly tied to a buyer client too).
    let resolvedEngagement: typeof diligenceEngagements.$inferSelect | null =
      null;
    if (parsedInput.engagementId) {
      const eng = await db.query.diligenceEngagements.findFirst({
        where: and(
          eq(diligenceEngagements.id, parsedInput.engagementId),
          eq(diligenceEngagements.organizationId, ctx.organization.id),
        ),
      });
      if (!eng) throw new PublicError("Engagement not found");
      resolvedEngagement = eng;
    }
    if (parsedInput.clientId) {
      const c = await db.query.clients.findFirst({
        where: and(
          eq(clients.id, parsedInput.clientId),
          eq(clients.organizationId, ctx.organization.id),
        ),
      });
      if (!c) throw new PublicError("Client not found");
    }

    // If only engagementId was provided AND that engagement has its own
    // clientId set (the buyer), inherit it onto the survey so the survey
    // is discoverable from the client side too.
    const effectiveClientId =
      parsedInput.clientId ?? resolvedEngagement?.clientId ?? null;

    const [created] = await db
      .insert(siteSurveys)
      .values({
        organizationId: ctx.organization.id,
        name: parsedInput.name.trim(),
        kind: parsedInput.kind,
        status: "planning",
        engagementId: parsedInput.engagementId ?? null,
        clientId: effectiveClientId,
        clientLocationId: parsedInput.clientLocationId ?? null,
        siteAddress: parsedInput.siteAddress?.trim() || null,
        leadTechnicianMembershipId:
          parsedInput.leadTechnicianMembershipId ?? null,
        scheduledDate: parsedInput.scheduledDate || null,
        performedAt: parsedInput.performedAt
          ? new Date(parsedInput.performedAt)
          : null,
        summary: parsedInput.summary?.trim() || null,
        notes: parsedInput.notes?.trim() || null,
        accompaniedBy: parsedInput.accompaniedBy ?? [],
      })
      .returning();
    revalidatePath("/surveys");
    if (parsedInput.clientId)
      revalidatePath(`/clients/${parsedInput.clientId}`);
    if (parsedInput.engagementId)
      revalidatePath(`/diligence/${parsedInput.engagementId}`);
    return { survey: created };
  });

export const updateSiteSurvey = authedAction
  .schema(surveySchema.partial().extend({ surveyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const s = await assertSurvey(parsedInput.surveyId, ctx.organization.id);
    await db
      .update(siteSurveys)
      .set({
        name: parsedInput.name?.trim() ?? s.name,
        kind: parsedInput.kind ?? s.kind,
        clientLocationId:
          parsedInput.clientLocationId !== undefined
            ? parsedInput.clientLocationId
            : s.clientLocationId,
        siteAddress:
          parsedInput.siteAddress !== undefined
            ? parsedInput.siteAddress?.trim() || null
            : s.siteAddress,
        leadTechnicianMembershipId:
          parsedInput.leadTechnicianMembershipId !== undefined
            ? parsedInput.leadTechnicianMembershipId
            : s.leadTechnicianMembershipId,
        scheduledDate:
          parsedInput.scheduledDate !== undefined
            ? parsedInput.scheduledDate || null
            : s.scheduledDate,
        performedAt:
          parsedInput.performedAt !== undefined
            ? parsedInput.performedAt
              ? new Date(parsedInput.performedAt)
              : null
            : s.performedAt,
        summary:
          parsedInput.summary !== undefined
            ? parsedInput.summary?.trim() || null
            : s.summary,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : s.notes,
        accompaniedBy: parsedInput.accompaniedBy ?? s.accompaniedBy,
        updatedAt: new Date(),
      })
      .where(eq(siteSurveys.id, s.id));
    revalidatePath(`/surveys/${s.id}`);
    revalidatePath("/surveys");
    return { ok: true };
  });

export const transitionSurveyStatus = authedAction
  .schema(
    z.object({
      surveyId: z.string().uuid(),
      to: z.enum(["planning", "in_progress", "complete", "cancelled"]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const s = await assertSurvey(parsedInput.surveyId, ctx.organization.id);
    const updates: Record<string, unknown> = {
      status: parsedInput.to,
      updatedAt: new Date(),
    };
    if (parsedInput.to === "in_progress" && !s.performedAt) {
      updates.performedAt = new Date();
    }
    await db.update(siteSurveys).set(updates).where(eq(siteSurveys.id, s.id));
    revalidatePath(`/surveys/${s.id}`);
    revalidatePath("/surveys");
    return { ok: true };
  });

export const deleteSiteSurvey = authedAction
  .schema(z.object({ surveyId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("delete", "client");
    const s = await assertSurvey(parsedInput.surveyId, ctx.organization.id);
    await db.delete(siteSurveys).where(eq(siteSurveys.id, s.id));
    revalidatePath("/surveys");
    return { ok: true };
  });

/* ============================================================================
 * INVENTORY ITEM CRUD
 * ========================================================================== */
const itemKindSchema = z.enum([
  "workstation",
  "laptop",
  "monitor",
  "tablet",
  "phone_handset",
  "voice_gateway",
  "server_physical",
  "server_virtual",
  "storage_array",
  "firewall",
  "router",
  "switch",
  "wireless_ap",
  "wireless_controller",
  "patch_panel",
  "rack",
  "ups",
  "pdu",
  "modem",
  "printer",
  "mfp",
  "scanner",
  "camera",
  "nvr",
  "intercom",
  "tv_signage",
  "projector",
  "speaker_system",
  "pos_terminal",
  "kiosk",
  "specialty_equipment",
  "peripheral_keyboard",
  "peripheral_mouse",
  "peripheral_dock",
  "peripheral_headset",
  "peripheral_other",
  "cabling",
  "other",
]);

const itemSchema = z.object({
  surveyId: z.string().uuid(),
  kind: itemKindSchema,
  label: z.string().min(1).max(300),
  assetTag: z.string().max(120).optional().nullable(),
  hostname: z.string().max(200).optional().nullable(),
  serialNumber: z.string().max(200).optional().nullable(),
  make: z.string().max(120).optional().nullable(),
  model: z.string().max(200).optional().nullable(),
  room: z.string().max(120).optional().nullable(),
  userAssigned: z.string().max(200).optional().nullable(),
  details: z.record(z.string(), z.unknown()).optional(),
  installDate: z.string().optional().nullable(),
  warrantyEnd: z.string().optional().nullable(),
  condition: z
    .enum(["new", "good", "fair", "aging", "eol", "dead", "unknown"])
    .default("unknown"),
  recommendedAction: z
    .enum([
      "keep",
      "monitor",
      "refresh_planned",
      "refresh_now",
      "replace",
      "decommission",
      "investigate",
      "unknown",
    ])
    .default("unknown"),
  remediationCostLowCents: z.number().int().min(0).optional().nullable(),
  remediationCostHighCents: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(20_000).optional().nullable(),
  quantity: z.number().int().min(1).max(10_000).default(1),
  hardwareId: z.string().uuid().optional().nullable(),
});

export const addSurveyItem = authedAction
  .schema(itemSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const s = await assertSurvey(parsedInput.surveyId, ctx.organization.id);
    const [created] = await db
      .insert(siteSurveyItems)
      .values({
        organizationId: ctx.organization.id,
        surveyId: s.id,
        kind: parsedInput.kind,
        label: parsedInput.label.trim(),
        assetTag: parsedInput.assetTag?.trim() || null,
        hostname: parsedInput.hostname?.trim() || null,
        serialNumber: parsedInput.serialNumber?.trim() || null,
        make: parsedInput.make?.trim() || null,
        model: parsedInput.model?.trim() || null,
        room: parsedInput.room?.trim() || null,
        userAssigned: parsedInput.userAssigned?.trim() || null,
        details: parsedInput.details ?? {},
        installDate: parsedInput.installDate || null,
        warrantyEnd: parsedInput.warrantyEnd || null,
        condition: parsedInput.condition,
        recommendedAction: parsedInput.recommendedAction,
        remediationCostLowCents: parsedInput.remediationCostLowCents ?? null,
        remediationCostHighCents: parsedInput.remediationCostHighCents ?? null,
        notes: parsedInput.notes?.trim() || null,
        quantity: parsedInput.quantity,
        hardwareId: parsedInput.hardwareId ?? null,
      })
      .returning();
    revalidatePath(`/surveys/${s.id}`);
    return { item: created };
  });

export const updateSurveyItem = authedAction
  .schema(
    itemSchema
      .partial()
      .extend({
        itemId: z.string().uuid(),
        surveyId: z.string().uuid(),
      }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const s = await assertSurvey(parsedInput.surveyId, ctx.organization.id);
    const item = await db.query.siteSurveyItems.findFirst({
      where: and(
        eq(siteSurveyItems.id, parsedInput.itemId),
        eq(siteSurveyItems.surveyId, s.id),
      ),
    });
    if (!item) throw new PublicError("Item not found");
    await db
      .update(siteSurveyItems)
      .set({
        kind: parsedInput.kind ?? item.kind,
        label: parsedInput.label?.trim() ?? item.label,
        assetTag:
          parsedInput.assetTag !== undefined
            ? parsedInput.assetTag?.trim() || null
            : item.assetTag,
        hostname:
          parsedInput.hostname !== undefined
            ? parsedInput.hostname?.trim() || null
            : item.hostname,
        serialNumber:
          parsedInput.serialNumber !== undefined
            ? parsedInput.serialNumber?.trim() || null
            : item.serialNumber,
        make:
          parsedInput.make !== undefined
            ? parsedInput.make?.trim() || null
            : item.make,
        model:
          parsedInput.model !== undefined
            ? parsedInput.model?.trim() || null
            : item.model,
        room:
          parsedInput.room !== undefined
            ? parsedInput.room?.trim() || null
            : item.room,
        userAssigned:
          parsedInput.userAssigned !== undefined
            ? parsedInput.userAssigned?.trim() || null
            : item.userAssigned,
        details: parsedInput.details ?? item.details,
        installDate:
          parsedInput.installDate !== undefined
            ? parsedInput.installDate || null
            : item.installDate,
        warrantyEnd:
          parsedInput.warrantyEnd !== undefined
            ? parsedInput.warrantyEnd || null
            : item.warrantyEnd,
        condition: parsedInput.condition ?? item.condition,
        recommendedAction:
          parsedInput.recommendedAction ?? item.recommendedAction,
        remediationCostLowCents:
          parsedInput.remediationCostLowCents !== undefined
            ? parsedInput.remediationCostLowCents
            : item.remediationCostLowCents,
        remediationCostHighCents:
          parsedInput.remediationCostHighCents !== undefined
            ? parsedInput.remediationCostHighCents
            : item.remediationCostHighCents,
        notes:
          parsedInput.notes !== undefined
            ? parsedInput.notes?.trim() || null
            : item.notes,
        quantity: parsedInput.quantity ?? item.quantity,
        hardwareId:
          parsedInput.hardwareId !== undefined
            ? parsedInput.hardwareId
            : item.hardwareId,
        updatedAt: new Date(),
      })
      .where(eq(siteSurveyItems.id, item.id));
    revalidatePath(`/surveys/${s.id}`);
    return { ok: true };
  });

export const deleteSurveyItem = authedAction
  .schema(
    z.object({
      itemId: z.string().uuid(),
      surveyId: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const s = await assertSurvey(parsedInput.surveyId, ctx.organization.id);
    await db
      .delete(siteSurveyItems)
      .where(
        and(
          eq(siteSurveyItems.id, parsedInput.itemId),
          eq(siteSurveyItems.surveyId, s.id),
        ),
      );
    revalidatePath(`/surveys/${s.id}`);
    return { ok: true };
  });

/* ============================================================================
 * PHOTO REGISTRATION — the file upload itself happens in the upload
 * route. This action records a photo URL (whether uploaded via the
 * route or pasted in by the user from SharePoint / OneDrive / etc.).
 * ========================================================================== */
const photoSchema = z.object({
  surveyId: z.string().uuid(),
  itemId: z.string().uuid().optional().nullable(),
  url: z.string().url().max(2_000),
  filename: z.string().max(300).optional().nullable(),
  mimeType: z.string().max(120).optional().nullable(),
  sizeBytes: z.number().int().min(0).optional().nullable(),
  widthPx: z.number().int().min(0).optional().nullable(),
  heightPx: z.number().int().min(0).optional().nullable(),
  caption: z.string().max(2_000).optional().nullable(),
  takenAt: z.string().optional().nullable(),
});

export const registerSurveyPhoto = authedAction
  .schema(photoSchema)
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const s = await assertSurvey(parsedInput.surveyId, ctx.organization.id);
    if (parsedInput.itemId) {
      const item = await db.query.siteSurveyItems.findFirst({
        where: and(
          eq(siteSurveyItems.id, parsedInput.itemId),
          eq(siteSurveyItems.surveyId, s.id),
        ),
      });
      if (!item) throw new PublicError("Item not found");
    }
    const [created] = await db
      .insert(siteSurveyPhotos)
      .values({
        organizationId: ctx.organization.id,
        surveyId: s.id,
        itemId: parsedInput.itemId ?? null,
        url: parsedInput.url,
        filename: parsedInput.filename?.trim() || null,
        mimeType: parsedInput.mimeType?.trim() || null,
        sizeBytes: parsedInput.sizeBytes ?? null,
        widthPx: parsedInput.widthPx ?? null,
        heightPx: parsedInput.heightPx ?? null,
        caption: parsedInput.caption?.trim() || null,
        takenAt: parsedInput.takenAt
          ? new Date(parsedInput.takenAt)
          : null,
        uploadedByMembershipId: ctx.membership.id,
        uploadedAt: new Date(),
      })
      .returning();
    revalidatePath(`/surveys/${s.id}`);
    return { photo: created };
  });

export const updateSurveyPhoto = authedAction
  .schema(
    z.object({
      photoId: z.string().uuid(),
      caption: z.string().max(2_000).optional().nullable(),
      itemId: z.string().uuid().optional().nullable(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const photo = await db.query.siteSurveyPhotos.findFirst({
      where: and(
        eq(siteSurveyPhotos.id, parsedInput.photoId),
        eq(siteSurveyPhotos.organizationId, ctx.organization.id),
      ),
    });
    if (!photo) throw new PublicError("Photo not found");
    await db
      .update(siteSurveyPhotos)
      .set({
        caption:
          parsedInput.caption !== undefined
            ? parsedInput.caption?.trim() || null
            : photo.caption,
        itemId:
          parsedInput.itemId !== undefined
            ? parsedInput.itemId
            : photo.itemId,
        updatedAt: new Date(),
      })
      .where(eq(siteSurveyPhotos.id, photo.id));
    revalidatePath(`/surveys/${photo.surveyId}`);
    return { ok: true };
  });

export const deleteSurveyPhoto = authedAction
  .schema(z.object({ photoId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await authorize("update", "client");
    const photo = await db.query.siteSurveyPhotos.findFirst({
      where: and(
        eq(siteSurveyPhotos.id, parsedInput.photoId),
        eq(siteSurveyPhotos.organizationId, ctx.organization.id),
      ),
    });
    if (!photo) throw new PublicError("Photo not found");
    await db.delete(siteSurveyPhotos).where(eq(siteSurveyPhotos.id, photo.id));
    revalidatePath(`/surveys/${photo.surveyId}`);
    return { ok: true };
  });

/* ============================================================================
 * Read helpers
 * ========================================================================== */
export async function listSurveysForClient(
  clientId: string,
  organizationId: string,
) {
  return db
    .select()
    .from(siteSurveys)
    .where(
      and(
        eq(siteSurveys.clientId, clientId),
        eq(siteSurveys.organizationId, organizationId),
      ),
    )
    .orderBy(sql`${siteSurveys.scheduledDate} DESC NULLS LAST`);
}

export async function listSurveysForEngagement(
  engagementId: string,
  organizationId: string,
) {
  return db
    .select()
    .from(siteSurveys)
    .where(
      and(
        eq(siteSurveys.engagementId, engagementId),
        eq(siteSurveys.organizationId, organizationId),
      ),
    )
    .orderBy(sql`${siteSurveys.scheduledDate} DESC NULLS LAST`);
}
