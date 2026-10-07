/**
 * GET /surveys/[id]/photos/[photoId]
 *
 * Streams an uploaded survey photo from the PRIVATE Vercel Blob store to
 * a signed-in member of the owning org. Pasted-in external URLs aren't
 * proxied — the gallery links to those directly.
 */
import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSurveyPhotos } from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctxArg: { params: Promise<{ id: string; photoId: string }> },
): Promise<Response> {
  const { id, photoId } = await ctxArg.params;
  const ctx = await requireContext();
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return new Response("Not found", { status: 404 });

  const photo = await db.query.siteSurveyPhotos.findFirst({
    where: and(
      eq(siteSurveyPhotos.id, photoId),
      eq(siteSurveyPhotos.surveyId, id),
      eq(siteSurveyPhotos.organizationId, ctx.organization.id),
    ),
    columns: { url: true, mimeType: true },
  });
  if (!photo) return new Response("Not found", { status: 404 });

  const result = await get(photo.url, {
    access: "private",
    ifNoneMatch: req.headers.get("if-none-match") ?? undefined,
  });
  if (!result) return new Response("Not found", { status: 404 });
  if (result.statusCode === 304) return new Response(null, { status: 304 });

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || photo.mimeType || "image/jpeg",
      "Content-Length": String(result.blob.size),
      ETag: result.blob.etag,
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
