/**
 * Normalizes a phone photo before upload: applies EXIF orientation,
 * downsizes to a sharp-but-sane 2560px long edge, re-encodes as JPEG.
 * Re-encoding also strips EXIF, so GPS coordinates embedded by the
 * camera never leave the device.
 */
const MAX_EDGE = 2560;
const QUALITY = 0.85;

export type ProcessedImage = { blob: Blob; width?: number; height?: number; mimeType: string };

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall back to <img> decode (older Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), "image/jpeg", quality),
  );
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    // Undecodable here (e.g. HEIC on a non-Apple browser) — ship as-is.
    return { blob: file, mimeType: file.type || "image/jpeg" };
  }
  const w = "naturalWidth" in source ? source.naturalWidth : source.width;
  const h = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: file, mimeType: file.type || "image/jpeg", width: w, height: h };
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();
  const blob = await canvasToJpeg(canvas);
  return { blob, width, height, mimeType: "image/jpeg" };
}
