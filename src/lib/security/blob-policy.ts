/**
 * Blob upload/serve policy. Uploaded files are never trusted for their
 * type or location: pathnames must stay inside the caller's prefix, a
 * registered URL must point exactly at that pathname, and proxies serve a
 * type from an allow-list with headers that stop the browser running it.
 */

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"] as const;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
};

export function isAllowedImage(type: string | null | undefined): boolean {
  return !!type && (IMAGE_TYPES as readonly string[]).includes(type.toLowerCase().split(";")[0].trim());
}

export function imageExtension(type: string): string {
  return EXT[type.toLowerCase()] ?? "jpg";
}

/** A blob pathname that stays inside `prefix` (no traversal, query or fragment tricks). */
export function isOwnPath(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) return false;
  if (/(^|\/)\.\.?(\/|$)|\\|\/\/|[?#%]/.test(pathname)) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(pathname);
}

/** True when `url` is exactly the Vercel Blob object for `pathname`. */
export function urlMatchesPathname(url: string, pathname: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".blob.vercel-storage.com") &&
      !u.search &&
      !u.hash &&
      decodeURIComponent(u.pathname) === `/${pathname}`
    );
  } catch {
    return false;
  }
}

/**
 * Headers for streaming a stored file back to the browser. Images on the
 * allow-list render inline; everything else downloads. `sandbox` + nosniff
 * keep a smuggled HTML/SVG file from running on our origin.
 */
export function blobResponseHeaders(opts: { contentType: string | null | undefined; filename?: string; size?: number }) {
  const type = (opts.contentType ?? "").toLowerCase().split(";")[0].trim();
  const inlineImage = isAllowedImage(type);
  const h: Record<string, string> = {
    "Content-Type": inlineImage ? type : type === "application/pdf" ? "application/pdf" : "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  };
  if (!inlineImage && type !== "application/pdf") h["Content-Disposition"] = contentDisposition("attachment", opts.filename ?? "download");
  else if (opts.filename) h["Content-Disposition"] = contentDisposition("inline", opts.filename);
  if (opts.size != null) h["Content-Length"] = String(opts.size);
  return h;
}

/** RFC 6266 Content-Disposition that survives quotes, semicolons and non-ASCII names. */
export function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const clean = filename.replace(/[\r\n"\\;]/g, "_").slice(0, 180) || "download";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
