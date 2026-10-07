/**
 * GET /discovery/[id]/photo/[photoId]
 *
 * Discovery photos live in a PRIVATE Vercel Blob store (they show alarm
 * panels, door hardware, server rooms). Browsers never get a blob URL;
 * every image is streamed through this org-scoped, signed-in route.
 */
import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { discoveryPhotos } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctxArg: { params: Promise<{ id: string; photoId: string }> },
): Promise<Response> {
  const { id, photoId } = await ctxArg.params;
  const ctx = await requireRole("member");
  if (!/^[0-9a-f-]{36}$/i.test(photoId)) return new Response("Not found", { status: 404 });

  const photo = await db.query.discoveryPhotos.findFirst({
    where: and(
      eq(discoveryPhotos.id, photoId),
      eq(discoveryPhotos.projectId, id),
      eq(discoveryPhotos.organizationId, ctx.organization.id),
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
      // Photos are immutable (new photo = new id); keep them in the
      // browser cache but never in a shared/CDN cache.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
