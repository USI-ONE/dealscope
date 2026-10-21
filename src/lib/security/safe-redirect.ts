/**
 * Only same-site paths survive ("/discovery?x=1"). Anything absolute,
 * protocol-relative ("//evil.com", "/\evil.com") or malformed falls back.
 */
export function safeRedirect(target: string | null | undefined, fallback = "/"): string {
  if (!target || typeof target !== "string") return fallback;
  const t = target.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.startsWith("/\\") || /[\u0000-\u001f]/.test(t)) return fallback;
  try {
    const u = new URL(t, "https://local.invalid");
    return u.origin === "https://local.invalid" ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}
