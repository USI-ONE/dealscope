import { upload } from "@vercel/blob/client";
import { registerDiscoveryPhoto } from "@/server/actions/discovery";
import { processImage } from "./image";

/**
 * Online-only photo upload for flows that need the photo on the server
 * right away (AI topology extraction). Regular capture goes through the
 * offline outbox instead.
 */
export async function uploadPhotoNow(
  file: Blob,
  opts: { projectId: string; pathPrefix: string; sectionKey: string; caption?: string },
): Promise<string> {
  const img = await processImage(file);
  const photoId = crypto.randomUUID();
  const ext = img.mimeType === "image/png" ? "png" : "jpg";
  const res = await upload(`${opts.pathPrefix}${photoId}.${ext}`, img.blob, {
    access: "public",
    handleUploadUrl: "/api/discovery/upload",
    clientPayload: JSON.stringify({ projectId: opts.projectId }),
    contentType: img.mimeType,
  });
  const r = await registerDiscoveryPhoto({
    projectId: opts.projectId,
    photoId,
    url: res.url,
    pathname: res.pathname,
    sectionKey: opts.sectionKey,
    mimeType: img.mimeType,
    sizeBytes: img.blob.size,
    widthPx: img.width,
    heightPx: img.height,
    caption: opts.caption ?? null,
    takenAt: new Date().toISOString(),
  });
  if (r?.serverError) throw new Error(r.serverError);
  return photoId;
}
