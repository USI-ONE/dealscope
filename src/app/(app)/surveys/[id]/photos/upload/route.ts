/**
 * POST /surveys/[id]/photos/upload
 *
 * Accepts a multipart/form-data upload, stores the file in Vercel
 * Blob, and registers a site_survey_photo row pointing at the public
 * URL. If BLOB_READ_WRITE_TOKEN isn't configured (e.g. local dev or
 * pre-deploy), responds with a structured error so the UI can fall
 * back to URL paste.
 *
 * Multipart fields:
 *   files (one or more File entries)
 *   itemId? (uuid — when the photo documents a specific item)
 *   caption? (string, applied to every uploaded photo)
 */
import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  siteSurveyItems,
  siteSurveyPhotos,
  siteSurveys,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PER_FILE = 25 * 1024 * 1024; // 25 MB — phone photos can be big
const MAX_TOTAL = 100 * 1024 * 1024;

/**
 * Response shape (documented for the client — TS doesn't accept a
 * generic on Response.json so we don't enforce it at the type layer):
 *   ok: true  -> { ok, photos: [{id,url,filename,sizeBytes}], skipped: [{filename,reason}] }
 *   ok: false -> { ok: false, error, configHint? }
 */

export async function POST(
  req: Request,
  ctxArg: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctxArg.params;
  const ctx = await requireContext();

  const survey = await db.query.siteSurveys.findFirst({
    where: and(
      eq(siteSurveys.id, id),
      eq(siteSurveys.organizationId, ctx.organization.id),
    ),
  });
  if (!survey) {
    return Response.json(
      { ok: false, error: "Survey not found" },
      { status: 404 },
    );
  }

  // Configuration check — if BLOB_READ_WRITE_TOKEN isn't set, fail
  // explicitly so the UI surfaces the URL-paste fallback.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      {
        ok: false,
        error:
          "Direct photo upload isn't configured. Paste in a URL from SharePoint / OneDrive / iCloud instead.",
        configHint:
          "Set BLOB_READ_WRITE_TOKEN in the Vercel project to enable direct uploads. Vercel Storage → Blob → New Store generates the token.",
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json(
      { ok: false, error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const itemIdRaw = formData.get("itemId") as string | null;
  const caption = (formData.get("caption") as string | null)?.trim() ?? "";
  const fileEntries = formData.getAll("files");
  const files: File[] = fileEntries.filter(
    (e): e is File => e instanceof File && e.size > 0,
  );

  if (files.length === 0) {
    return Response.json(
      { ok: false, error: "No files in upload" },
      { status: 400 },
    );
  }

  // If an itemId is specified, validate it belongs to the survey.
  if (itemIdRaw) {
    const item = await db.query.siteSurveyItems.findFirst({
      where: and(
        eq(siteSurveyItems.id, itemIdRaw),
        eq(siteSurveyItems.surveyId, survey.id),
      ),
    });
    if (!item) {
      return Response.json(
        { ok: false, error: "Item not found on this survey" },
        { status: 400 },
      );
    }
  }

  const skipped: Array<{ filename: string; reason: string }> = [];
  const stored: Array<{
    id: string;
    url: string;
    filename: string;
    sizeBytes: number;
  }> = [];
  let total = 0;

  for (const f of files) {
    if (f.size > MAX_PER_FILE) {
      skipped.push({
        filename: f.name,
        reason: `File too large (${(f.size / 1024 / 1024).toFixed(1)} MB; ${(MAX_PER_FILE / 1024 / 1024).toFixed(0)} MB max).`,
      });
      continue;
    }
    if (total + f.size > MAX_TOTAL) {
      skipped.push({
        filename: f.name,
        reason: `Combined upload exceeded ${(MAX_TOTAL / 1024 / 1024).toFixed(0)} MB.`,
      });
      continue;
    }
    if (!f.type.startsWith("image/")) {
      skipped.push({
        filename: f.name,
        reason: `Not an image (mime: ${f.type || "unknown"}).`,
      });
      continue;
    }
    total += f.size;

    // Path: org/survey/<uuid>-<sanitized-filename>
    const safeName = f.name.replace(/[^A-Za-z0-9._-]+/g, "-");
    const key = `surveys/${ctx.organization.id}/${survey.id}/${crypto.randomUUID()}-${safeName}`;

    let blobUrl: string;
    try {
      const blob = await put(key, f, { access: "public" });
      blobUrl = blob.url;
    } catch (err) {
      skipped.push({
        filename: f.name,
        reason:
          err instanceof Error
            ? `Upload failed: ${err.message}`
            : "Upload failed",
      });
      continue;
    }

    const [photo] = await db
      .insert(siteSurveyPhotos)
      .values({
        organizationId: ctx.organization.id,
        surveyId: survey.id,
        itemId: itemIdRaw ?? null,
        url: blobUrl,
        filename: f.name,
        mimeType: f.type,
        sizeBytes: f.size,
        caption: caption || null,
        uploadedByMembershipId: ctx.membership.id,
        uploadedAt: new Date(),
      })
      .returning();
    stored.push({
      id: photo.id,
      url: photo.url,
      filename: photo.filename ?? f.name,
      sizeBytes: photo.sizeBytes ?? f.size,
    });
  }

  return Response.json({
    ok: true,
    photos: stored,
    skipped,
  });
}

