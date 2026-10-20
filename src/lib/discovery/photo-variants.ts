/**
 * Downsized copies of discovery photos.
 *
 * Originals are full-resolution phone shots (~3 MB). Tiles and the viewer
 * ask the photo route for `?v=thumb` / `?v=md`; the route builds the
 * variant on first request and stores it next to the original as
 * `<original pathname>.<variant>.jpg`, so later loads are a small blob read.
 */
export const PHOTO_VARIANTS = {
  thumb: { edge: 480, quality: 72 },
  md: { edge: 1600, quality: 80 },
} as const;

export type PhotoVariant = keyof typeof PHOTO_VARIANTS;

export function isPhotoVariant(v: string | null): v is PhotoVariant {
  return v === "thumb" || v === "md";
}

/** Blob pathname (or URL — same suffix) of a variant. */
export function variantPath(original: string, v: PhotoVariant) {
  return `${original}.${v}.jpg`;
}

/**
 * Point an authenticated photo URL at a variant. Local `blob:` previews
 * (photos still on this device) are already small enough and pass through.
 */
export function photoSrc(url: string, v: PhotoVariant) {
  if (!url.startsWith("/")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${v}`;
}
