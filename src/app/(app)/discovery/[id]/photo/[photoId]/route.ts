/**
 * GET /discovery/[id]/photo/[photoId][?v=thumb|md]
 *
 * Discovery photos live in a PRIVATE Vercel Blob store (they show alarm
 * panels, door hardware, server rooms). Browsers never get a blob URL;
 * every image is streamed through this org-scoped, signed-in route.
 *
 * `?v=` serves a downsized copy (see lib/discovery/photo-variants), built
 * from the original on first request and stored beside it.
 */
import { get, put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db";
import { discoveryPhotos } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { isPhotoVariant, PHOTO_VARIANTS, variantPath, type PhotoVariant } from "@/lib/discovery/photo-variants";

export const runtime = "nodejs";

// Photos are immutable (new photo = new id); keep them in the browser
// cache but never in a shared/CDN cache.
const CACHE = "private, max-age=2592000, immutable";

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
    columns: { url: true, pathname: true, mimeType: true },
  });
  if (!photo) return new Response("Not found", { status: 404 });

  const v = new URL(req.url).searchParams.get("v");
  if (isPhotoVariant(v)) {
    const res = await serveVariant(req, photo.pathname, v);
    if (res) return res;
    // Variant couldn't be built (e.g. unreadable image) — fall through to the original.
  }

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
      "Cache-Control": CACHE,
    },
  });
}

async function serveVariant(req: Request, pathname: string, v: PhotoVariant): Promise<Response | null> {
  const path = variantPath(pathname, v);
  const cached = await get(path, {
    access: "private",
    ifNoneMatch: req.headers.get("if-none-match") ?? undefined,
  }).catch(() => null);
  if (cached?.statusCode === 304) return new Response(null, { status: 304 });
  if (cached) {
    return new Response(cached.stream, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(cached.blob.size),
        ETag: cached.blob.etag,
        "Cache-Control": CACHE,
      },
    });
  }

  try {
    const original = await get(pathname, { access: "private" });
    if (!original?.stream) return null;
    const input = Buffer.from(await new Response(original.stream).arrayBuffer());
    const { edge, quality } = PHOTO_VARIANTS[v];
    const out = await sharp(input)
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    await put(path, out, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    }).catch((err) => console.error("discovery: variant store failed", err));
    return new Response(new Uint8Array(out), {
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(out.length), "Cache-Control": CACHE },
    });
  } catch (err) {
    console.error("discovery: variant build failed", err);
    return null;
  }
}
